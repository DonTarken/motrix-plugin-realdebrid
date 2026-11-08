/**
 * Motrix Real-Debrid Resolver Plugin
 * 
 * Intercepte automatiquement les liens d'hébergeurs supportés ajoutés dans Motrix,
 * les débride via l'API officielle Real-Debrid v1.0, et transmet le lien direct haute vitesse à Aria2.
 * 
 * @author DonTarken
 * @license MIT
 */

import { commands, config, hooks, http, lifecycle, log, notify, storage } from "motrix:plugin-api";

const API_BASE = "https://api.real-debrid.com/rest/1.0";

// Domaines et préfixes à ignorer systématiquement
function shouldSkip(url) {
  if (!url || typeof url !== "string") return true;
  const lower = url.toLowerCase();
  return (
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("file:") ||
    lower.startsWith("magnet:") ||
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("[::1]") ||
    lower.includes("real-debrid.com") ||
    lower.includes("rd-cdn.com") ||
    lower.includes("alldebrid.com") ||
    lower.includes("alldeb.ovh") ||
    lower.includes("debrid.it") ||
    lower.includes("debrid-link.com") ||
    lower.includes("premiumize.me")
  );
}

// Formatage de la date d'expiration ISO / Unix
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

// Calcul des jours restants avant expiration
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

/**
 * Récupération du jeton API Real-Debrid :
 * 1. Depuis les paramètres de l'extension (config.get("apiKey"))
 * 2. Repli éventuel depuis le stockage persistant (storage.get("apiKey"))
 */
async function getApiKey() {
  try {
    const fromConfig = await config.get("apiKey");
    if (fromConfig && typeof fromConfig === "string" && fromConfig.trim()) {
      return fromConfig.trim();
    }
  } catch (e) {
    log.debug("Lecture config impossible", { err: String(e) });
  }

  try {
    const stored = await storage.get("apiKey");
    if (stored && typeof stored === "string" && stored.trim()) {
      return stored.trim();
    }
  } catch (e) {
    log.debug("Lecture storage impossible", { err: String(e) });
  }

  return null;
}

/**
 * Vérification du compte et de l'abonnement Premium via l'API Real-Debrid /user
 */
async function checkAccount(apiKey, triggerNotification = false) {
  if (!apiKey) {
    log.warn("Real-Debrid: Jeton d'API manquant");
    if (triggerNotification) {
      await notify.show({
        title: "Real-Debrid",
        body: "Aucun jeton d'API configuré. Rendez-vous dans Extensions ➔ Real-Debrid Resolver ➔ Paramètres.",
        icon: "warning"
      });
    }
    return null;
  }

  try {
    const res = await http.request({
      method: "GET",
      url: `${API_BASE}/user`,
      headers: [
        { name: "Authorization", value: `Bearer ${apiKey}` }
      ],
      responseType: "text",
      timeoutMs: 10000
    });

    if (res.status === 401 || res.status === 403) {
      log.warn("Real-Debrid: Jeton d'API invalide", { status: res.status });
      if (triggerNotification) {
        await notify.show({
          title: "Real-Debrid — Erreur d'authentification",
          body: "Votre jeton d'API Real-Debrid est invalide ou expiré.",
          icon: "error"
        });
      }
      return null;
    }

    if (res.status !== 200) {
      log.warn("Real-Debrid /user statut HTTP inattendu", { status: res.status });
      if (triggerNotification) {
        await notify.show({
          title: "Real-Debrid — Erreur",
          body: `Échec de communication avec Real-Debrid (HTTP ${res.status})`,
          icon: "error"
        });
      }
      return null;
    }

    const u = JSON.parse(res.body);
    if (u && u.username) {
      const isPremium = u.type === "premium";
      const days = getDaysRemaining(u.expiration);
      const expDate = formatExpiration(u.expiration);

      log.info("Real-Debrid: Compte validé", {
        username: u.username,
        type: u.type,
        daysRemaining: days
      });

      if (triggerNotification) {
        if (isPremium) {
          await notify.show({
            title: "Real-Debrid — Compte Premium Actif",
            body: `Utilisateur : ${u.username} | Expire le ${expDate} (${days} jours restants).`,
            icon: "success"
          });
        } else {
          await notify.show({
            title: "Real-Debrid — Non Premium",
            body: `Compte ${u.username} reconnu, mais l'abonnement Premium a expiré.`,
            icon: "error"
          });
        }
      }
      return u;
    }
  } catch (e) {
    log.error("Real-Debrid /user exception", { err: String(e) });
    if (triggerNotification) {
      await notify.show({
        title: "Real-Debrid — Erreur",
        body: `Impossible de vérifier le compte : ${String(e)}`,
        icon: "error"
      });
    }
  }
  return null;
}

