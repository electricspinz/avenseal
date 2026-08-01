import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ process: vi.fn(), admin: vi.fn(), configured: vi.fn(), env: vi.fn() }));
vi.mock("@/lib/server/document-security/scan-jobs", () => ({ processDocumentScanBatch: mocks.process }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.admin, hasSupabaseServiceConfig: mocks.configured }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.env }));

import { POST } from "@/app/api/internal/document-scans/process/route";

describe("document scan processor route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env.mockReturnValue({ DOCUMENT_SCAN_WORKER_SECRET: "scan-worker-secret", DOCUMENT_SCAN_WORKER_BATCH_SIZE: 10 });
    mocks.configured.mockReturnValue(true);
    mocks.admin.mockReturnValue({});
    mocks.process.mockResolvedValue({ claimed: 1, completed: 1, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 });
  });

  it("requires the worker secret and rejects browser origins", async () => {
    for (const headers of [new Headers(), new Headers({ authorization: "Bearer wrong" }), new Headers({ authorization: "Bearer scan-worker-secret", origin: "https://browser.invalid" })]) {
      const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process", { method: "POST", headers }));
      expect(response.status).toBe(headers.has("origin") ? 403 : 401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("uses no cookie authority, bounds a valid batch, and returns aggregate counts only", async () => {
    const response = await POST(new NextRequest("http://localhost/api/internal/document-scans/process?batchSize=999", { method: "POST", headers: { authorization: "Bearer scan-worker-secret", cookie: "admin_session=irrelevant" } }));
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith({}, { batchSize: 20 });
    await expect(response.json()).resolves.toEqual({ result: { claimed: 1, completed: 1, blocked: 0, retryScheduled: 0, failed: 0, cancelled: 0 } });
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
