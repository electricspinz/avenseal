import { describe, expect, it } from "vitest";
import { renderEmailSubject } from "@/lib/milestone3/email";
import { renderEmailTemplate } from "@/lib/server/communications";
import { targetDocumentReviewCommunication } from "@/lib/server/document-review-communications";

const document = (id: string, status: "uploaded" | "approved" | "rejected", reviewedAt: string | null = "2026-08-04T10:00:00.000Z") => ({ id, status, reviewedAt }) as never;

describe("document review communications", () => {
  it("uses stable, distinct rejection and approved-set lifecycle discriminators", () => {
    expect(targetDocumentReviewCommunication(document("one", "rejected"), [document("one", "rejected")])).toEqual({ type: "document_replacement_requested", discriminator: "one:2026-08-04T10:00:00.000Z" });
    expect(targetDocumentReviewCommunication(document("two", "rejected", "2026-08-05T10:00:00.000Z"), [document("two", "rejected", "2026-08-05T10:00:00.000Z")])).not.toEqual(targetDocumentReviewCommunication(document("one", "rejected"), [document("one", "rejected")]));
    expect(targetDocumentReviewCommunication(document("one", "approved"), [document("one", "approved"), document("two", "uploaded", null)])).toBeNull();
    expect(targetDocumentReviewCommunication(document("one", "approved"), [document("one", "approved"), document("two", "approved")])).toEqual({ type: "documents_approved", discriminator: "one:2026-08-04T10:00:00.000Z|two:2026-08-04T10:00:00.000Z" });
  });

  it("renders safe Client Workspace-only document review templates", () => {
    const replacement = renderEmailTemplate({ greetingName: "Jordan", body: "Avenseal reviewed an uploaded document. Open your appointment to upload a replacement. Uploading a replacement does not itself mean it has been approved.", actionLabel: "Open Your Appointment", actionUrl: "https://avenseal.example/appointments/access/token", footer: "Continue securely." });
    const approved = renderEmailTemplate({ greetingName: "Jordan", body: "All currently active uploaded documents have been approved. This does not mean identity verification or notarization is complete. Avenseal coordinates preparation; BlueNotary performs identity verification and the live notarization.", actionLabel: "Open Your Appointment", actionUrl: "https://avenseal.example/appointments/access/token", footer: "Continue securely." });
    expect(renderEmailSubject("document_replacement_requested")).toBe("A document needs to be replaced");
    expect(renderEmailSubject("documents_approved")).toBe("Your uploaded documents have been approved");
    expect(replacement).toContain("Open Your Appointment");
    expect(approved).toContain("does not mean identity verification or notarization is complete");
    for (const value of [replacement, approved]) expect(value).not.toMatch(/document\.pdf|review note|storage_key|BlueNotary\.example|organization-id/i);
  });
});
