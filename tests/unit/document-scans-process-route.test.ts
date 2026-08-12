import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ process: vi.fn(), admin: vi.fn(), configured: vi.fn(), env: vi.fn(), scannerConfiguration: vi.fn() }));
vi.mock("@/lib/server/document-security/scan-jobs", () => ({ processDocumentScanBatch: mocks.process }));
vi.mock("@/lib/server/document-security/scanner", () => ({ parseDocumentScannerConfiguration: mocks.scannerConfiguration }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.admin, hasSupabaseServiceConfig: mocks.configured }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.env }));

import { POST } from "@/app/api/internal/document-scans/process/route";

describe("document scan processor route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env.mockReturnValue({ DOCUMENT_SCAN_WORKER_SECRET: "scan-worker-secret", DOCUMENT_SCAN_WORKER_BATCH_SIZE: 10, NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });
    mocks.configured.mockReturnValue(true);
    mocks.admin.mockReturnValue({});
    mocks.process.mockResolvedValue({ claimed: 1, completed: 1, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 });
    mocks.scannerConfiguration.mockReturnValue({ provider: "cloudmersive", enabled: true });
  });

  it("requires the worker secret and rejects browser origins", async () => {
    for (const headers of [new Headers(), new Headers({ authorization: "Bearer wrong" }), new Headers({ authorization: "Bearer scan-worker-secret", origin: "https://browser.invalid" })]) {
      const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process", { method: "POST", headers }));
      expect(response.status).toBe(headers.has("origin") ? 403 : 401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("temporarily classifies a missing server worker secret without changing the generic 401 response", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.env.mockReturnValue({ DOCUMENT_SCAN_WORKER_BATCH_SIZE: 10, NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });

    const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(warning).toHaveBeenCalledWith("[document-scan-worker]", { category: "worker_secret_missing" });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("temporarily classifies a missing or mismatched bearer token without changing the generic 401 response", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process", { method: "POST", headers: { authorization: "Bearer wrong" } }));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(warning).toHaveBeenCalledWith("[document-scan-worker]", { category: "worker_secret_mismatch" });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("temporarily classifies missing Supabase service configuration without changing successful worker authorization", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.env.mockReturnValue({ DOCUMENT_SCAN_WORKER_SECRET: "scan-worker-secret", DOCUMENT_SCAN_WORKER_BATCH_SIZE: 10, SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });
    mocks.configured.mockReturnValue(false);

    const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process", { method: "POST", headers: { authorization: "Bearer scan-worker-secret" } }));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(warning).toHaveBeenCalledWith("[document-scan-worker]", { category: "supabase_service_config_missing" });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("uses no cookie authority, bounds a valid batch, and returns aggregate counts only", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process?batchSize=999", { method: "POST", headers: { authorization: "Bearer scan-worker-secret", cookie: "admin_session=irrelevant" } }));
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith({}, { batchSize: 20 });
    await expect(response.json()).resolves.toEqual({ result: { claimed: 1, completed: 1, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 } });
    expect(warning).not.toHaveBeenCalled();
  });

  it("fails closed while scanning is disabled without claiming queued work", async () => {
    mocks.scannerConfiguration.mockImplementation(() => { throw new Error("disabled"); });

    const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process", { method: "POST", headers: { authorization: "Bearer scan-worker-secret" } }));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Document scan processing is unavailable." });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("returns a safe all-zero aggregate for a valid invocation with no due jobs", async () => {
    mocks.process.mockResolvedValue({ claimed: 0, completed: 0, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 });

    const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process", { method: "POST", headers: { authorization: "Bearer scan-worker-secret" } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ result: { claimed: 0, completed: 0, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 } });
    expect(JSON.stringify(body)).not.toMatch(/job|document|appointment|organization|storage|provider|token|error/i);
  });

  it("returns only aggregate counters when safely contained mixed work has partial failures", async () => {
    mocks.process.mockResolvedValue({ claimed: 10, completed: 3, blocked: 2, retryScheduled: 1, failed: 2, cancelled: 1 });

    const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process", { method: "POST", headers: { authorization: "Bearer scan-worker-secret" } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ result: { claimed: 10, completed: 3, blocked: 2, retryScheduled: 1, failed: 2, cancelled: 1 } });
    expect(Object.keys(body.result).sort()).toEqual(["blocked", "cancelled", "claimed", "completed", "failed", "retryScheduled"]);
    expect(JSON.stringify(body)).not.toMatch(/job-|document-|appointment-|organization-|storage-|provider_request|stack|scanner|token|error/i);
  });
});
