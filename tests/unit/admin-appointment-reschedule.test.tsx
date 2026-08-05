import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AdminAppointmentReschedule } from "@/components/admin-appointment-reschedule";

describe("AdminAppointmentReschedule", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ calendarSyncStatus: "updated" }) })); });

  it("requires explicit confirmation and sends only the selected schedule", async () => {
    render(<AdminAppointmentReschedule appointment={{ id: "appointment-1", preferredDate: "2026-08-10", preferredTime: "09:00", status: "confirmed", timezone: "America/New_York" }} />);
    const submit = screen.getByRole("button", { name: "Confirm reschedule" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith("/api/admin/appointments/appointment-1/reschedule", expect.objectContaining({ method: "POST", body: JSON.stringify({ preferredDate: "2026-08-10", preferredTime: "09:00" }) }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not offer rescheduling for terminal appointments", () => {
    render(<AdminAppointmentReschedule appointment={{ id: "appointment-1", preferredDate: "2026-08-10", preferredTime: "09:00", status: "cancelled", timezone: "America/New_York" }} />);
    expect(screen.queryByRole("button", { name: "Confirm reschedule" })).toBeNull();
    expect(screen.getByText("This appointment is not eligible for rescheduling.")).toBeTruthy();
  });

  it("shows safe calendar-retry feedback after a durable reschedule", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ calendarSyncStatus: "failed" }) }));
    render(<AdminAppointmentReschedule appointment={{ id: "appointment-1", preferredDate: "2026-08-10", preferredTime: "09:00", status: "confirmed", timezone: "America/New_York" }} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reschedule" }));
    expect(await screen.findByText("Appointment rescheduled. Calendar synchronization will retry; reminders have been updated.")).toBeTruthy();
  });
});

