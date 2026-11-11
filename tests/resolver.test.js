import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  shouldSkip,
  extractHostname,
  isSupportedHost,
  unrestrictLink,
  getSupportedDomains,
  resetHostsCache,
  getApiKey,
  checkAccount
} from "../src/index.js";
import { state, resetMockState } from "./mock-api.mjs";

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
    // Mock /hosts/domains with only rapidgator
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

    // Verify /unrestrict/link was NEVER called
    const unrestrictCalls = state.httpRequests.filter(r => r.url.includes("/unrestrict/link"));
    assert.equal(unrestrictCalls.length, 0, "Unsupported URL must NEVER be sent to /unrestrict/link!");
    assert.equal(result.uris[0], "https://private-server.org/confidential-archive.zip", "Original URL must remain untouched");
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

    // Check HTTP request details
    assert.equal(state.httpRequests.length, 1);
    const req = state.httpRequests[0];
    assert.equal(req.method, "POST");
    assert.equal(req.headers?.Authorization, `Bearer ${secretKey}`);
    assert.equal(req.url.includes(secretKey), false, "API key must not appear in URL query string");
    assert.equal(req.body.includes(secretKey), false, "API key must not appear in POST body");
  });

  it("never leaks sensitive URLs or tokens in diagnostic logs", async () => {
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({
        id: "ABC999",
        filename: "ubuntu.iso",
        download: "https://12.download.real-debrid.com/d/ABC999/ubuntu.iso"
      })
    };

    state.configStore.set("apiKey", "MY_TOKEN_777");
    // Mock /hosts/domains to include 1fichier
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

    // Verify logs do NOT contain the full URL or token
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
    // First call: successful response with 2 hosts
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify(["turbobit.net", "1fichier.com"])
    };

    const initialCache = await getSupportedDomains();
    assert.ok(initialCache);
    assert.equal(initialCache.has("turbobit.net"), true);

    // Second call: simulated network failure (500 or timeout) with forced refresh
    state.httpMockResponse = { status: 500, body: "Internal Server Error" };

    // Previous cache must be retained if refresh fails
    const refreshedCache = await getSupportedDomains(true);
    assert.ok(refreshedCache, "Previous cache must be preserved on HTTP 500");
    assert.equal(refreshedCache.has("turbobit.net"), true);
  });

  it("handles request timeouts when fetching hosts list without failing open", async () => {
    state.httpMockResponse = () => {
      const timeoutErr = new Error("Connection timed out after 8000ms");
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
    state.configStore.set("apiKey", "VALID_KEY_XYZ");

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
    state.configStore.set("apiKey", "VALID_KEY_XYZ");
    const ctx = {
      type: "bittorrent",
      uris: ["magnet:?xt=urn:btih:abcdef1234567890"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);

    assert.equal(state.httpRequests.length, 0, "No network request for bittorrent downloads");
    assert.equal(result.uris[0], "magnet:?xt=urn:btih:abcdef1234567890");
  });

  it("bypasses unrestricting when plugin is disabled in config", async () => {
    state.configStore.set("apiKey", "VALID_KEY_XYZ");
    state.configStore.set("enabled", false);

    const ctx = {
      type: "http",
      uris: ["https://rapidgator.net/file/123"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);

    assert.equal(state.httpRequests.length, 0, "No network request when plugin is disabled");
    assert.equal(result.uris[0], "https://rapidgator.net/file/123");
  });

  it("warns user via notification when API key is missing and preserves original download", async () => {
    state.configStore.delete("apiKey");

    const ctx = {
      type: "http",
      uris: ["https://rapidgator.net/file/123"],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);

    assert.equal(state.httpRequests.length, 0, "No network request when API key is missing");
    assert.equal(result.uris[0], "https://rapidgator.net/file/123");
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Configuration Required");
  });

  it("falls back gracefully when Real-Debrid API returns error (free account, bad token, dead link)", async () => {
    state.configStore.set("apiKey", "FREE_OR_INVALID_KEY");

    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/hosts/domains")) {
        return { status: 200, body: JSON.stringify(["turbobit.net"]) };
      }
      if (opts.url.includes("/unrestrict/link")) {
        return {
          status: 403,
          body: JSON.stringify({ error: "bad_token", error_code: 8 })
        };
      }
      return { status: 404, body: "{}" };
    };

    const originalUrl = "https://turbobit.net/download/abc123.zip";
    const ctx = {
      type: "http",
      uris: [originalUrl],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);

    assert.equal(result.uris[0], originalUrl, "Original URL must remain untouched on API error");
    assert.equal(state.notifications.length, 0, "No success notification should be emitted");
    assert.ok(
      state.logs.some(l => l.msg.includes("could not be unrestricted")),
      "Diagnostic log should record the unrestrict failure"
    );
  });

  it("falls back gracefully when Real-Debrid unrestrict request throws network timeout", async () => {
    state.configStore.set("apiKey", "VALID_KEY");

    state.httpMockResponse = (opts) => {
      if (opts.url.includes("/hosts/domains")) {
        return { status: 200, body: JSON.stringify(["turbobit.net"]) };
      }
      if (opts.url.includes("/unrestrict/link")) {
        const timeoutErr = new Error("Connection timed out after 15000ms");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      }
      return { status: 404, body: "{}" };
    };

    const originalUrl = "https://turbobit.net/download/abc123.zip";
    const ctx = {
      type: "http",
      uris: [originalUrl],
      update: (patch) => { Object.assign(ctx, patch); }
    };

    const result = await state.beforeCreateHook(ctx);

    assert.equal(result.uris[0], originalUrl, "Original URL must remain untouched on timeout");
  });

  it("respects showNotification: false config setting upon successful unrestrict", async () => {
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
    assert.equal(state.notifications.length, 0, "No notification should be emitted when showNotification is false");
  });
});

