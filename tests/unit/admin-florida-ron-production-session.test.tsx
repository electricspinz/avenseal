import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminFloridaRonProductionSession } from "@/components/admin-florida-ron-production-session";

const core = { id: "FL-CORE", version: "1.0" };
const identity = { id: "FL-IDENTITY", version: "1.1" };
const attempt = { id: "production-1", state: "in_progress" as const, currentModuleIndex: 0, modules: [core, identity], stopReason: null };
const response = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());
describe("AdminFloridaRonProductionSession", () => {
  it("accepts successful confirmation evidence without an error and keeps the current module server-authoritative", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ attempt, applicableStopReasons: ["technology"] })).mockResolvedValueOnce(response({ attempt, evidence: { id: "evidence-1", source: "NOTARY_CONFIRMED" }, applicableStopReasons: ["technology"] }, true, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminFloridaRonProductionSession appointmentId="appointment-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Start ceremony" }));
    expect(await screen.findByText("FL-CORE")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record notary confirmation" }));
    await screen.findByText("FL-CORE");
    expect(screen.queryByText("Production action is unavailable.")).toBeNull();
    expect(fetchMock.mock.calls[1][1]?.body).toContain("module_complete:FL-CORE@1.0");
  });
  it("updates the displayed module on advance, shows real blocking data, and renders a stopped attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ attempt, applicableStopReasons: ["technology"] })).mockResolvedValueOnce(response({ error: "Current module requirements remain unresolved.", unresolvedRequirementIds: ["module_complete:FL-CORE@1.0"] }, false, 409)).mockResolvedValueOnce(response({ attempt: { ...attempt, currentModuleIndex: 1 }, applicableStopReasons: ["identity"] })).mockResolvedValueOnce(response({ attempt: { ...attempt, state: "stopped", stopReason: "identity" }, applicableStopReasons: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminFloridaRonProductionSession appointmentId="appointment-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Start ceremony" })); await screen.findByText("FL-CORE");
    fireEvent.click(screen.getByRole("button", { name: "Advance module" })); expect(await screen.findByText("module_complete:FL-CORE@1.0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Advance module" })); expect(await screen.findByText("FL-IDENTITY")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "technology" })).toBeNull();
    expect(screen.getByRole("option", { name: "identity" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Production STOP reason"), { target: { value: "identity" } });
    fireEvent.click(screen.getByRole("button", { name: "STOP ceremony" })); expect(await screen.findByText("Stopped: identity")).toBeTruthy();
  });
});