/**
 * Gestion du cache des hébergeurs supportés (/hosts/domains)
 */
let cachedDomains = null;
let lastHostsRefresh = 0;
const HOSTS_CACHE_TTL = 3600000; // 1 heure

async function getSupportedDomains() {
  const now = Date.now();
  if (cachedDomains && (now - lastHostsRefresh < HOSTS_CACHE_TTL)) {
    return cachedDomains;
  }

  try {
    const res = await http.request({
      method: "GET",
      url: `${API_BASE}/hosts/domains`,
      responseType: "text",
      timeoutMs: 8000
    });

    if (res.status === 200 && res.body) {
      const domainsArray = JSON.parse(res.body);
      if (Array.isArray(domainsArray)) {
        const domains = new Set(domainsArray.map(d => String(d).toLowerCase().trim()));
        cachedDomains = domains;
        lastHostsRefresh = now;
        log.info("Real-Debrid: Liste des hébergeurs rafraîchie", { count: domains.size });
        return domains;
      }
    }
  } catch (e) {
    log.warn("Real-Debrid: Échec de récupération de la liste des hébergeurs", { err: String(e) });
  }

  return cachedDomains;
}

function extractHostname(url) {
  if (!url || typeof url !== "string") return "";
  const m = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/);
  if (!m) return "";
  let host = m[1];
  if (host.includes("@")) host = host.split("@").pop();
  if (host.includes(":")) host = host.split(":")[0];
  return host.toLowerCase();
}

function isSupportedHost(url, domains) {
  if (!domains || domains.size === 0) return true;
  const host = extractHostname(url);
  if (!host) return false;
  if (domains.has(host)) return true;
  for (const d of domains) {
    if (host === d || host.endsWith("." + d)) return true;
  }
  return false;
}

/**
 * Débridage d'un lien via /unrestrict/link
 */
async function unrestrictLink(link, apiKey) {
  const postData = `link=${encodeURIComponent(link)}`;

  const res = await http.request({
    method: "POST",
    url: `${API_BASE}/unrestrict/link`,
    headers: [
      { name: "Authorization", value: `Bearer ${apiKey}` },
      { name: "Content-Type", value: "application/x-www-form-urlencoded" }
    ],
    body: {
      type: "string",
      data: postData
    },
    responseType: "text",
    timeoutMs: 15000
  });

  if (res.status === 401 || res.status === 403) {
    log.warn("Real-Debrid: Jeton d'API non autorisé lors de l'unrestrict", { status: res.status });
    return { error: "bad_token", errorCode: res.status };
  }

  if (res.status !== 200) {
    log.warn("Real-Debrid /unrestrict/link statut HTTP non-200", { status: res.status });
    return null;
  }

  try {
    const data = JSON.parse(res.body);
    if (data && data.download) {
      return {
        directUrl: data.download,
        filename: data.filename,
        filesize: data.filesize,
        host: data.host
      };
    }

    if (data && data.error) {
      log.info("Real-Debrid: Lien non débridé", {
        error: data.error,
        code: data.error_code
      });
      return {
        error: data.error,
        errorCode: data.error_code
      };
    }
  } catch (e) {
    log.warn("Real-Debrid: Erreur de parsing réponse unrestrict", { err: String(e) });
  }

  return null;
}

