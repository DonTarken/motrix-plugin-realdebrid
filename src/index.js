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

// Helper to translate notification texts via Motrix's i18n module
function t(key, params) {
  try {
    if (typeof i18n?.t === "function") {
      return i18n.t(key, params);
    }
  } catch {}
  return key;
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

// Format expiration date
function formatExpiration(exp) {
  if (!exp) return "N/A";
  try {
    const d = new Date(exp);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch {}
  return String(exp);
}

// Calculate days remaining before expiration
function getDaysRemaining(exp) {
  if (!exp) return 0;
  try {
    const d = new Date(exp);
    if (!isNaN(d.getTime())) {
      const diff = d.getTime() - Date.now();
      return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
  } catch {}
  return 0;
}

// Retrieve API Token from configuration (Settings UI) or SQLite storage
async function getApiKey() {
  // 1. Check configuration (Settings UI)
  try {
    const key = await config.get("apiKey");
    if (typeof key === "string" && key.trim().length > 0) {
      const trimmed = key.trim();
      if (!trimmed.startsWith("box:")) {
        return trimmed;
      }
    }
  } catch {}

  // 2. Check persistent SQLite storage (works across all Motrix builds)
  try {
    const stored = await storage.get("apiKey");
    if (typeof stored === "string" && stored.trim().length > 0) {
      return stored.trim();
    }
    if (stored && typeof stored.value === "string" && stored.value.trim().length > 0) {
      return stored.value.trim();
    }
  } catch {}

  return "";
}

// Extract API key from one-time setup URLs (e.g. rd://<key> or https://real-debrid.com/set-key/<key>)
function extractKeyFromSetupUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // Scheme: rd://<key> or rd://set-key/<key> or rd:key:<key>
  const rdSchemeMatch = trimmed.match(/^rd:(?:\/\/(?:set-key\/)?)?([A-Za-z0-9_-]{20,})/i);
  if (rdSchemeMatch) return rdSchemeMatch[1];

  // HTTP/HTTPS URL on real-debrid domains
  try {
    const match = trimmed.match(/^https?:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i);
    if (!match) return null;
    const host = match[1].toLowerCase();
    if (host !== "real-debrid.com" && host !== "api.real-debrid.com") return null;

    const pathname = match[2] || "";
    const search = match[3] || "";

    // Path /set-key/<key>
    const pathMatch = pathname.match(/^\/set-?key\/([A-Za-z0-9_-]{20,})/i);
    if (pathMatch) return pathMatch[1];

    // Query param ?token=<key> or ?apikey=<key> or ?key=<key>
    if (search) {
      const params = search.split("&");
      for (const p of params) {
        const [k, v] = p.split("=");
        if (["token", "apikey", "api_key", "key"].includes(k?.toLowerCase())) {
          if (v && /^[A-Za-z0-9_-]{20,}$/.test(v)) {
            return decodeURIComponent(v);
          }
        }
      }
    }
  } catch {}

  return null;
}

// Check Real-Debrid account status via /rest/1.0/user
async function checkAccount(apiKey, triggerNotification = false) {
  if (!apiKey) return null;

  try {
    const res = await http.request({
      method: "GET",
      url: `${API_BASE}/user`,
      headers: [
        { name: "Authorization", value: `Bearer ${apiKey}` },
      ],
      responseType: "text",
      timeoutMs: 8000,
    });

    if (res.status === 200 && res.body) {
      const u = JSON.parse(res.body);
      const isPremium = u.type === "premium";
      const expDate = formatExpiration(u.expiration);
      const days = getDaysRemaining(u.expiration);

      log.info("Real-Debrid: Account verified", {
        type: u.type,
        daysRemaining: days,
      });

      if (triggerNotification) {
        if (isPremium) {
          await notify.show({
            title: t("notif.account.premium.title"),
            body: t("notif.account.premium.body", {
              username: u.username,
              expDate,
              days,
            }),
            icon: "success",
          });
        } else {
          await notify.show({
            title: t("notif.account.nonPremium.title"),
            body: t("notif.account.nonPremium.body", {
              username: u.username,
            }),
            icon: "error",
          });
        }
      }
      return u;
    } else {
      let errCode = "HTTP_" + res.status;
      try {
        const errObj = JSON.parse(res.body);
        if (errObj.error) errCode = errObj.error;
      } catch {}
      log.warn("Real-Debrid /user error", { code: errCode });
      if (triggerNotification) {
        await notify.show({
          title: t("notif.account.authError.title"),
          body: t("notif.account.authError.body", {
            code: errCode,
            message: "Authentication failed",
          }),
          icon: "error",
        });
      }
    }
  } catch (e) {
    log.error("Real-Debrid /user exception", { err: String(e) });
    if (triggerNotification) {
      await notify.show({
        title: t("notif.error.title"),
        body: t("notif.error.unknown", { err: String(e) }),
        icon: "error",
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
const HOSTS_CACHE_TTL = 3600000; // 1 hour

async function getSupportedDomains(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDomains && now - lastHostsRefresh < HOSTS_CACHE_TTL) {
    return cachedDomains;
  }

  try {
    const res = await http.request({
      method: "GET",
      url: `${API_BASE}/hosts/domains`,
      responseType: "text",
      timeoutMs: 8000,
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
        lastHostsRefresh = now;
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
}

function resetHostsCache() {
  cachedDomains = null;
  lastHostsRefresh = 0;
}

/**
 * Strict fail-closed host check
 */
function isSupportedHost(url, domains) {
  // Fail-closed: return false if no validated list is available
  if (!domains || !(domains instanceof Set) || domains.size === 0) {
    return false;
  }

  const host = extractHostname(url);
  if (!host) return false;

  // Exact match
  if (domains.has(host)) return true;

  // Dot-boundary suffix matching (e.g. dl.rapidgator.net matches rapidgator.net)
  for (const d of domains) {
    if (host.endsWith("." + d)) {
      return true;
    }
  }

  return false;
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
      timeoutMs: 15000,
    });
  } catch (err) {
    log.error("Real-Debrid: Network request failed during unrestrict", {
      err: String(err),
    });
    return { ok: false, error: "network_error", message: String(err) };
  }

  if (res.status !== 200) {
    let errorCode = `HTTP_${res.status}`;
    let errorMessage = "HTTP error " + res.status;
    try {
      const errJson = JSON.parse(res.body);
      if (errJson.error) errorCode = errJson.error;
      if (errJson.message) errorMessage = errJson.message;
    } catch {}
    log.warn("Real-Debrid: Link could not be unrestricted", { code: errorCode });
    return { ok: false, error: errorCode, message: errorMessage };
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch (err) {
    return { ok: false, error: "invalid_response", message: "Invalid JSON response" };
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

  // 1. One-time setup command URL: paste https://real-debrid.com/set-key/<TOKEN> into Motrix
  const setupKey = extractKeyFromSetupUrl(originalUrl);
  if (setupKey) {
    log.info("Real-Debrid: Processing API key configuration via setup URL");
    const account = await checkAccount(setupKey, false);
    if (account && account.username) {
      await storage.set("apiKey", setupKey);
      log.info("Real-Debrid: API key registered successfully in storage", {
        username: account.username,
      });
      try {
        await notify.show({
          title: t("notif.keyRegistered.title"),
          body: t("notif.keyRegistered.body", {
            username: account.username,
            expDate: formatExpiration(account.expiration),
          }),
          icon: "success",
          urgency: "high",
        });
      } catch {}
      throw new Error(
        `Real-Debrid: Clé API enregistrée avec succès pour ${account.username} ! Téléchargement ignoré.`
      );
    } else {
      log.warn("Real-Debrid: Invalid API key provided in setup URL");
      try {
        await notify.show({
          title: t("notif.configRequired.title"),
          body: t("notif.invalidKey.body"),
          icon: "error",
          urgency: "high",
        });
      } catch {}
      throw new Error("Real-Debrid: Token API Real-Debrid invalide. Téléchargement ignoré.");
    }
  }

  // 2. Standard exclusions (local addresses, magnets, debrid services)
  if (shouldSkip(originalUrl)) return ctx;

  const enabled = await config.get("enabled");
  if (enabled === false) return ctx;

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
    try {
      await notify.show({
        title: t("notif.configRequired.title"),
        body: t("notif.configRequired.body"),
        icon: "warning",
        urgency: "high",
      });
    } catch {}
    throw new Error(
      "Real-Debrid: No API key configured. Task aborted to prevent downloading HTML page."
    );
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

      // Update URIs
      ctx.update({
        uris: [result.directUrl],
      });

      const showNotif = await config.get("showNotification");
      if (showNotif !== false) {
        try {
          await notify.show({
            title: t("notif.unlocked.title"),
            body: result.filename || t("notif.unlocked.body"),
            icon: "success",
            urgency: "low",
          });
        } catch {}
      }
      return ctx;
    }

    // Unrestrict failed with an API error (e.g. hoster_not_free, bad_token, etc.)
    const errorCode = result?.error || "unknown";
    let errorBody = result?.message || errorCode;

    if (errorCode === "hoster_not_free") {
      errorBody = t("notif.error.hosterNotFree");
    } else if (errorCode === "bad_token") {
      errorBody = t("notif.error.badToken");
    }

    log.warn("Real-Debrid: Debriding failed, aborting task to avoid HTML file download", {
      code: errorCode,
      message: errorBody,
    });

    try {
      await notify.show({
        title: t("notif.unrestrictFailed.title"),
        body: errorBody,
        icon: "error",
        urgency: "normal",
      });
    } catch {}

    throw new Error(
      `Real-Debrid: Debriding failed (${errorCode}: ${errorBody}). Task aborted to prevent downloading HTML page.`
    );
  } catch (err) {
    // If it's our own intentional error aborting the task, rethrow so Motrix aborts it
    if (String(err).includes("Real-Debrid:")) {
      throw err;
    }
    log.error("Real-Debrid: Unexpected error", { err: String(err) });
    return ctx;
  }
});

/**
 * Manual command to check account status
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
  extractKeyFromSetupUrl,
  checkAccount,
};
