import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertDocumentReviewTransition, validateDocumentReviewer, validateReviewNotes } from "@/lib/server/document-review";

describe("document review foundation", () => {
  it("allows only the documented review transitions", () => {
    expect(() => assertDocumentReviewTransition("uploaded", "approved")).not.toThrow();
    expect(() => assertDocumentReviewTransition("uploaded", "rejected")).not.toThrow();
    expect(() => assertDocumentReviewTransition("rejected", "approved")).not.toThrow();
    expect(() => assertDocumentReviewTransition("approved", "rejected")).not.toThrow();
    expect(() => assertDocumentReviewTransition("approved", "approved")).toThrow("already approved");
    expect(() => assertDocumentReviewTransition("unknown" as never, "approved")).toThrow("unknown review status");
  });

  it("normalizes plain-text notes and validates reviewer identity", () => {
    expect(validateReviewNotes("  Ready for handoff.  ")).toBe("Ready for handoff.");
    expect(validateReviewNotes("   ")).toBeNull();
    expect(() => validateReviewNotes("# heading")).toThrow("plain text");
    expect(() => validateReviewNotes("<b>markup</b>")).toThrow("plain text");
    expect(() => validateDocumentReviewer({ id: "00000000-0000-4000-8000-000000000001", role: "admin" })).not.toThrow();
    expect(() => validateDocumentReviewer({ id: "not-a-uuid", role: "admin" })).toThrow();
    expect(() => validateDocumentReviewer({ id: "00000000-0000-4000-8000-000000000001", role: "staff" } as never)).toThrow();
  });

  it("migrates the uploaded-only constraint to the three-state lifecycle while retaining uploaded defaults", async () => {
    const migration = await readFile("supabase/migrations/0017_document_review_foundation.sql", "utf8");
    expect(migration).toContain("check (status in ('uploaded', 'approved', 'rejected'))");
    expect(migration).toContain("set status = 'uploaded'");
    expect(migration).toContain("add column reviewed_by");
    expect(migration).toContain("add column reviewed_at");
    expect(migration).toContain("add column review_notes");
  });
});
