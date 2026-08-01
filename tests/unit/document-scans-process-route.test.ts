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
});
