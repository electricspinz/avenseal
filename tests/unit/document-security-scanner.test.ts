import { describe, expect, it } from "vitest";
import { CloudmersiveMalwareScanner, DocumentScannerConfigurationError, DocumentScannerProviderError, DocumentScannerTimeoutError, createDocumentMalwareScanner, createFakeMalwareScanner, normalizeDocumentScannerError, parseDocumentScannerConfiguration, validateDocumentScanRequest, withDocumentScannerTimeout, type DocumentScannerFetch } from "@/lib/server/document-security/scanner";

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
    const unconfigured = await createDocumentMalwareScanner({ DOCUMENT_SCANNER_API_KEY: "private-key" }).scan(request);
    expect(unconfigured).toEqual({ outcome: "permanent_failure", provider: "unconfigured", safeFailureCategory: "configuration_error" });
    expect(JSON.stringify(unconfigured)).not.toContain("private-key");
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

});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function scannerWith(fetchImplementation: DocumentScannerFetch) {
  return new CloudmersiveMalwareScanner(parseDocumentScannerConfiguration(validEnvironment), fetchImplementation);
}

describe("verified Cloudmersive basic adapter", () => {
  it("posts one private multipart request and maps a clean response", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImplementation: DocumentScannerFetch = async (input, init) => { calls.push([input, init]); return jsonResponse({ CleanResult: true, FoundViruses: [] }); };
    const result = await scannerWith(fetchImplementation).scan(request);

    expect(result).toEqual({ outcome: "clean", provider: "cloudmersive" });
    expect(calls).toHaveLength(1);
    const [endpoint, init] = calls[0]!;
    expect(String(endpoint)).toBe("https://api.example.test/virus/scan/file");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("apikey")).toBe("secret-api-key");
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get("inputFile") as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("document.pdf");
    expect(file.type).toBe("application/pdf");
    for (const forbidden of ["documentId", "organizationId", "appointmentId", "jobId", "storageKey", "originalFilename", "correlationId"]) expect(form.get(forbidden)).toBeNull();
    expect(JSON.stringify({ endpoint: String(endpoint), headers: Object.fromEntries(new Headers(init?.headers)), fields: [...form.keys()] })).not.toContain("private.pdf");
  });

  it("maps only CleanResult false to infected without returning detections", async () => {
    const result = await scannerWith(async () => jsonResponse({ CleanResult: false, FoundViruses: [{ VirusName: "sensitive-detection" }] })).scan(request);
    expect(result).toEqual({ outcome: "infected", provider: "cloudmersive" });
    expect(JSON.stringify(result)).not.toContain("sensitive-detection");
  });

  it.each([
    ["401", 401, { outcome: "permanent_failure", safeFailureCategory: "authentication_failed" }],
    ["403", 403, { outcome: "permanent_failure", safeFailureCategory: "authentication_failed" }],
    ["429", 429, { outcome: "retryable_failure", safeFailureCategory: "provider_rate_limited" }],
    ["503", 503, { outcome: "retryable_failure", safeFailureCategory: "provider_unavailable" }],
    ["400", 400, { outcome: "permanent_failure", safeFailureCategory: "provider_rejected" }]
  ])("maps HTTP %s to a safe normalized result", async (_name, status, expected) => {
    const result = await scannerWith(async () => new Response(null, { status })).scan(request);
    expect(result).toMatchObject({ provider: "cloudmersive", ...expected });
    expect(JSON.stringify(result)).not.toContain("secret-api-key");
  });

  it.each([
    ["non-JSON", new Response("not JSON", { status: 200, headers: { "content-type": "text/plain" } })],
    ["empty", new Response(null, { status: 200 })],
    ["missing CleanResult", jsonResponse({ FoundViruses: [] })],
    ["non-boolean CleanResult", jsonResponse({ CleanResult: "true", FoundViruses: [] })],
    ["malformed FoundViruses", jsonResponse({ CleanResult: true, FoundViruses: {} })]
  ])("fails closed for a %s success payload", async (_name, response) => {
    const result = await scannerWith(async () => response).scan(request);
    expect(result).toEqual({ outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "invalid_response" });
  });

  it("classifies abort, network, and unexpected adapter errors without retaining error text", async () => {
    const timeout = await scannerWith(async () => { throw new DOMException("private timeout", "AbortError"); }).scan(request);
    const network = await scannerWith(async () => { throw new TypeError("private network failure"); }).scan(request);
    const unexpected = await scannerWith(async () => { throw new Error("private adapter failure"); }).scan(request);
    expect(timeout).toEqual({ outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "provider_timeout" });
    expect(network).toEqual({ outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "network_error" });
    expect(unexpected).toEqual({ outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "unexpected_error" });
    expect(JSON.stringify([timeout, network, unexpected])).not.toMatch(/private timeout|private network|private adapter/i);
  });

  it("does not fetch for invalid metadata or empty bytes", async () => {
    let fetchCount = 0;
    const scanner = scannerWith(async () => { fetchCount++; return jsonResponse({ CleanResult: true }); });
    await expect(scanner.scan({ ...request, contentType: "text/plain" as never })).resolves.toEqual({ outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "configuration_error" });
    await expect(scanner.scan({ ...request, bytes: new ArrayBuffer(0) })).resolves.toEqual({ outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "invalid_response" });
    expect(fetchCount).toBe(0);
  });
});
