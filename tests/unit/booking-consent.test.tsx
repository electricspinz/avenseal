import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/brand", () => ({ Brand: () => <span>Avenseal</span> }));
vi.mock("@/components/button", () => ({ Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button> }));
vi.mock("@/lib/analytics", () => ({ trackAppointmentSelected: vi.fn(), trackBookingStarted: vi.fn(), trackBookingStepCompleted: vi.fn(), trackBookingSubmitted: vi.fn() }));

import { BookingFlow } from "@/components/booking-flow";

const fetchMock = vi.fn();

describe("BookingFlow consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ slots: [{ startAt: "2026-08-20T14:00:00.000Z" }], timezone: "America/New_York" }) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses customer-friendly appointment wording and links the final consent to the published policies", async () => {
    render(<BookingFlow organizationSlug="avenseal" serviceId="service-1" />);

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Avery Customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "avery@example.com" } });
    fireEvent.change(screen.getByLabelText("Mobile phone number"), { target: { value: "7274338565" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(screen.getByLabelText("Requested appointment time")).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Add appointment details and consent." })).toBeTruthy();
    expect(screen.getByLabelText("Appointment details")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByText("Your progress is saved on this device")).toBeTruthy();
  });
});
