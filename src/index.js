/**
 * Motrix Real-Debrid Resolver Plugin
 *
 * Automatically intercepts supported host links added to Motrix,
 * resolves them via the official Real-Debrid REST API v1.0, and passes
 * the high-speed direct download link to Aria2.
 *
 * @author DonTarken
 * @license MIT
 */

import {
  commands,
  config,
  hooks,
  http,
  i18n,
  lifecycle,
  log,
  notify,
  storage,
} from "motrix:plugin-api";

const API_BASE = "https://api.real-debrid.com/rest/1.0";

// Real-Debrid domains & other debrid services excluded from unrestricting
const EXCLUDED_HOSTS = [
  "real-debrid.com",
  "rd-cdn.com",
  "alldebrid.com",
  "alldeb.ovh",
  "debrid.it",
  "debrid-link.com",
  "premiumize.me",
  "localhost",
  "127.0.0.1",
  "[::1]",
];

// Motrix beforeCreate series hook limit is 10,000 ms; keep HTTP timeouts below it
const HOSTS_TIMEOUT_MS = 3500;
const UNRESTRICT_TIMEOUT_MS = 5500;
const USER_TIMEOUT_MS = 7000;

const VALID_NOTIFY_ICONS = new Set(["info", "success", "error"]);
const VALID_NOTIFY_URGENCY = new Set(["low", "normal", "critical"]);

// Helper to translate notification texts via Motrix's i18n module
function t(key, params) {
  try {
    if (typeof i18n?.t === "function") {
      return i18n.t(key, params);
    }
  } catch {}
  return key;
}

// Safely emit a Motrix notification conforming to Host Zod schema
async function safeNotify(opts) {
  const icon = VALID_NOTIFY_ICONS.has(opts?.icon) ? opts.icon : "info";
  const urgency = VALID_NOTIFY_URGENCY.has(opts?.urgency)
    ? opts.urgency
    : "normal";

  try {
    await notify.show({
      ...(opts?.id ? { id: String(opts.id) } : {}),
      title: String(opts?.title ?? "Real-Debrid"),
      body: String(opts?.body ?? ""),
      icon,
      urgency,
    });
  } catch (err) {
    log.warn("Real-Debrid: Failed to show notification", { err: String(err) });
  }
}

// Create an explicit abort error so beforeCreate cancels HTML landing downloads
function createAbortError(message) {
  const err = new Error(message);
  err.isDebridAbort = true;
  return err;
}

// Strict authority extraction following RFC 3986
function extractHostname(url) {
  if (!url || typeof url !== "string") return "";
  const match = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/);
  if (!match) return "";

  let authority = match[1];

  // Strip user credentials (user:pass@host)
  const atIndex = authority.lastIndexOf("@");
  if (atIndex !== -1) {
    authority = authority.slice(atIndex + 1);
  }

  // Handle IPv6 bracketed hosts: [2001:db8::1] or [::1]:8080
  if (authority.startsWith("[")) {
    const bracketEnd = authority.indexOf("]");
    if (bracketEnd !== -1) {
      return authority.slice(0, bracketEnd + 1).toLowerCase();
    }
  }

  // Strip port (:8080)
  const colonIndex = authority.indexOf(":");
  if (colonIndex !== -1) {
    authority = authority.slice(0, colonIndex);
  }

  return authority.trim().toLowerCase();
}

// Strict hostname verification (prevents false positives in path or query)
function shouldSkip(url) {
  if (!url || typeof url !== "string") return true;
  const lower = url.trim().toLowerCase();

  if (
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("file:") ||
    lower.startsWith("magnet:")
  ) {
    return true;
  }

  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return true;
  }

  const host = extractHostname(url);
  if (!host) return true;

  for (const excluded of EXCLUDED_HOSTS) {
    if (host === excluded || host.endsWith("." + excluded)) {
      return true;
    }
  }

  return false;
}

// Parse Real-Debrid date strings safely in QuickJS (normalizes +HHMM to +HH:MM)
function parseDate(exp) {
  if (!exp) return null;
  try {
    const normalized = String(exp)
      .trim()
      .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) {
      return d;
    }
  } catch {}
  return null;
}

// Format expiration date
function formatExpiration(exp) {
  const d = parseDate(exp);
  if (d) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return exp ? String(exp) : "N/A";
}

