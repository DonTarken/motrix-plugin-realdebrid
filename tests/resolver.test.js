import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
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
  checkAccount
} from "../src/index.js";
import { state, resetMockState } from "./mock-api.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

describe("Strict Hostname Parsing & Exclusions (shouldSkip)", () => {
  it("excludes Real-Debrid domains and other debrid services", () => {
    assert.equal(shouldSkip("https://real-debrid.com/download/file.zip"), true);
    assert.equal(shouldSkip("https://api.real-debrid.com/rest/1.0/endpoint"), true);
    assert.equal(shouldSkip("https://12.download.real-debrid.com/d/123/video.mp4"), true);
    assert.equal(shouldSkip("https://sub.rd-cdn.com/test"), true);
    assert.equal(shouldSkip("https://alldebrid.com/test"), true);
    assert.equal(shouldSkip("https://debrid-link.com/dl"), true);
  });

  it("excludes local addresses, loopback, and IPv6 (with or without ports)", () => {
    assert.equal(shouldSkip("http://localhost/test"), true);
    assert.equal(shouldSkip("http://localhost:8080/file.iso"), true);
    assert.equal(shouldSkip("http://127.0.0.1/test"), true);
    assert.equal(shouldSkip("http://127.0.0.1:3000/api"), true);
    assert.equal(shouldSkip("http://[::1]/download"), true);
    assert.equal(shouldSkip("http://[::1]:8080/file"), true);
  });

  it("handles user credentials in URL (user:pass@host)", () => {
    assert.equal(shouldSkip("http://user:pass@localhost:8080/file"), true);
    assert.equal(shouldSkip("https://john:secret@real-debrid.com/file"), true);
    assert.equal(shouldSkip("https://john:secret@rapidgator.net/file"), false);
  });

  it("does not block false positives where keywords appear in path", () => {
    assert.equal(shouldSkip("https://upstream.com/files/localhost.tar.gz"), false);
    assert.equal(shouldSkip("https://archive.org/data/real-debrid.com_mirror.iso"), false);
    assert.equal(shouldSkip("https://downloads.example.org/127.0.0.1/report.pdf"), false);
  });

  it("does not block false positives where keywords appear in query string", () => {
    assert.equal(shouldSkip("https://rapidgator.net/file/123?ref=real-debrid.com"), false);
    assert.equal(shouldSkip("https://turbobit.net/dl?source=localhost&redirect=1"), false);
    assert.equal(shouldSkip("https://1fichier.com/?token=rd-cdn.com"), false);
  });

  it("does not block deceptive lookalike domains", () => {
    assert.equal(shouldSkip("https://fake-real-debrid.com/file.zip"), false);
    assert.equal(shouldSkip("https://real-debrid.com.attacker.net/payload"), false);
    assert.equal(shouldSkip("https://notlocalhost.org/file"), false);
  });
});

describe("Fail-Closed Policy & Host Validation (isSupportedHost)", () => {
  const sampleDomains = new Set(["rapidgator.net", "1fichier.com", "turbobit.net"]);

  it("fails closed: returns false when host list is missing or empty", () => {
    assert.equal(isSupportedHost("https://rapidgator.net/file/123", null), false);
    assert.equal(isSupportedHost("https://rapidgator.net/file/123", undefined), false);
    assert.equal(isSupportedHost("https://rapidgator.net/file/123", new Set()), false);
    assert.equal(isSupportedHost("https://rapidgator.net/file/123", []), false);
  });

  it("returns true for supported hosts (exact and legitimate subdomains)", () => {
    assert.equal(isSupportedHost("https://rapidgator.net/file/123", sampleDomains), true);
    assert.equal(isSupportedHost("https://dl.rapidgator.net/file/123", sampleDomains), true);
    assert.equal(isSupportedHost("https://sub.sub.1fichier.com/test", sampleDomains), true);
  });

  it("returns false for unsupported hosts and lookalikes", () => {
    assert.equal(isSupportedHost("https://google.com/file", sampleDomains), false);
    assert.equal(isSupportedHost("https://rapidgator.net.evil.org/file", sampleDomains), false);
    assert.equal(isSupportedHost("https://fakerapidgator.net/file", sampleDomains), false);
  });

  it("ensures unsupported URLs are never sent to /unrestrict/link and leave downloads unchanged", async () => {
    resetMockState();
    resetHostsCache();
    state.configStore.set("apiKey", "VALID_KEY_123");
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify(["rapidgator.net"])
    };

    const ctx = {
      type: "http",
      uris: ["https://private-server.org/confidential-archive.zip"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);

    const unrestrictCalls = state.httpRequests.filter(r => r.url.includes("/unrestrict/link"));
    assert.equal(unrestrictCalls.length, 0, "Unsupported URL must NEVER be sent to /unrestrict/link!");
    assert.equal(result.uris[0], "https://private-server.org/confidential-archive.zip");
  });
});