describe("Account Status Verification (checkAccount) & Lifecycle Commands", () => {
  beforeEach(() => {
    resetMockState();
    resetHostsCache();
  });

  it("verifies active premium account, formats date, and emits success notification", async () => {
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({
        id: 12345,
        username: "tester_pro",
        email: "tester@example.com",
        type: "premium",
        expiration: "2028-06-15T12:00:00.000Z"
      })
    };

    const user = await checkAccount("PREMIUM_TOKEN", true);

    assert.ok(user);
    assert.equal(user.username, "tester_pro");
    assert.equal(user.type, "premium");
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Premium Active");
    assert.ok(state.notifications[0].body.includes("tester_pro"));
    assert.ok(state.notifications[0].body.includes("15/06/2028"));
  });

  it("detects free/non-premium account and emits warning notification", async () => {
    state.httpMockResponse = {
      status: 200,
      body: JSON.stringify({
        id: 54321,
        username: "tester_free",
        type: "free",
        expiration: null
      })
    };

    const user = await checkAccount("FREE_TOKEN", true);

    assert.ok(user);
    assert.equal(user.type, "free");
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Non-Premium");
    assert.ok(state.notifications[0].body.includes("tester_free"));
  });

  it("handles authentication failure (HTTP 401/403) and emits authError notification", async () => {
    state.httpMockResponse = {
      status: 401,
      body: JSON.stringify({ error: "bad_token" })
    };

    const user = await checkAccount("INVALID_TOKEN", true);

    assert.equal(user, null);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Authentication Error");
    assert.ok(state.notifications[0].body.includes("bad_token"));
  });

  it("handles network exception during account verification gracefully", async () => {
    state.httpMockResponse = () => {
      throw new Error("Network unreachable");
    };

    const user = await checkAccount("ANY_TOKEN", true);

    assert.equal(user, null);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].title, "Real-Debrid — Error");
  });

  it("registers and executes community.realdebrid-resolver.checkAccount command", async () => {
    state.configStore.set("apiKey", "VALID_CMD_TOKEN");
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
    assert.ok(typeof handler === "function", "Command must be registered");

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
