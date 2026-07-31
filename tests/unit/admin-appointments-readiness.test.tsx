import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listAppointments: vi.fn(), getAppointmentListReadiness: vi.fn() }));

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/lib/server/repository", () => ({ repository: mocks }));
vi.mock("@/lib/server/mission-control-readiness", () => ({ getAppointmentListReadiness: mocks.getAppointmentListReadiness }));
vi.mock("@/components/admin-shell", () => ({ AdminShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>, AdminCard: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("@/components/status-badge", () => ({ StatusBadge: ({ status }: { status: string }) => <span>Status: {status}</span> }));

import AdminAppointmentsPage from "@/app/admin/appointments/page";

const appointment = { id: "appointment-1", organizationId: "org-1", status: "confirmed" as const, preferredDate: "2026-08-01", preferredTime: "10:00", customer: { fullName: "Avery Doe" }, documentCount: 2 };

describe("Admin appointments readiness integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calculates readiness server-side and keeps status, desktop, mobile, and detail links distinct", async () => {
    mocks.listAppointments.mockResolvedValue([appointment]);
    mocks.getAppointmentListReadiness.mockResolvedValue([{ appointmentId: "appointment-1", state: "waiting_for_session" }]);
    const page = await AdminAppointmentsPage();
    render(page);

    expect(mocks.getAppointmentListReadiness).toHaveBeenCalledWith("org-1", [appointment]);
    expect(screen.getByRole("columnheader", { name: "Readiness" })).toBeTruthy();
    expect(screen.getAllByText("Status: confirmed").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Waiting for online session").length).toBeGreaterThan(1);
    expect(screen.getAllByRole("link", { name: /appointment-1|open/i }).every((link) => link.getAttribute("href") === "/admin/appointments/appointment-1")).toBe(true);
    expect(document.body.textContent).not.toContain("cs_test_private");
    expect(document.body.textContent).not.toContain("document.pdf");
    expect(document.body.textContent).not.toContain("review notes");
    expect(document.body.textContent).not.toContain("https://provider.example");
  });

  it("preserves the existing empty appointment-list result without mutating any appointment", async () => {
    mocks.listAppointments.mockResolvedValue([]);
    mocks.getAppointmentListReadiness.mockResolvedValue([]);
    const page = await AdminAppointmentsPage();
    render(page);
    expect(mocks.getAppointmentListReadiness).toHaveBeenCalledWith("", []);
    expect(screen.queryByRole("row", { name: /appointment/i })).toBeNull();
  });
});