describe("Network Security, Bearer Auth & Diagnostic Sanitization", () => {
  beforeEach(() => {
    resetMockState();
    resetHostsCache();
  });

  it("unrestrictLink uses Authorization: Bearer header and does not expose apikey in body or URL", async () => {
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({
        id: "XYZ123",
        filename: "archive.zip",
        filesize: 1048576,
        link: "https://rapidgator.net/file/123",
        host: "rapidgator.net",
        download: "https://12.download.real-debrid.com/d/XYZ123/archive.zip"
      })
    };

    const secretKey = "SECRET_RD_TOKEN_XYZ";
    const res = await unrestrictLink("https://rapidgator.net/file/123", secretKey);

    assert.ok(res);
    assert.equal(res.directUrl, "https://12.download.real-debrid.com/d/XYZ123/archive.zip");

    assert.equal(state.httpRequests.length, 1);
    const req = state.httpRequests[0];
    assert.equal(req.method, "POST");
    const authHeader = Array.isArray(req.headers)
      ? req.headers.find(h => h.name === "Authorization")?.value
      : req.headers?.Authorization;
    assert.equal(authHeader, `Bearer ${secretKey}`);
    assert.equal(req.url.includes(secretKey), false, "API key must not appear in URL query string");
    const bodyStr = typeof req.body === "object" ? req.body.data : req.body;
    assert.equal(bodyStr.includes(secretKey), false, "API key must not appear in POST body");
  });

  it("never leaks sensitive URLs or tokens in diagnostic logs", async () => {
    state.configStore.set("apiKey", "MY_TOKEN_777");
    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/hosts/domains")) {
        return { status: 200, body: JSON.stringify(["1fichier.com"]) };
      }
      return {
        status: 200,
        body: JSON.stringify({
          download: "https://12.download.real-debrid.com/d/ABC999/ubuntu.iso",
          filename: "ubuntu.iso"
        })
      };
    };

    const sensitiveUrl = "https://1fichier.com/?token=SUPER_CONFIDENTIAL_TOKEN_999";
    const ctx = {
      type: "http",
      uris: [sensitiveUrl],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    await state.beforeCreateHook(ctx);

    for (const logItem of state.logs) {
      const fullLogText = JSON.stringify(logItem);
      assert.equal(
        fullLogText.includes("SUPER_CONFIDENTIAL_TOKEN_999"),
        false,
        "Query tokens must never appear in log entries"
      );
    }
  });

  it("retains previous cache if host refresh fails (fail-closed fallback)", async () => {
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify(["turbobit.net", "1fichier.com"])
    };

    const initialCache = await getSupportedDomains();
    assert.ok(initialCache);
    assert.equal(initialCache.has("turbobit.net"), true);

    state.httpMockResponse = { status: 500, body: "Internal Server Error" };

    const refreshedCache = await getSupportedDomains(true);
    assert.ok(refreshedCache, "Previous cache must be preserved on HTTP 500");
    assert.equal(refreshedCache.has("turbobit.net"), true);
  });

  it("deduplicates concurrent cold-start /hosts/domains refreshes", async () => {
    let callCount = 0;
    state.httpMockResponse = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      return { status: 200, body: JSON.stringify(["1fichier.com", "rapidgator.net"]) };
    };

    const [d1, d2, d3] = await Promise.all([
      getSupportedDomains(),
      getSupportedDomains(),
      getSupportedDomains()
    ]);

    assert.equal(callCount, 1, "Concurrent calls should share one HTTP request");
    assert.equal(d1.size, 2);
    assert.equal(d2, d1);
    assert.equal(d3, d1);
  });

  it("handles request timeouts when fetching hosts list without failing open", async () => {
    state.httpMockResponse = () => {
      const timeoutErr = new Error("Connection timed out");
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    };
    const domains = await getSupportedDomains(true);
    assert.ok(domains === null || domains instanceof Set);
    assert.equal(isSupportedHost("https://unsupported-host.org/test", domains), false);
  });

  it("handles invalid JSON responses from /hosts/domains gracefully without failing open", async () => {
    state.httpMockResponse = {
      status: 200,
      body: "<html>502 Bad Gateway - Not JSON</html>"
    };
    const domains = await getSupportedDomains(true);
    assert.ok(domains === null || domains instanceof Set);
    assert.equal(isSupportedHost("https://unsupported-host.org/test", domains), false);
  });
});