// Calculate days remaining before expiration
function getDaysRemaining(exp) {
  const d = parseDate(exp);
  if (d) {
    const diff = d.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  return 0;
}

// Motrix StorageCapabilityHost returns { value, version }; tests may return raw primitives
function unwrapStorageValue(stored) {
  if (stored !== null && typeof stored === "object" && Object.hasOwn(stored, "value")) {
    return stored.value;
  }
  return stored;
}

// Retrieve API Token from SQLite storage (working in all builds) or config
async function getApiKey() {
  try {
    const rawStored = await storage.get("apiKey");
    const stored = unwrapStorageValue(rawStored);
    if (typeof stored === "string" && stored.trim().length > 0) {
      const trimmed = stored.trim();
      if (!trimmed.startsWith("box:")) {
        return trimmed;
      }
    }
  } catch {}

  try {
    const key = await config.get("apiKey");
    if (typeof key === "string" && key.trim().length > 0) {
      const trimmed = key.trim();
      if (!trimmed.startsWith("box:")) {
        return trimmed;
      }
    }
  } catch {}

  return "";
}

// Read boolean preference from storage (Operations UI) or config, falling back cleanly
async function getBooleanSetting(key, defaultValue = true) {
  try {
    const rawStored = await storage.get(key);
    const stored = unwrapStorageValue(rawStored);
    if (typeof stored === "boolean") {
      return stored;
    }
  } catch {}

  try {
    const val = await config.get(key);
    if (typeof val === "boolean") {
      return val;
    }
  } catch {}

  return defaultValue;
}

// Extract API key from HTTP setup URLs on real-debrid.com (Motrix rejects custom schemes upstream)
function extractKeyFromSetupUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  try {
    const match = trimmed.match(/^https?:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i);
    if (!match) return null;

    let host = match[1].toLowerCase();
    const colonIdx = host.indexOf(":");
    if (colonIdx !== -1) {
      host = host.slice(0, colonIdx);
    }

    if (
      host !== "real-debrid.com" &&
      host !== "www.real-debrid.com" &&
      host !== "api.real-debrid.com"
    ) {
      return null;
    }

    const pathname = match[2] || "";
    const search = match[3] || "";

    // Path: /set-key/<token> or /setkey/<token>
    const pathMatch = pathname.match(/^\/set-?key\/([A-Za-z0-9_-]{20,})/i);
    if (pathMatch) {
      return pathMatch[1];
    }

    // Query params: ?token=<key>, ?apikey=<key>, ?api_key=<key>, ?key=<key>
    if (search) {
      const params = search.split("&");
      for (const p of params) {
        const eqIdx = p.indexOf("=");
        if (eqIdx === -1) continue;
        const k = p.slice(0, eqIdx).trim().toLowerCase();
        const rawVal = p.slice(eqIdx + 1).trim();
        if (["token", "apikey", "api_key", "key"].includes(k) && rawVal) {
          let decoded = rawVal;
          try {
            decoded = decodeURIComponent(rawVal).trim();
          } catch {}
          if (/^[A-Za-z0-9_-]{20,}$/.test(decoded)) {
            return decoded;
          }
        }
      }
    }
  } catch {}

  return null;
}

// Verify account with full outcome discrimination (network error vs invalid token)
async function verifyAccountDetailed(apiKey) {
  if (!apiKey) {
    return { ok: false, reason: "missingKey", code: "missing_key" };
  }

  try {
    const res = await http.request({
      method: "GET",
      url: `${API_BASE}/user`,
      headers: [{ name: "Authorization", value: `Bearer ${apiKey}` }],
      responseType: "text",
      timeoutMs: USER_TIMEOUT_MS,
    });

    if (res.status === 200 && res.body) {
      const user = JSON.parse(res.body);
      return { ok: true, user };
    }

    let errCode = `HTTP_${res.status}`;
    try {
      const errObj = JSON.parse(res.body);
      if (errObj.error) errCode = errObj.error;
    } catch {}

    log.warn("Real-Debrid /user error", { code: errCode, status: res.status });
    const reason = res.status >= 500 ? "networkError" : "invalidToken";
    return { ok: false, reason, code: errCode, status: res.status };
  } catch (err) {
    log.error("Real-Debrid /user exception", { err: String(err) });
    return {
      ok: false,
      reason: "networkError",
      code: "network_error",
      message: String(err),
    };
  }
}

