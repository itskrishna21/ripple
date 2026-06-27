/**
 * Unit tests for the SSRF guard.
 * These tests do not need a real database — they only hit DNS and local logic.
 */
import { describe, expect, it } from "vitest";
import { assertUrlSafe } from "../ingest/ssrf";
import { BlockedUrlError } from "../http/errors";

describe("assertUrlSafe", () => {
  describe("scheme validation", () => {
    it("rejects ftp:// URLs", async () => {
      await expect(assertUrlSafe("ftp://example.com")).rejects.toThrow(
        BlockedUrlError,
      );
    });

    it("rejects javascript: URLs", async () => {
      await expect(assertUrlSafe("javascript:alert(1)")).rejects.toThrow(
        BlockedUrlError,
      );
    });

    it("rejects file:// URLs", async () => {
      await expect(assertUrlSafe("file:///etc/passwd")).rejects.toThrow(
        BlockedUrlError,
      );
    });
  });

  describe("private IP blocks", () => {
    it("rejects http://127.0.0.1", async () => {
      await expect(assertUrlSafe("http://127.0.0.1")).rejects.toThrow(
        BlockedUrlError,
      );
    });

    it("rejects http://localhost (resolves to 127.x)", async () => {
      await expect(assertUrlSafe("http://localhost")).rejects.toThrow(
        BlockedUrlError,
      );
    });

    it("rejects 10.x.x.x RFC-1918", async () => {
      await expect(assertUrlSafe("http://10.0.0.1")).rejects.toThrow(
        BlockedUrlError,
      );
    });

    it("rejects 192.168.x.x RFC-1918", async () => {
      await expect(assertUrlSafe("http://192.168.1.1")).rejects.toThrow(
        BlockedUrlError,
      );
    });

    it("rejects 172.16.x.x RFC-1918", async () => {
      await expect(assertUrlSafe("http://172.16.0.1")).rejects.toThrow(
        BlockedUrlError,
      );
    });

    it("rejects 169.254.x.x link-local (IMDS)", async () => {
      await expect(assertUrlSafe("http://169.254.169.254")).rejects.toThrow(
        BlockedUrlError,
      );
    });
  });

  describe("public URLs", () => {
    it("allows https://example.com", async () => {
      const target = await assertUrlSafe("https://example.com");
      expect(target.url.hostname).toBe("example.com");
      expect(target.ip).toBeTruthy();
    });

    it("returns the resolved IP", async () => {
      const target = await assertUrlSafe("https://example.com");
      // Should be a valid IPv4 or IPv6 address
      expect(target.ip).toMatch(
        /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i,
      );
    });
  });
});
