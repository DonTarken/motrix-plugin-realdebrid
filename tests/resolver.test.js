import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  shouldSkip,
  extractHostname,
  isSupportedHost,
  unrestrictLink,
  getSupportedDomains,
  resetHostsCache
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
