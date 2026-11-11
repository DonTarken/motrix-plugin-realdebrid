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

// Retrieve API Token from configuration
async function getApiKey() {
  try {
    const key = await config.get("apiKey");
    if (typeof key === "string" && key.trim().length > 0) {
      return key.trim();
    }
  } catch {}
  return "";
}

// Check Real-Debrid account status via /rest/1.0/user
async function checkAccount(apiKey, triggerNotification = false) {
  if (!apiKey) return null;

  try {
    const res = await http.request({
      method: "GET",
      url: `${API_BASE}/user`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
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

  const res = await http.request({
    method: "POST",
    url: `${API_BASE}/unrestrict/link`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
    responseType: "text",
    timeoutMs: 15000,
  });

  if (res.status !== 200) {
    let errorCode = `HTTP_${res.status}`;
    try {
      const errJson = JSON.parse(res.body);
      if (errJson.error) errorCode = errJson.error;
    } catch {}
    log.info("Real-Debrid: Link could not be unrestricted", { code: errorCode });
    return null;
  }

  const parsed = JSON.parse(res.body);
  if (parsed.download) {
    return {
      directUrl: parsed.download,
      filename: parsed.filename,
      filesize: parsed.filesize,
      host: parsed.host,
    };
  }

  if (parsed.error) {
    log.info("Real-Debrid: Link could not be unrestricted", {
      code: parsed.error,
      message: parsed.message,
    });
  }

  return null;
}

/**
 * beforeCreate hook: intercept and rewrite download link
 */
hooks.beforeCreate(async (ctx) => {
  if (ctx.type !== "http") return ctx;

  const originalUrl = ctx.uris?.[0];
  if (!originalUrl || shouldSkip(originalUrl)) return ctx;

  const enabled = await config.get("enabled");
  if (enabled === false) return ctx;

  const apiKey = await getApiKey();
  if (!apiKey) {
    log.warn("Real-Debrid: No API key configured.");
    try {
      await notify.show({
        title: t("notif.configRequired.title"),
        body: t("notif.configRequired.body"),
        icon: "warning",
        urgency: "low",
      });
    } catch {}
    return ctx;
  }

  try {
    const domains = await getSupportedDomains();
    if (!isSupportedHost(originalUrl, domains)) {
      log.debug("Real-Debrid: Unsupported host, skipping", {
        host: extractHostname(originalUrl),
      });
      return ctx;
    }

    log.info("Real-Debrid: Unrestricting link...", {
      host: extractHostname(originalUrl),
    });
    const result = await unrestrictLink(originalUrl, apiKey);

    if (result && result.directUrl) {
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
    }
  } catch (err) {
    log.error("Real-Debrid: Unexpected error", { err: String(err) });
  }

  return ctx;
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
  checkAccount,
};