describe("Download Hook Lifecycle & Resilient Fallback (beforeCreate)", () => {
  beforeEach(() => {
    resetMockState();
    resetHostsCache();
  });

  it("successfully unrestricts supported URLs and rewrites ctx.uris (Happy Path)", async () => {
    state.storageStore.set("apiKey", "VALID_KEY_XYZ");

    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/hosts/domains")) {
        return { status: 200, body: JSON.stringify(["rapidgator.net"]) };
      }
      if (opts.url.includes("/unrestrict/link")) {
        return {
          status: 200,
          body: JSON.stringify({
            id: "XYZ789",
            filename: "archive_video.mp4",
            filesize: 104857600,
            link: "https://rapidgator.net/file/123/archive_video.mp4",
            host: "rapidgator.net",
            download: "https://12.download.real-debrid.com/d/XYZ789/archive_video.mp4"
          })
        };
      }
      return { status: 404, body: "{}" };
    };

    const ctx = {
      type: "http",
      uris: ["https://rapidgator.net/file/123/archive_video.mp4"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);

    assert.equal(
      result.uris[0],
      "https://12.download.real-debrid.com/d/XYZ789/archive_video.mp4",
      "Hook must rewrite download URL to Real-Debrid CDN link"
    );
    assert.equal(state.notifications.length, 1, "Success notification must be triggered");
    assert.equal(state.notifications[0].title, "Link unrestricted successfully!");
    assert.equal(state.notifications[0].body, "archive_video.mp4");
  });

  it("bypasses non-http downloads (magnets, torrents) without calling network", async () => {
    state.storageStore.set("apiKey", "VALID_KEY_XYZ");
    const ctx = {
      type: "bittorrent",
      uris: ["magnet:?xt=urn:btih:abcdef1234567890"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);

    assert.equal(state.httpRequests.length, 0, "No network request for bittorrent downloads");
    assert.equal(result.uris[0], "magnet:?xt=urn:btih:abcdef1234567890");
  });

  it("bypasses unrestricting when plugin is disabled via config or SQLite storage", async () => {
    state.storageStore.set("apiKey", "VALID_KEY_XYZ");
    state.storageStore.set("enabled", false);

    const ctx = {
      type: "http",
      uris: ["https://rapidgator.net/file/123"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);
    assert.equal(state.httpRequests.length, 0, "No network request when disabled in storage");
    assert.equal(result.uris[0], "https://rapidgator.net/file/123");

    state.storageStore.delete("enabled");
    state.configStore.set("enabled", false);
    const result2 = await state.beforeCreateHook(ctx);
    assert.equal(state.httpRequests.length, 0, "No network request when disabled in config");
    assert.equal(result2.uris[0], "https://rapidgator.net/file/123");
  });

  it("warns user via valid Motrix notification and aborts task when API key is missing on supported host", async () => {
    state.configStore.delete("apiKey");
    state.storageStore.delete("apiKey");

    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/hosts/domains")) {
        return { status: 200, body: JSON.stringify(["rapidgator.net"]) };
      }
      return { status: 404, body: "{}" };
    };

    const ctx = {
      type: "http",
      uris: ["https://rapidgator.net/file/123"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    await assert.rejects(
      async () => { await state.beforeCreateHook(ctx); },
      /No API key configured/
    );

    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Configuration Required");
    assert.equal(state.notifications[0].icon, "info");
    assert.equal(state.notifications[0].urgency, "normal");
  });

  it("aborts task with localized error notification when Real-Debrid API returns error", async () => {
    state.storageStore.set("apiKey", "FREE_OR_INVALID_KEY");

    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/hosts/domains")) {
        return { status: 200, body: JSON.stringify(["turbobit.net"]) };
      }
      if (opts.url.includes("/unrestrict/link")) {
        return {
          status: 403,
          body: JSON.stringify({ error: "hoster_not_free", error_code: 20 })
        };
      }
      return { status: 404, body: "{}" };
    };

    const ctx = {
      type: "http",
      uris: ["https://turbobit.net/download/abc123.zip"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    await assert.rejects(
      async () => { await state.beforeCreateHook(ctx); },
      /Debriding failed \(hoster_not_free\)/
    );

    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].icon, "error");
    assert.ok(state.notifications[0].body.includes("hoster_not_free"));
  });

  it("maps Real-Debrid REST API error codes cleanly", () => {
    assert.ok(formatUnrestrictError("unavailable_file", "").includes("unavailable"));
    assert.ok(formatUnrestrictError("hoster_unsupported", "").includes("not supported"));
    assert.ok(formatUnrestrictError("hoster_maintenance", "").includes("maintenance"));
    assert.ok(formatUnrestrictError("traffic_exhausted", "").includes("traffic"));
    assert.ok(formatUnrestrictError("unknown_code_xyz", "HTTP error 503").includes("unknown_code_xyz"));
  });

  it("aborts task when Real-Debrid unrestrict request throws network timeout", async () => {
    state.storageStore.set("apiKey", "VALID_KEY");

    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/hosts/domains")) {
        return { status: 200, body: JSON.stringify(["turbobit.net"]) };
      }
      if (opts.url.includes("/unrestrict/link")) {
        const timeoutErr = new Error("Connection timed out");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      }
      return { status: 404, body: "{}" };
    };

    const ctx = {
      type: "http",
      uris: ["https://turbobit.net/download/abc123.zip"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    await assert.rejects(
      async () => { await state.beforeCreateHook(ctx); },
      /Debriding failed \(network_error\)/
    );
  });

  it("respects showNotification: false from storage or config upon successful unrestrict", async () => {
    state.configStore.set("apiKey", "VALID_KEY");
    state.configStore.set("showNotification", false);

    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/hosts/domains")) {
        return { status: 200, body: JSON.stringify(["rapidgator.net"]) };
      }
      return {
        status: 200,
        body: JSON.stringify({
          download: "https://12.download.real-debrid.com/d/XYZ/video.mp4",
          filename: "video.mp4"
        })
      };
    };

    const ctx = {
      type: "http",
      uris: ["https://rapidgator.net/file/xyz"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);
    assert.equal(result.uris[0], "https://12.download.real-debrid.com/d/XYZ/video.mp4");
    assert.equal(state.notifications.length, 0);

    // Verify storage preference overrides when set
    state.configStore.delete("showNotification");
    state.storageStore.set("showNotification", false);
    assert.equal(await getBooleanSetting("showNotification", true), false);
  });
});

