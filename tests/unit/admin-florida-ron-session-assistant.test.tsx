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
function mockSessionRequests(reads: Array<ReturnType<typeof response>>, save = response({}), preview = response({ attempt: { workflowVersion: "FL-RON-1.0", productionEnabled: false, parameters: { principals: [] } }, modules: [] })) {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = String(url);
    if (target.endsWith("/history")) return response({ history: [] }) as never;
    if (target.endsWith("/preview")) return preview as never;
    if (init?.method === "POST" || init?.method === "PUT") return save as never;
    return (reads.shift() ?? response({ attempt: attempt() })) as never;
  });
  return fetchMock;
}
function savedRequest(method: "POST" | "PUT") { return vi.mocked(fetch).mock.calls.find(([url, init]) => String(url).endsWith("/session-assistant") && init?.method === method); }

describe("AdminFloridaRonSessionAssistant", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("renders an empty form and creates a first prepared attempt with POST", async () => {
    mockSessionRequests([response({}, 404), response({ attempt: attempt() })], response({ sessionId: "session-1", modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }], stopReason: null, productionEnabled: false }));
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    expect(await screen.findByText("No prepared session exists yet.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Principal 1 name"), { target: { value: "Avery Principal" } });
    fireEvent.change(screen.getByLabelText("Principal 1 document description"), { target: { value: "Record" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare session" }));
    await waitFor(() => expect(savedRequest("POST")).toBeTruthy());
    expect(screen.getByText("FL-CORE")).toBeTruthy();
  });

  it("loads a prepared attempt, saves edits with PUT, and refreshes its persisted route preview", async () => {
    const refreshed = attempt({ parameters: { ...baseParameters, notaryCounty: "Seminole" }, modules: [{ id: "FL-IDENTITY", version: "1.0", classification: "required_by_florida_law" }], stopReason: "identity" });
    mockSessionRequests([response({ attempt: attempt() }), response({ attempt: refreshed })], response({ modules: [{ id: "FL-IDENTITY", version: "1.0", classification: "required_by_florida_law" }], stopReason: "identity", productionEnabled: false }));
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    const county = await screen.findByLabelText("Notary county");
    expect((county as HTMLInputElement).value).toBe("Orange");
    fireEvent.change(county, { target: { value: "Seminole" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preparation" }));
    await waitFor(() => expect(savedRequest("PUT")).toBeTruthy());
    expect(savedRequest("PUT")?.[1]?.body).toContain("Seminole");
    expect(await screen.findByText("FL-IDENTITY")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Routing STOP: identity");
    expect((screen.getByLabelText("Notary county") as HTMLInputElement).value).toBe("Seminole");
  });

  it("uses the server-refreshed outside-Florida route after the principal location is changed to Georgia", async () => {
    const georgiaParameters = { ...baseParameters, principals: [{ ...baseParameters.principals[0], location: "outside_florida" as const }] };
    mockSessionRequests([response({ attempt: attempt() }), response({ attempt: attempt({ parameters: georgiaParameters, modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }, { id: "FL-OUTSIDE-FL", version: "1.0", classification: "conditional_florida_requirement" }] }) })], response({ modules: [{ id: "FL-CORE", version: "1.0", classification: "required_by_florida_law" }, { id: "FL-OUTSIDE-FL", version: "1.0", classification: "conditional_florida_requirement" }], stopReason: null, productionEnabled: false }));
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    await screen.findByLabelText("Principal 1 location");
    fireEvent.change(screen.getByLabelText("Principal 1 location"), { target: { value: "outside_florida" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preparation" }));
    await screen.findByText("FL-OUTSIDE-FL");
    expect(savedRequest("PUT")?.[1]?.body).toContain("outside_florida");
  });

  it("keeps Candidate production controls unavailable", async () => {
    mockSessionRequests([response({ attempt: attempt() })]);
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    expect(await screen.findByText("Candidate — Not approved for production notarizations")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Start ceremony" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Advance module" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Complete session" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the acknowledgment-language controls only for acknowledgment acts", async () => {
    const jurat = attempt({ parameters: { ...baseParameters, notarialAct: "jurat" } });
    mockSessionRequests([response({ attempt: jurat })]);
    render(<AdminFloridaRonSessionAssistant appointmentId="appointment-1" />);
    await screen.findByLabelText("Notarial act");
    expect(screen.queryByLabelText("Principal 1 English language understanding")).toBeNull();
    fireEvent.change(screen.getByLabelText("Notarial act"), { target: { value: "acknowledgment_individual" } });
    expect(screen.getByLabelText("Principal 1 English language understanding")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Notarial act"), { target: { value: "other_authorized" } });
    expect(screen.queryByLabelText("Principal 1 English language understanding")).toBeNull();
  });
});