/**
 * Hook principal : beforeCreate
 * Intercepte les nouveaux téléchargements HTTP/HTTPS pour débrider les liens reconnus.
 */
hooks.beforeCreate(async (ctx) => {
  if (ctx.type !== "http") return ctx;

  try {
    const enabled = await config.get("enabled");
    if (enabled === false) {
      log.debug("Real-Debrid: Plugin désactivé par l'utilisateur.");
      return ctx;
    }

    if (!ctx.uris || !Array.isArray(ctx.uris) || ctx.uris.length === 0) {
      return ctx;
    }

    const originalUrl = ctx.uris[0];
    if (shouldSkip(originalUrl)) {
      return ctx;
    }

    const domains = await getSupportedDomains();
    if (domains && !isSupportedHost(originalUrl, domains)) {
      log.debug("Real-Debrid: Domaine non supporté, pas de débridage", { url: originalUrl });
      return ctx;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      log.warn("Real-Debrid: Clé API absente des paramètres");
      try {
        await notify.show({
          title: "Real-Debrid — Configuration requise",
          body: "Veuillez renseigner votre jeton d'API dans Extensions ➔ Real-Debrid Resolver ➔ Paramètres.",
          icon: "warning"
        });
      } catch {}
      return ctx;
    }

    log.info("Real-Debrid: Débridage en cours...", { url: originalUrl });
    const unrestricted = await unrestrictLink(originalUrl, apiKey);

    if (unrestricted && unrestricted.directUrl) {
      log.info("Real-Debrid: Lien débridé avec succès !", {
        directUrl: unrestricted.directUrl,
        filename: unrestricted.filename
      });

      // Remplacement du lien source par le lien direct Real-Debrid
      ctx.update({
        uris: [unrestricted.directUrl]
      });

      const showNotif = await config.get("showNotification");
      if (showNotif !== false) {
        await notify.show({
          title: "Real-Debrid — Téléchargement débridé",
          body: unrestricted.filename
            ? `${unrestricted.filename} est prêt à télécharger en vitesse maximale !`
            : "Lien débridé avec succès.",
          icon: "success"
        });
      }
    } else if (unrestricted && unrestricted.error) {
      log.warn("Real-Debrid: Échec du débridage", { error: unrestricted.error });
      const showNotif = await config.get("showNotification");
      if (showNotif !== false) {
        let msg = "Impossible de débrider ce lien.";
        if (unrestricted.error === "hoster_not_free") {
          msg = "Abonnement Premium requis. Votre compte Real-Debrid est actuellement gratuit ('free').";
        } else if (unrestricted.error === "file_unavailable") {
          msg = "Fichier indisponible ou supprimé chez l'hébergeur.";
        } else if (unrestricted.error === "bad_token") {
          msg = "Jeton d'API Real-Debrid invalide ou expiré.";
        } else if (unrestricted.error === "hoster_unavailable") {
          msg = "Hébergeur temporairement indisponible sur Real-Debrid.";
        } else if (unrestricted.error === "hoster_limit_reached") {
          msg = "Quota de bande passante atteint pour cet hébergeur.";
        }
        await notify.show({
          title: "Real-Debrid — Attention",
          body: msg,
          icon: "warning"
        });
      }
    }
  } catch (err) {
    log.error("Real-Debrid: Exception dans hook beforeCreate", { err: String(err) });
  }

  return ctx;
});

/**
 * Commande manuelle : Vérifier l'état du compte Real-Debrid
 */
commands.register("community.realdebrid-resolver.checkAccount", async () => {
  log.info("Real-Debrid: Commande de vérification de compte invoquée.");
  const apiKey = await getApiKey();
  return await checkAccount(apiKey, true);
});

/**
 * Cycle de vie : Arrêt propre
 */
lifecycle.onDeactivate(async () => {
  log.info("Real-Debrid Resolver désactivé.");
});