describe("Account Status Verification (checkAccount) & Operations UI", () => {
  const sampleKey = "2E6IYTRT5LQVVV7AV6PRX6I5MNLTURH6WW6RP77NXJH3YVXN6TIQ";

  beforeEach(() => {
    resetMockState();
    resetHostsCache();
  });

  it("verifies active premium account, formats date (including +0000), and emits notification", async () => {
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({
        id: 12345,
        username: "tester_pro",
        type: "premium",
        expiration: "2028-06-15T12:00:00+0000"
      })
    };

    const user = await checkAccount("PREMIUM_TOKEN", true);

    assert.ok(user);
    assert.equal(user.username, "tester_pro");
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Premium Active");
    assert.ok(state.notifications[0].body.includes("15/06/2028"));
  });

  it("detects free account and emits valid info notification", async () => {
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({
        id: 54321,
        username: "tester_free",
        type: "free",
        expiration: "2026-11-25T01:18:08.000Z"
      })
    };

    const user = await checkAccount("FREE_TOKEN", true);

    assert.ok(user);
    assert.equal(user.type, "free");
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Non-Premium");
    assert.equal(state.notifications[0].icon, "info");
  });

  it("notifies configuration required when checkAccount runs with empty key", async () => {
    const user = await checkAccount("", true);
    assert.equal(user, null);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Configuration Required");
  });

  it("handles authentication failure (HTTP 401) and network errors distinctly", async () => {
    state.httpMockResponse = { status: 401, body: JSON.stringify({ error: "bad_token" }) };
    const authFail = await verifyAccountDetailed("BAD_KEY");
    assert.equal(authFail.ok, false);
    assert.equal(authFail.reason, "invalidToken");

    state.httpMockResponse = () => { throw new Error("Network unreachable"); };
    const netFail = await verifyAccountDetailed("ANY_KEY");
    assert.equal(netFail.ok, false);
    assert.equal(netFail.reason, "networkError");
  });

  it("runs Motrix Operation (account) to validate key, store preferences, and return summary", async () => {
    const handler = state.registeredOperations.get("community.realdebrid-resolver.account");
    assert.ok(typeof handler === "function", "Operation handler must be registered");

    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({
        id: 1,
        username: "dontarken",
        type: "premium",
        expiration: "2028-01-01T00:00:00.000Z"
      })
    };

    const res = await handler({
      apiKey: sampleKey,
      enabled: true,
      showNotification: false
    });

    assert.equal(state.storageStore.get("apiKey"), sampleKey);
    assert.equal(state.storageStore.get("enabled"), true);
    assert.equal(state.storageStore.get("showNotification"), false);
    assert.equal(res.username, "dontarken");
    assert.equal(res.accountType, "Premium");
    assert.ok(res.expiration.includes("01/01/2028"));
    assert.equal(state.notifications.length, 0, "Respects showNotification: false");

    // Re-running with blank apiKey checks the previously stored key
    const res2 = await handler({
      apiKey: "",
      enabled: false,
      showNotification: true
    });
    assert.equal(state.storageStore.get("enabled"), false);
    assert.equal(res2.status, "Verified using saved token");
    assert.equal(state.notifications.length, 1);
  });

  it("Operation returns structured Motrix operation errors on missing/invalid/network failure", async () => {
    const handler = state.registeredOperations.get("community.realdebrid-resolver.account");

    await assert.rejects(
      async () => { await handler({ apiKey: "", enabled: true, showNotification: true }); },
      /^Error: operation\.error\.missingKey$|^operation\.error\.missingKey$/
    );

    state.httpMockResponse = { status: 401, body: JSON.stringify({ error: "bad_token" }) };
    await assert.rejects(
      async () => { await handler({ apiKey: "BAD_TOKEN_123456789012", enabled: true, showNotification: true }); },
      /operation\.error\.invalidToken/
    );

    state.httpMockResponse = () => { throw new Error("timeout"); };
    await assert.rejects(
      async () => { await handler({ apiKey: "ANY_TOKEN_123456789012", enabled: true, showNotification: true }); },
      /operation\.error\.networkError/
    );
  });

  it("registers and executes legacy checkAccount command", async () => {
    state.storageStore.set("apiKey", "VALID_CMD_TOKEN");
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({
        id: 9999,
        username: "command_user",
        type: "premium",
        expiration: "2027-01-01T00:00:00.000Z"
      })
    };

    const handler = state.registeredCommands.get("community.realdebrid-resolver.checkAccount");
    assert.ok(typeof handler === "function");
    await handler();

    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Premium Active");
  });
});

