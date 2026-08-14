import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/button", () => ({ Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button> }));
import { ClientDocumentUploadCard } from "@/components/client-portal/client-document-upload-card";

const fetchMock = vi.fn();
describe("ClientDocumentUploadCard", () => {
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  function selectFile(file = new File(["pdf"], "document.pdf", { type: "application/pdf" })) {
    fireEvent.change(screen.getByLabelText("Choose document"), { target: { files: [file] } });
  }

  it("renders an accessible upload control and sends only one multipart file to the token-scoped endpoint", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    render(<ClientDocumentUploadCard token="magic token/private" />);
    selectFile();
    const button = screen.getByRole("button", { name: "Upload document" });
    fireEvent.click(button); fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/appointments/access/magic%20token%2Fprivate/documents");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: expect.any(FormData) });
    expect(screen.getByRole("button", { name: "Uploading..." })).toHaveProperty("disabled", true);
    expect(document.body.textContent).not.toContain("magic token/private");
    resolveFetch(new Response(JSON.stringify({ status: "uploaded", document: { id: "document-1", originalFilename: "document.pdf", uploadedAt: "2026-08-01T10:00:00.000Z", status: "uploaded", replacementReason: null, storageKey: "private" } }), { headers: { "Content-Type": "application/json" } }));
    await screen.findByText(/Document received\. You don’t need to stay on this page/);
    expect(screen.getByText("document.pdf")).toBeTruthy();
    expect(document.body.textContent).not.toContain("private");
  });

  it("restores the upload action after safe failure without rendering internal errors", async () => {
    fetchMock.mockRejectedValue(new Error("bucket appointment-documents private failure"));
    render(<ClientDocumentUploadCard token="token" />);
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
    await screen.findByText("We couldn't upload your document. Please try again.");
    expect(screen.getByRole("button", { name: "Upload document" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("appointment-documents");
  });

  it("shows customer-safe review states and replaces only a rejected document", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "uploaded", document: { id: "replacement-1", originalFilename: "replacement.pdf", uploadedAt: "2026-08-02T10:00:00.000Z", status: "uploaded", replacementReason: null } })));
    render(<ClientDocumentUploadCard token="token" initialDocuments={[{ id: "uploaded-1", originalFilename: "waiting.pdf", uploadedAt: "2026-08-01T10:00:00.000Z", status: "uploaded", replacementReason: null }, { id: "approved-1", originalFilename: "approved.pdf", uploadedAt: "2026-08-01T10:00:00.000Z", status: "approved", replacementReason: null }, { id: "rejected-1", originalFilename: "replace.pdf", uploadedAt: "2026-08-01T10:00:00.000Z", status: "needs_replacement", replacementReason: "Please provide a clearer image." }]} />);
    expect(screen.getByText("Received — we’re securely processing and reviewing your document.")).toBeTruthy();
    expect(screen.getByText("Approved ✓")).toBeTruthy();
    expect(screen.getByText("A replacement document is needed")).toBeTruthy();
    expect(screen.getByText(/Reason: Please provide a clearer image/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upload Replacement" }));
    selectFile(new File(["pdf"], "replacement.pdf", { type: "application/pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload replacement" }));
    await screen.findByText("Replacement document received.");
    expect(fetchMock.mock.calls[0][1].body.get("replacementDocumentId")).toBe("rejected-1");
    expect(screen.queryByText("A replacement document is needed")).toBeNull();
  });
});