// Check Real-Debrid account status via /rest/1.0/user
async function checkAccount(apiKey, triggerNotification = false) {
  if (!apiKey) {
    if (triggerNotification) {
      await safeNotify({
        title: t("notif.configRequired.title"),
        body: t("notif.configRequired.body"),
        icon: "info",
        urgency: "normal",
      });
    }
    return null;
  }

  const res = await verifyAccountDetailed(apiKey);
  if (res.ok && res.user) {
    const u = res.user;
    const isPremium = u.type === "premium";
    const expDate = formatExpiration(u.expiration);
    const days = isPremium ? getDaysRemaining(u.expiration) : 0;

    log.info("Real-Debrid: Account verified", {
      type: u.type,
      daysRemaining: days,
    });

    if (triggerNotification) {
      if (isPremium) {
        await safeNotify({
          title: t("notif.account.premium.title"),
          body: t("notif.account.premium.body", {
            username: u.username,
            expDate,
            days,
          }),
          icon: "success",
          urgency: "normal",
        });
      } else {
        await safeNotify({
          title: t("notif.account.nonPremium.title"),
          body: t("notif.account.nonPremium.body", {
            username: u.username,
          }),
          icon: "info",
          urgency: "normal",
        });
      }
    }
    return u;
  }

  if (triggerNotification) {
    if (res.reason === "invalidToken") {
      await safeNotify({
        title: t("notif.account.authError.title"),
        body: t("notif.account.authError.body", {
          code: res.code,
          message: "Authentication failed",
        }),
        icon: "error",
        urgency: "normal",
      });
    } else {
      await safeNotify({
        title: t("notif.error.title"),
        body: t("notif.error.unknown", { err: res.message || res.code }),
        icon: "error",
        urgency: "normal",
      });
    }
  }
  return null;
}

/**
 * Supported hosts cache management (/rest/1.0/hosts/domains)
 */
let cachedDomains = null;
let lastHostsRefresh = 0;
let pendingDomainsFetch = null;
const HOSTS_CACHE_TTL = 3600000; // 1 hour

async function getSupportedDomains(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDomains && now - lastHostsRefresh < HOSTS_CACHE_TTL) {
    return cachedDomains;
  }

  if (pendingDomainsFetch && !forceRefresh) {
    return pendingDomainsFetch;
  }

  const fetchPromise = (async () => {
    try {
      const res = await http.request({
        method: "GET",
        url: `${API_BASE}/hosts/domains`,
        responseType: "text",
        timeoutMs: HOSTS_TIMEOUT_MS,
      });

      if (res.status === 200 && res.body) {
        const domainsArray = JSON.parse(res.body);
        if (Array.isArray(domainsArray)) {
          const domains = new Set();
          for (const d of domainsArray) {
            if (typeof d === "string" && d.trim().length > 0) {
              domains.add(d.trim().toLowerCase());
            }
          }
          cachedDomains = domains;
          lastHostsRefresh = Date.now();
          log.info("Real-Debrid: Refreshed supported hosts list", {
            count: domains.size,
          });
          return domains;
        }
      }
    } catch (e) {
      log.warn("Real-Debrid: Failed to fetch supported hosts list", {
        err: String(e),
      });
    }

    return cachedDomains;
  })();

  pendingDomainsFetch = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    if (pendingDomainsFetch === fetchPromise) {
      pendingDomainsFetch = null;
    }
  }
}

function resetHostsCache() {
  cachedDomains = null;
  lastHostsRefresh = 0;
  pendingDomainsFetch = null;
}

/**
 * Strict fail-closed host check
 */
function isSupportedHost(url, domains) {
  if (!domains || !(domains instanceof Set) || domains.size === 0) {
    return false;
  }

  const host = extractHostname(url);
  if (!host) return false;

  if (domains.has(host)) return true;

  for (const d of domains) {
    if (host.endsWith("." + d)) {
      return true;
    }
  }

  return false;
}

/**
 * Map Real-Debrid REST API error codes to localized messages
 */
function formatUnrestrictError(errorCode, fallbackMessage) {
  switch (errorCode) {
    case "hoster_not_free":
      return t("notif.error.hosterNotFree");
    case "bad_token":
    case "permission_denied":
      return t("notif.error.badToken");
    case "unavailable_file":
    case "file_not_found":
      return t("notif.error.unavailableFile");
    case "hoster_unsupported":
      return t("notif.error.hosterUnsupported");
    case "hoster_maintenance":
    case "service_unavailable":
      return t("notif.error.hosterMaintenance");
    case "traffic_exhausted":
    case "fair_usage_limit":
      return t("notif.error.trafficExhausted");
    default:
      if (fallbackMessage && !fallbackMessage.startsWith("HTTP error")) {
        return `${fallbackMessage} (${errorCode})`;
      }
      return t("notif.error.apiCode", { code: errorCode });
  }
}

