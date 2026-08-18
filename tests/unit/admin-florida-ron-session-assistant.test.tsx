import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFloridaRonSessionAssistant } from "@/components/admin-florida-ron-session-assistant";

const baseParameters = {
  jurisdiction: "Florida" as const,
  notarialAct: "acknowledgment_individual" as const,
  notaryState: "Florida",
  notaryCounty: "Orange",
  principals: [{ fullName: "Avery Principal", location: "florida" as const, identityMethod: "ron_identity_verification" as const, identityStatus: "passed" as const, capacity: "individual" as const, documentDescription: "Record" }],
  witnesses: [],
  special117285: false,
  physicalWitnessCount: 0,
  providerScreening: "unavailable" as const
};

function attempt(overrides: Record<string, unknown> = {}) {
  return { sessionId: "session-1", parameters: baseParameters, state: "prepared", workflowVersion: "FL-RON-1.0", specificationStatus: "candidate", modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }], stopReason: null, productionEnabled: false as const, ...overrides };
}

function response(payload: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => payload }; }

describe("AdminFloridaRonSessionAssistant", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("renders an empty form and creates a first prepared attempt with POST", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response({}, 404) as never);
    fetchMock.mockResolvedValueOnce(response({ sessionId: "session-1", modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }], stopReason: null, productionEnabled: false }) as never);
    fetchMock.mockResolvedValueOnce(response({ attempt: attempt() }) as never);
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    expect(await screen.findByText("No prepared session exists yet.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Principal 1 name"), { target: { value: "Avery Principal" } });
    fireEvent.change(screen.getByLabelText("Principal 1 document description"), { target: { value: "Record" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare session" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/appointments/appointment-1/session-assistant", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("FL-CORE")).toBeTruthy();
  });

  it("loads a prepared attempt, saves edits with PUT, and refreshes its persisted route preview", async () => {
    const refreshed = attempt({ parameters: { ...baseParameters, notaryCounty: "Seminole" }, modules: [{ id: "FL-IDENTITY", version: "1.0", classification: "required_by_florida_law" }], stopReason: "identity" });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response({ attempt: attempt() }) as never);
    fetchMock.mockResolvedValueOnce(response({ modules: [{ id: "FL-IDENTITY", version: "1.0", classification: "required_by_florida_law" }], stopReason: "identity", productionEnabled: false }) as never);
    fetchMock.mockResolvedValueOnce(response({ attempt: refreshed }) as never);
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    const county = await screen.findByLabelText("Notary county");
    expect(county).toHaveValue("Orange");
    fireEvent.change(county, { target: { value: "Seminole" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preparation" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/appointments/appointment-1/session-assistant", expect.objectContaining({ method: "PUT", body: expect.stringContaining("Seminole") }));
    expect(await screen.findByText("FL-IDENTITY")).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent("Routing STOP: identity");
    expect(screen.getByLabelText("Notary county")).toHaveValue("Seminole");
  });

  it("uses the server-refreshed outside-Florida route after the principal location is changed to Georgia", async () => {
    const georgiaParameters = { ...baseParameters, principals: [{ ...baseParameters.principals[0], location: "outside_florida" as const }] };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response({ attempt: attempt() }) as never);
    fetchMock.mockResolvedValueOnce(response({ modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }, { id: "FL-OUTSIDE-FL", version: "1.0", classification: "conditional_florida_requirement" }], stopReason: null, productionEnabled: false }) as never);
    fetchMock.mockResolvedValueOnce(response({ attempt: attempt({ parameters: georgiaParameters, modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }, { id: "FL-OUTSIDE-FL", version: "1.0", classification: "conditional_florida_requirement" }] }) }) as never);
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    await screen.findByLabelText("Principal 1 location");
    fireEvent.change(screen.getByLabelText("Principal 1 location"), { target: { value: "outside_florida" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preparation" }));
    await screen.findByText("FL-OUTSIDE-FL");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/appointments/appointment-1/session-assistant", expect.objectContaining({ method: "PUT", body: expect.stringContaining("outside_florida") }));
  });

  it("keeps Candidate production controls unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ attempt: attempt() }) as never);
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    expect(await screen.findByText("Candidate — Not approved for production notarizations")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start ceremony" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Advance module" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Complete session" })).toBeDisabled();
  });
});
