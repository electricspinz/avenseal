import { describe, expect, it, vi } from "vitest";
import { CloudmersiveMalwareScanner, DocumentScannerConfigurationError, DocumentScannerProviderError, DocumentScannerTimeoutError, createDocumentMalwareScanner, createFakeMalwareScanner, normalizeDocumentScannerError, parseDocumentScannerConfiguration, validateDocumentScanRequest, withDocumentScannerTimeout } from "@/lib/server/document-security/scanner";

const request = { documentId: "document-1", contentType: "application/pdf" as const, sizeBytes: 4, bytes: new Uint8Array([1, 2, 3, 4]), correlationId: "correlation-1", originalFilename: "private.pdf" };
const validEnvironment = { DOCUMENT_SCANNER_ENABLED: "true", DOCUMENT_SCANNER_PROVIDER: "cloudmersive", DOCUMENT_SCANNER_API_KEY: "secret-api-key", DOCUMENT_SCANNER_BASE_URL: "https://api.example.test", DOCUMENT_SCANNER_TIMEOUT_MS: "45000" };

describe("document malware scanner configuration and boundary", () => {
  it("accepts only explicit valid Cloudmersive configuration", () => {
    expect(parseDocumentScannerConfiguration(validEnvironment)).toMatchObject({ provider: "cloudmersive", enabled: true, baseUrl: "https://api.example.test", timeoutMs: 45000 });
    for (const environment of [{}, { ...validEnvironment, DOCUMENT_SCANNER_ENABLED: "false" }, { ...validEnvironment, DOCUMENT_SCANNER_PROVIDER: "unsupported" }, { ...validEnvironment, DOCUMENT_SCANNER_API_KEY: "" }, { ...validEnvironment, DOCUMENT_SCANNER_BASE_URL: "http://scanner.example.test" }, { ...validEnvironment, DOCUMENT_SCANNER_TIMEOUT_MS: "0" }]) {
      expect(() => parseDocumentScannerConfiguration(environment)).toThrow(DocumentScannerConfigurationError);
    }
  });

  it("fails closed without exposing secrets and never defaults to clean", async () => {
    const configured = await createDocumentMalwareScanner(validEnvironment).scan(request);
    const unconfigured = await createDocumentMalwareScanner({ DOCUMENT_SCANNER_API_KEY: "private-key" }).scan(request);
    expect(configured).toEqual({ outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "invalid_response" });
    expect(unconfigured).toEqual({ outcome: "permanent_failure", provider: "unconfigured", safeFailureCategory: "configuration_error" });
    expect(JSON.stringify([configured, unconfigured])).not.toContain("private-key");
  });

  it("allows a fake scanner only through explicit injection", async () => {
    const fake = createFakeMalwareScanner("infected");
    expect(await createDocumentMalwareScanner({}, fake.scanner).scan(request)).toEqual({ outcome: "infected", provider: "fake" });
    expect(await createDocumentMalwareScanner({ DOCUMENT_SCANNER_ENABLED: "true", DOCUMENT_SCANNER_PROVIDER: "fake" }).scan(request)).toMatchObject({ outcome: "permanent_failure" });
  });

  it("rejects unsupported or oversized provider request metadata before any provider call", () => {
    expect(() => validateDocumentScanRequest({ ...request, contentType: "text/plain" as never })).toThrow(DocumentScannerConfigurationError);
    expect(() => validateDocumentScanRequest({ ...request, sizeBytes: 10 * 1024 * 1024 + 1 })).toThrow(DocumentScannerConfigurationError);
  });
});

describe("deterministic fake scanner", () => {
  for (const behavior of ["clean", "infected", "suspicious", "retryable_failure", "permanent_failure", "timeout", "malformed"] as const) {
    it(`normalizes ${behavior} without retaining file bytes`, async () => {
      const fake = createFakeMalwareScanner(behavior);
      const result = await fake.scanner.scan(request);
      expect(result.provider).toBe("fake");
      expect(fake.calls()).toHaveLength(1);
      expect(fake.calls()[0]).not.toHaveProperty("bytes");
      expect(JSON.stringify([result, fake.calls()])).not.toContain("1,2,3,4");
    });
  }
});

describe("scanner failure and timeout normalization", () => {
  it("maps timeout and safe provider categories without error leakage", async () => {
    expect(normalizeDocumentScannerError(new DocumentScannerTimeoutError(), "cloudmersive")).toMatchObject({ outcome: "retryable_failure", safeFailureCategory: "provider_timeout" });
    expect(normalizeDocumentScannerError(new DocumentScannerProviderError("provider_rate_limited"), "cloudmersive")).toMatchObject({ outcome: "retryable_failure", safeFailureCategory: "provider_rate_limited" });
    expect(normalizeDocumentScannerError(new DocumentScannerProviderError("authentication_failed"), "cloudmersive")).toMatchObject({ outcome: "permanent_failure", safeFailureCategory: "authentication_failed" });
    expect(normalizeDocumentScannerError(new Error("secret response body"), "cloudmersive")).not.toHaveProperty("message");
    await expect(withDocumentScannerTimeout(1_000, async () => "done")).resolves.toBe("done");
    await expect(withDocumentScannerTimeout(1_000, async () => new Promise<never>(() => {}))).rejects.toThrow(DocumentScannerTimeoutError);
  }, 2_000);

  it("keeps the Cloudmersive skeleton unavailable until the response contract is verified and does not fetch or retry", async () => {
    const scanner = new CloudmersiveMalwareScanner(parseDocumentScannerConfiguration(validEnvironment));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(scanner.scan(request)).resolves.toEqual({ outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "invalid_response" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