/**
 * Unrestrict link via /rest/1.0/unrestrict/link (POST)
 */
async function unrestrictLink(link, apiKey) {
  const postData = `link=${encodeURIComponent(link)}`;

  let res;
  try {
    res = await http.request({
      method: "POST",
      url: `${API_BASE}/unrestrict/link`,
      headers: [
        { name: "Content-Type", value: "application/x-www-form-urlencoded" },
        { name: "Authorization", value: `Bearer ${apiKey}` },
      ],
      body: {
        type: "string",
        data: postData,
      },
      responseType: "text",
      timeoutMs: UNRESTRICT_TIMEOUT_MS,
    });
  } catch (err) {
    log.error("Real-Debrid: Network request failed during unrestrict", {
      err: String(err),
    });
    return { ok: false, error: "network_error", message: String(err) };
  }

  if (res.status !== 200) {
    let errorCode = `HTTP_${res.status}`;
    let errorMessage = "";
    try {
      const errJson = JSON.parse(res.body);
      if (errJson.error) errorCode = errJson.error;
      if (errJson.message) errorMessage = errJson.message;
    } catch {}
    log.warn("Real-Debrid: Link could not be unrestricted", {
      code: errorCode,
      status: res.status,
    });
    return { ok: false, error: errorCode, message: errorMessage };
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return {
      ok: false,
      error: "invalid_response",
      message: "Invalid JSON response",
    };
  }

  if (parsed.download) {
    return {
      ok: true,
      directUrl: parsed.download,
      filename: parsed.filename,
      filesize: parsed.filesize,
      host: parsed.host,
    };
  }

  if (parsed.error) {
    log.warn("Real-Debrid: Link could not be unrestricted", {
      code: parsed.error,
      message: parsed.message,
    });
    return { ok: false, error: parsed.error, message: parsed.message };
  }

  return { ok: false, error: "unknown", message: "No download URL returned" };
}

/**
 * beforeCreate hook: intercept and rewrite download link
 */
hooks.beforeCreate(async (ctx) => {
  if (ctx.type !== "http") return ctx;

  const originalUrl = ctx.uris?.[0];
  if (!originalUrl) return ctx;

  // 1. Optional HTTP setup URL fallback: https://real-debrid.com/set-key/<TOKEN>
  const setupKey = extractKeyFromSetupUrl(originalUrl);
  if (setupKey) {
    log.info("Real-Debrid: Processing API key configuration via setup URL");
    const check = await verifyAccountDetailed(setupKey);
    if (check.ok && check.user) {
      await storage.set("apiKey", setupKey);
      const u = check.user;
      const isPremium = u.type === "premium";
      log.info("Real-Debrid: API key registered successfully in storage", {
        username: u.username,
        type: u.type,
      });
      await safeNotify({
        title: t("notif.keyRegistered.title"),
        body: isPremium
          ? t("notif.keyRegistered.body", {
              username: u.username,
              expDate: formatExpiration(u.expiration),
            })
          : t("notif.keyRegisteredFree.body", { username: u.username }),
        icon: isPremium ? "success" : "info",
        urgency: "normal",
      });
      throw createAbortError(t("err.abort.setupSaved", { username: u.username }));
    }

    if (check.reason === "networkError") {
      await safeNotify({
        title: t("notif.error.title"),
        body: t("notif.error.body", { code: check.code }),
        icon: "error",
        urgency: "normal",
      });
      throw createAbortError(t("err.abort.networkError"));
    }

    log.warn("Real-Debrid: Invalid API key provided in setup URL");
    await safeNotify({
      title: t("notif.configRequired.title"),
      body: t("notif.invalidKey.body"),
      icon: "error",
      urgency: "normal",
    });
    throw createAbortError(t("err.abort.invalidKey"));
  }

  // 2. Standard exclusions (local addresses, magnets, debrid services)
  if (shouldSkip(originalUrl)) return ctx;

  const enabled = await getBooleanSetting("enabled", true);
  if (!enabled) return ctx;

  // 3. Supported host check (fail-closed)
  const domains = await getSupportedDomains();
  if (!isSupportedHost(originalUrl, domains)) {
    log.debug("Real-Debrid: Unsupported host, skipping", {
      host: extractHostname(originalUrl),
    });
    return ctx;
  }

  // 4. Host is supported — an API key is strictly required
  const apiKey = await getApiKey();
  if (!apiKey) {
    log.warn("Real-Debrid: No API key configured for supported host", {
      host: extractHostname(originalUrl),
    });
    await safeNotify({
      title: t("notif.configRequired.title"),
      body: t("notif.configRequired.body"),
      icon: "info",
      urgency: "normal",
    });
    throw createAbortError(t("err.abort.missingKey"));
  }

  try {
    log.info("Real-Debrid: Unrestricting link...", {
      host: extractHostname(originalUrl),
    });
    const result = await unrestrictLink(originalUrl, apiKey);

    if (result && result.ok && result.directUrl) {
      log.info("Real-Debrid: Link unrestricted successfully", {
        host: extractHostname(result.directUrl),
        filename: result.filename,
      });

      ctx.update({
        uris: [result.directUrl],
      });

      const showNotif = await getBooleanSetting("showNotification", true);
      if (showNotif) {
        await safeNotify({
          title: t("notif.unlocked.title"),
          body: result.filename || t("notif.unlocked.body"),
          icon: "success",
          urgency: "low",
        });
      }
      return ctx;
    }

    // Unrestrict failed with an API or network error
    const errorCode = result?.error || "unknown";
    const errorBody = formatUnrestrictError(errorCode, result?.message);

    log.warn(
      "Real-Debrid: Debriding failed, aborting task to avoid HTML file download",
      { code: errorCode }
    );

    await safeNotify({
      title: t("notif.unrestrictFailed.title"),
      body: errorBody,
      icon: "error",
      urgency: "normal",
    });

    throw createAbortError(t("err.abort.unrestrictFailed", { code: errorCode }));
  } catch (err) {
    if (err?.isDebridAbort) {
      throw err;
    }
    log.error("Real-Debrid: Unexpected error", { err: String(err) });
    return ctx;
  }
});