describe("URL & Authority Parsing Edge Cases (extractHostname)", () => {
  it("extracts bracketed IPv6 hostnames with and without ports", () => {
    assert.equal(extractHostname("http://[2001:db8::1]/path"), "[2001:db8::1]");
    assert.equal(extractHostname("http://[2001:db8::1]:8080/path"), "[2001:db8::1]");
    assert.equal(extractHostname("http://user:pass@[::1]:3000/download"), "[::1]");
  });

  it("returns empty string for empty, null, invalid, or non-hierarchical URLs", () => {
    assert.equal(extractHostname(null), "");
    assert.equal(extractHostname(undefined), "");
    assert.equal(extractHostname(""), "");
    assert.equal(extractHostname("   "), "");
    assert.equal(extractHostname("not-a-valid-url"), "");
    assert.equal(extractHostname("javascript:alert(1)"), "");
  });
});

describe("API Key Setup URLs & SQLite Storage Persistence", () => {
  const sampleKey = "2E6IYTRT5LQVVV7AV6PRX6I5MNLTURH6WW6RP77NXJH3YVXN6TIQ";

  beforeEach(() => {
    resetMockState();
    resetHostsCache();
  });

  it("extracts API key from HTTP setup URLs (including www) and ignores unsupported custom schemes", () => {
    assert.equal(extractKeyFromSetupUrl(`https://real-debrid.com/set-key/${sampleKey}`), sampleKey);
    assert.equal(extractKeyFromSetupUrl(`https://www.real-debrid.com/set-key/${sampleKey}`), sampleKey);
    assert.equal(extractKeyFromSetupUrl(`https://real-debrid.com/?token=${sampleKey}`), sampleKey);
    assert.equal(extractKeyFromSetupUrl(`https://real-debrid.com/?apikey=${sampleKey}`), sampleKey);
    assert.equal(extractKeyFromSetupUrl(`https://real-debrid.com/apitoken?key=${encodeURIComponent(sampleKey)}`), sampleKey);
    assert.equal(extractKeyFromSetupUrl(`rd://${sampleKey}`), null);
    assert.equal(extractKeyFromSetupUrl("https://rapidgator.net/file/123"), null);
  });

  it("reads API key from Motrix wrapped { value, version } storage when config is empty", async () => {
    state.configStore.delete("apiKey");
    state.storageStore.set("apiKey", sampleKey);

    const key = await getApiKey();
    assert.equal(key, sampleKey);
  });

  it("intercepts setup URL in beforeCreate for Premium and Free accounts, saves to storage, and aborts", async () => {
    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/user")) {
        return {
          status: 200,
          body: JSON.stringify({
            username: "johndoe",
            type: "premium",
            expiration: "2027-01-01T00:00:00.000Z"
          })
        };
      }
      return { status: 404, body: "{}" };
    };

    const ctx = {
      type: "http",
      uris: [`https://real-debrid.com/set-key/${sampleKey}`],
      update: () => {}
    };

    await assert.rejects(
      async () => { await state.beforeCreateHook(ctx); },
      /API key saved for johndoe/
    );

    assert.equal(state.storageStore.get("apiKey"), sampleKey);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — API Key Saved");
    assert.equal(state.notifications[0].icon, "success");

    // Free account: notification must clearly note Free plan instead of fake Premium expiration
    resetMockState();
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({ username: "freebie", type: "free", expiration: "2026-11-25T01:00:00Z" })
    };
    await assert.rejects(
      async () => { await state.beforeCreateHook(ctx); },
      /API key saved for freebie/
    );
    assert.equal(state.notifications[0].icon, "info");
    assert.ok(state.notifications[0].body.includes("Free"));
  });

  it("distinguishes invalid key vs network error in setup URL", async () => {
    const ctx = {
      type: "http",
      uris: [`https://real-debrid.com/set-key/${sampleKey}`],
      update: () => {}
    };

    state.httpMockResponse = { status: 401, body: JSON.stringify({ error: "bad_token" }) };
    await assert.rejects(
      async () => { await state.beforeCreateHook(ctx); },
      /Invalid API token/
    );
    assert.equal(state.notifications[0].icon, "error");
    assert.equal(state.storageStore.has("apiKey"), false);

    resetMockState();
    state.httpMockResponse = () => { throw new Error("timeout"); };
    await assert.rejects(
      async () => { await state.beforeCreateHook(ctx); },
      /network error/
    );
  });
});

