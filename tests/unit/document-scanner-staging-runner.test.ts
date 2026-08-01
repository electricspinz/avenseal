import { describe, expect, it } from "vitest";
import { runDocumentScannerStagingVerification, validateStagingScannerEnvironment } from "../../scripts/verify-document-scanner-staging.mjs";

const environment = { NODE_ENV: "test", APP_ENV: "staging", DOCUMENT_SCANNER_STAGING_VERIFY: "true", DOCUMENT_SCANNER_ENABLED: "true", DOCUMENT_SCANNER_PROVIDER: "cloudmersive", DOCUMENT_SCANNER_API_KEY: "secret", DOCUMENT_SCANNER_BASE_URL: "https://scanner.example.test", DOCUMENT_SCANNER_TIMEOUT_MS: "45000" };

describe("document scanner staging verification runner", () => {
  it("refuses unsafe or incomplete environments before any invocation", () => {
    for (const env of [{ ...environment, NODE_ENV: "production" }, { ...environment, DOCUMENT_SCANNER_STAGING_VERIFY: "false" }, { ...environment, DOCUMENT_SCANNER_ENABLED: "false" }, { ...environment, DOCUMENT_SCANNER_PROVIDER: "other" }, { ...environment, DOCUMENT_SCANNER_API_KEY: "" }, { ...environment, DOCUMENT_SCANNER_BASE_URL: "http://scanner.example.test" }]) expect(() => validateStagingScannerEnvironment(env)).toThrow();
  });

  it("dry-runs without network access and emits only safe readiness", async () => {
    let calls = 0;
    const result = await runDocumentScannerStagingVerification({ env: environment, args: ["--dry-run"], fetchImplementation: async () => { calls++; throw new Error("must not run"); } });
    expect(result).toEqual({ mode: "dry-run", provider: "cloudmersive", configurationValid: true, cleanCheck: "not_run", infectedCheck: "not_run", workerCheck: "not_run", cleanupCheck: "not_run", overallPass: true });
    expect(calls).toBe(0);
  });

  it("runs clean adapter verification, gates EICAR, and does not expose secrets", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const result = await runDocumentScannerStagingVerification({ env: environment, fetchImplementation: async (input, init) => { calls.push({ input, init }); return new Response(JSON.stringify({ CleanResult: true, FoundViruses: [] }), { status: 200 }); } });
    expect(result).toMatchObject({ mode: "adapter-only", cleanCheck: "passed", infectedCheck: "approval_required", overallPass: true });
    expect(calls).toHaveLength(1);
    expect(String(calls[0].input)).toBe("https://scanner.example.test/virus/scan/file");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("runs an approved infected check and returns a safe failure category", async () => {
    let call = 0;
    const result = await runDocumentScannerStagingVerification({ env: { ...environment, DOCUMENT_SCANNER_EICAR_APPROVED: "true" }, fetchImplementation: async () => new Response(JSON.stringify({ CleanResult: call++ === 0, FoundViruses: [] }), { status: 200 }) });
    expect(result).toMatchObject({ cleanCheck: "passed", infectedCheck: "passed", overallPass: true });
    const failure = await runDocumentScannerStagingVerification({ env: environment, fetchImplementation: async () => new Response(null, { status: 503 }) });
    expect(failure).toMatchObject({ overallPass: false, failureCategory: "provider_unavailable" });
    expect(JSON.stringify(failure)).not.toContain("503");
  });
});
