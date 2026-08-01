import { describe, expect, it } from "vitest";
import { documentScanStatuses, documentStorageStatuses, mapDocument } from "@/lib/server/document-repository";

const row = { id: "document", organization_id: "org", appointment_request_id: "appointment", original_filename: "document.pdf", storage_key: "private", content_type: "application/pdf" as const, size_bytes: 1, status: "uploaded" as const, uploaded_by_type: "customer" as const, reviewed_by: null, reviewer: null, reviewed_at: null, review_notes: null, uploaded_at: "now", deleted_at: null, metadata: {}, created_at: "now", updated_at: "now" };

describe("document scan-state row mapping", () => {
  it("maps every valid scan status and storage status", () => {
    for (const scan_status of documentScanStatuses) for (const storage_status of documentStorageStatuses) {
      if (storage_status === "active" && scan_status !== "clean") continue;
      expect(mapDocument({ ...row, scan_status, storage_status, scan_attempt_count: 0 }).scanStatus).toBe(scan_status);
    }
  });
  it("defaults absent migration fields conservatively and keeps customer projections internal-free", () => {
    const document = mapDocument(row); expect(document.scanStatus).toBe("pending"); expect(document.storageStatus).toBe("quarantined"); expect(document.scanAttemptCount).toBe(0);
    expect(documentStorageStatuses).toEqual(["quarantined", "active", "removed"]);
  });
  it("fails closed for invalid states and attempts", () => {
    expect(() => mapDocument({ ...row, scan_status: "unknown", scan_attempt_count: 0 })).toThrow();
    expect(() => mapDocument({ ...row, storage_status: "unknown", scan_attempt_count: 0 })).toThrow();
    expect(() => mapDocument({ ...row, scan_attempt_count: -1 })).toThrow();
  });
});
