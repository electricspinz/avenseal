import { describe, expect, it, vi } from "vitest";
import { createDocumentScanMetricsHandler } from "@/app/api/admin/document-scans/metrics/handler";

const context = { userId: "user-1", email: "owner@example.test", organizationId: "organization-1", role: "owner" as const };
const metrics = { pending: 1, retryScheduled: 2, claimed: 1, failed: 0, blocked: 3, oldestPendingAt: "2026-08-01T10:00:00.000Z", lastSuccessfulScanAt: "2026-08-01T10:05:00.000Z", averageScanDurationMs: 1250 };

describe("document scan metrics route", () => {
  it("returns tenant-scoped aggregate-only metrics to an active owner or admin", async () => {
    const lookup = vi.fn().mockResolvedValue(context);
    const loadMetrics = vi.fn().mockResolvedValue(metrics);

    const response = await createDocumentScanMetricsHandler({ context: lookup, metrics: loadMetrics })();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loadMetrics).toHaveBeenCalledWith("organization-1");
    await expect(response.json()).resolves.toEqual({ metrics });
    expect(JSON.stringify(metrics)).not.toMatch(/document|appointment|storage|filename|provider.*request|customer|token/i);
  });

  it("returns a safe no-store error when authorization or metric loading fails", async () => {
    const loadMetrics = vi.fn();
    const response = await createDocumentScanMetricsHandler({ context: vi.fn().mockRejectedValue(new Error("not authorized")), metrics: loadMetrics })();

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Document scan metrics are unavailable." });
    expect(loadMetrics).not.toHaveBeenCalled();
  });

  it("does not return raw job data when the scoped metrics query fails", async () => {
    const response = await createDocumentScanMetricsHandler({ context: vi.fn().mockResolvedValue({ ...context, role: "admin" }), metrics: vi.fn().mockRejectedValue(new Error("document-1 storage-key")) })();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: "Document scan metrics are unavailable." });
    expect(JSON.stringify(body)).not.toMatch(/document-1|storage-key|organization-1/i);
  });
});
