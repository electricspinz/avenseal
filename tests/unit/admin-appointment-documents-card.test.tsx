import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAppointmentDocumentsCard } from "@/components/admin-appointment-documents-card";

const documentRecord = { id: "document-1", organizationId: "org-1", appointmentId: "appointment-1", originalFilename: "document.pdf", storageKey: "quarantine/organizations/org-1/private", contentType: "application/pdf" as const, sizeBytes: 1024, status: "uploaded" as const, reviewedBy: null, reviewerName: null, reviewedAt: null, reviewNotes: null, uploadedByType: "customer" as const, uploadedAt: "2026-08-01T10:00:00.000Z", deletedAt: null, metadata: {}, scanStatus: "clean" as const, storageStatus: "active" as const, scanProvider: null, scanRequestedAt: null, scannedAt: null, scanFailureCategory: null, scanAttemptCount: 1, createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" };

afterEach(() => vi.unstubAllGlobals());

describe("AdminAppointmentDocumentsCard", () => {
  it("renders uploaded metadata and a secure download action without storage details", () => {
    render(<AdminAppointmentDocumentsCard appointmentId="appointment-1" documents={[documentRecord]} />);
    expect(screen.getByText("document.pdf")).toBeTruthy();
    expect(screen.getByText(/application\/pdf.*1 KB.*uploaded/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download" })).toHaveProperty("href", expect.stringContaining("/api/admin/appointments/appointment-1/documents/document-1/download"));
    expect(document.body.textContent).not.toContain("quarantine/");
  });

  it("does not offer a download action until a document is clean and active", () => {
    render(<AdminAppointmentDocumentsCard appointmentId="appointment-1" documents={[{ ...documentRecord, scanStatus: "pending", storageStatus: "quarantined" }]} />);
    expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
    expect(screen.getByText("Download unavailable")).toBeTruthy();
  });

  it("confirms approval, invokes the review endpoint once, and renders review metadata", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ document: { id: "document-1", status: "approved", reviewerName: "Avery Admin", reviewedAt: "2026-08-02T10:00:00.000Z", reviewNotes: null } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(<AdminAppointmentDocumentsCard appointmentId="appointment-1" documents={[documentRecord]} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("dialog").textContent).toContain("Approve this document?");
    fireEvent.click(screen.getByRole("button", { name: "Approve document" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/admin/appointments/appointment-1/documents/document-1/review", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "approve", reviewNotes: undefined }) }));
    expect(await screen.findByText("Approved")).toBeTruthy();
    expect(screen.getByText(/Reviewed by Avery Admin/)).toBeTruthy();
  });

  it("requires a rejection reason, prevents duplicate submission, and renders the stored staff note", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal("fetch", fetch);
    render(<AdminAppointmentDocumentsCard appointmentId="appointment-1" documents={[documentRecord]} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const reject = screen.getByRole("button", { name: "Reject document" });
    expect(reject).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for customer" }), { target: { value: "  Please upload a clearer image.  " } });
    fireEvent.click(reject);
    fireEvent.click(reject);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Rejecting..." })).toHaveProperty("disabled", true);
    resolveFetch?.(new Response(JSON.stringify({ document: { id: "document-1", status: "rejected", reviewerName: "Avery Admin", reviewedAt: "2026-08-02T10:00:00.000Z", reviewNotes: "Please upload a clearer image." } }), { status: 200 }));
    expect(await screen.findByText(/Rejection reason: Please upload a clearer image/)).toBeTruthy();
  });

  it("restores the review controls with a safe failure message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("database credentials")));
    render(<AdminAppointmentDocumentsCard appointmentId="appointment-1" documents={[documentRecord]} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve document" }));
    expect((await screen.findByRole("status")).textContent).toContain("Document review could not be completed. Please try again.");
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", false);
    expect(document.body.textContent).not.toContain("database credentials");
  });
});
