import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AdminAppointmentForm } from "@/components/admin-appointment-form";
import { ExternalSessionCard } from "@/components/external-session-card";

const appointment = { id: "appointment-1", status: "confirmed" } as never;
const session = { appointmentId: "appointment-1", organizationId: "org-1", provider: "BlueNotary", sessionName: "Session", launchUrl: "https://provider.example/session", referenceNumber: null, status: "scheduled", notes: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", metadata: {} } as const;

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Admin appointment next action refreshes", () => {
  it("refreshes after a successful appointment status save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<AdminAppointmentForm appointment={appointment} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  });

  it("refreshes after a successful external-session save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ session }) }));
    render(<ExternalSessionCard appointmentId="appointment-1" initialSession={null} />);
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "BlueNotary" } });
    fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "Session" } });
    fireEvent.click(screen.getByRole("button", { name: "Add session" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  });

  it("refreshes after a successful external-session removal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<ExternalSessionCard appointmentId="appointment-1" initialSession={session} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  });
});
