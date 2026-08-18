import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFloridaRonCandidatePreview } from "@/components/admin-florida-ron-candidate-preview";

const payload = { attempt: { workflowVersion: "FL-RON-1.0", productionEnabled: false as const, parameters: { notaryCounty: "Orange", notarialAct: "jurat", principals: [{ fullName: "Principal One", documentDescription: "Affidavit" }, { fullName: "Principal Two" }] } }, modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" as const, content: "## Notary checklist before reading\n- Checklist\n\n## READ ALOUD\n> **[County]** County; **[Document Title or General Description]**; **[Notarial Act]**\n\n### Avenseal safeguard\n> Do you consent to continuing this notarization using audio-video communication technology, and do you understand that this session is being recorded?\n\nRecord answer.\n\nIf principal does not consent:\n\n`FL-STOP-DECLINE`" }, { id: "FL-OUTSIDE-FL", version: "1.0", classification: "conditional_florida_requirement" as const, content: "## READ ALOUD\n> Locked outside-Florida content" }] };

describe("AdminFloridaRonCandidatePreview", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, json: async () => url.includes("/history") ? { history: [] } : payload }))));

  it("labels the Candidate preview, renders module identity/classification, and safely navigates sourced modules", async () => {
    render(<AdminFloridaRonCandidatePreview appointmentId="appointment-1" available />);
    expect(screen.getByText("Candidate — Not approved for production notarizations")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enter Candidate Preview" }));
    expect(await screen.findByText("FL-CORE")).toBeTruthy();
    expect(screen.getByText("Required by Florida law")).toBeTruthy();
    expect(screen.getByText("Read aloud")).toBeTruthy();
    expect(screen.getByText("Required confirmation / consent")).toBeTruthy();
    expect(screen.getByText("Notary instructions / checklist")).toBeTruthy();
    expect(screen.queryByText("## READ ALOUD")).toBeNull();
    expect(screen.queryByText("> Locked module content")).toBeNull();
    const normalReadAloud = screen.getAllByText((_, element) => element?.textContent === "Orange County; Affidavit; jurat").find((element) => element.tagName === "BLOCKQUOTE");
    expect(normalReadAloud).toBeTruthy();
    expect(screen.queryByText("[County]")).toBeNull();
    const consent = screen.getByText("Do you consent to continuing this notarization using audio-video communication technology, and do you understand that this session is being recorded?");
    expect(normalReadAloud).toBeTruthy();
    expect(Boolean(consent.compareDocumentPosition(normalReadAloud!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.getByText("FL-STOP-DECLINE")).toBeTruthy();
    expect(screen.getByText("Required confirmation / consent")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous module" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next module" }));
    expect(await screen.findByText("FL-OUTSIDE-FL")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /2\. Principal Two/ }));
    expect(screen.getByText("Preview context: Principal Two")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start ceremony|advance module|complete session/i })).toBeNull();
    expect(screen.queryByText(/provider outcome/i)).toBeNull();
  });

  it("does not expose a Candidate Preview without a prepared, unblocked route, but keeps history available", async () => {
    render(<AdminFloridaRonCandidatePreview appointmentId="appointment-1" available={false} />);
    expect(await screen.findByText("Session Assistant history")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enter Candidate Preview" })).toBeNull();
  });

  it("records a Candidate-only STOP and never exposes production completion", async () => {
    render(<AdminFloridaRonCandidatePreview appointmentId="appointment-1" available />);
    fireEvent.click(screen.getByRole("button", { name: "Enter Candidate Preview" }));
    await screen.findByText("FL-CORE");
    fireEvent.click(screen.getByText("Candidate Preview STOP"));
    const stop = screen.getByRole("button", { name: "Stop Candidate Preview" });
    expect((stop as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("option", { name: "Select STOP reason…" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Safe STOP reason"), { target: { value: "technology" } });
    expect((stop as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(stop);
    expect(await screen.findByText(/Candidate Preview Stopped/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /complete session|start ceremony/i })).toBeNull();
  });

  it("requires the locked completion checklist before preview_completed", async () => {
    const completePayload = { ...payload, modules: [{ id: "FL-COMPLETE", version: "1.0", classification: "required_by_florida_law" as const, content: "## Final Compliance Review\n- First locked item\n- Second locked item\n\n## READ ALOUD\n> Locked completion text" }] };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, json: async () => url.includes("/history") ? { history: [] } : completePayload })));
    render(<AdminFloridaRonCandidatePreview appointmentId="appointment-1" available />);
    fireEvent.click(screen.getByRole("button", { name: "Enter Candidate Preview" }));
    const complete = await screen.findByRole("button", { name: "Complete Candidate Preview" });
    expect((complete as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("First locked item"));
    fireEvent.click(screen.getByLabelText("Second locked item"));
    expect((complete as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(complete);
    expect(await screen.findByText(/Candidate Preview Completed/)).toBeTruthy();
  });
});