/**
 * Motrix Operations UI handler: configure API key, preferences, and verify account
 */
commands.registerOperation(
  "community.realdebrid-resolver.account",
  async (args) => {
    const enabled =
      typeof args?.enabled === "boolean" ? args.enabled : true;
    const showNotification =
      typeof args?.showNotification === "boolean"
        ? args.showNotification
        : true;

    await storage.set("enabled", enabled);
    await storage.set("showNotification", showNotification);

    const providedKey =
      typeof args?.apiKey === "string" ? args.apiKey.trim() : "";
    const activeKey = providedKey || (await getApiKey());

    if (!activeKey) {
      throw new Error("operation.error.missingKey");
    }

    const check = await verifyAccountDetailed(activeKey);
    if (!check.ok || !check.user) {
      if (check.reason === "networkError") {
        throw new Error("operation.error.networkError");
      }
      throw new Error("operation.error.invalidToken");
    }

    await storage.set("apiKey", activeKey);

    const u = check.user;
    const isPremium = u.type === "premium";
    const expStr = isPremium
      ? `${formatExpiration(u.expiration)} (${getDaysRemaining(u.expiration)}d)`
      : t("op.plan.freeShort");

    if (showNotification) {
      await safeNotify({
        title: isPremium
          ? t("notif.account.premium.title")
          : t("notif.account.nonPremium.title"),
        body: isPremium
          ? t("notif.account.premium.body", {
              username: u.username,
              expDate: formatExpiration(u.expiration),
              days: getDaysRemaining(u.expiration),
            })
          : t("notif.account.nonPremium.body", { username: u.username }),
        icon: isPremium ? "success" : "info",
        urgency: "low",
      });
    }

    return {
      status: t(providedKey ? "op.status.verified" : "op.status.preferencesSaved"),
      username: String(u.username || "unknown"),
      accountType: t(isPremium ? "op.plan.premium" : "op.plan.free"),
      expiration: expStr,
      settings: `Auto-unrestrict: ${enabled ? "ON" : "OFF"} | Notifications: ${showNotification ? "ON" : "OFF"}`,
    };
  }
);

/**
 * Legacy command to check account status programmatically
 */
commands.register("community.realdebrid-resolver.checkAccount", async () => {
  const apiKey = await getApiKey();
  await checkAccount(apiKey, true);
});

lifecycle.onDeactivate(async () => {
  log.info("Real-Debrid Resolver deactivated.");
});

// Exports for automated unit tests
export {
  shouldSkip,
  extractHostname,
  isSupportedHost,
  unrestrictLink,
  getSupportedDomains,
  resetHostsCache,
  getApiKey,
  getBooleanSetting,
  extractKeyFromSetupUrl,
  formatUnrestrictError,
  verifyAccountDetailed,
  checkAccount,
};