describe("Manifest & Locales Structural Integrity", () => {
  it("validates motrix-plugin.json fields and complete locale parity across en-US, fr-FR, fr", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "motrix-plugin.json"), "utf8"));
    const enUS = JSON.parse(fs.readFileSync(path.join(rootDir, "locales/en-US.json"), "utf8"));
    const frFR = JSON.parse(fs.readFileSync(path.join(rootDir, "locales/fr-FR.json"), "utf8"));
    const fr = JSON.parse(fs.readFileSync(path.join(rootDir, "locales/fr.json"), "utf8"));

    assert.equal(manifest.id, "community.realdebrid-resolver");
    assert.equal(manifest.version, "1.0.4");
    assert.equal(manifest.activationEvents.includes("onStartup"), false);
    assert.ok(manifest.contributes.operations?.items?.length === 1);

    const enKeys = Object.keys(enUS).sort();
    const frFRKeys = Object.keys(frFR).sort();
    const frKeys = Object.keys(fr).sort();

    assert.deepEqual(frFRKeys, enKeys, "fr-FR.json must match en-US.json keys");
    assert.deepEqual(frKeys, enKeys, "fr.json must match en-US.json keys");

    // Verify every %placeholder% in manifest exists in en-US.json
    const walk = (node) => {
      if (typeof node === "string") {
        const m = /^%([^%]+)%$/.exec(node);
        if (m) assert.ok(Object.hasOwn(enUS, m[1]), `Missing locale key for placeholder ${node}`);
      } else if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (node && typeof node === "object") {
        Object.values(node).forEach(walk);
      }
    };
    walk(manifest);
  });
});
