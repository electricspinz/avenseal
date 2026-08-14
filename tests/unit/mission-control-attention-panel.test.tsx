import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttentionPanel } from "@/components/mission-control/attention-panel";
import type { AttentionIssue } from "@/lib/server/attention-engine";

const issues: readonly AttentionIssue[] = [
  {
    id: "appointment-next-action:appointment-payment:review_payment",
    priority: "high",
    category: "appointments",
    title: "Waiting for payment",
    description: "Payment is required before preparation can continue.",
    actionLabel: "Review payment",
    href: "/admin/appointments/appointment-payment",
    source: "appointments",
    createdAt: null,
    appointmentId: "appointment-payment",
    customerName: "Avery",
    presentation: "action_required",
  },
  {
    id: "appointment-next-action:appointment-document:security_processing",
    priority: "low",
    category: "appointments",
    title: "Security processing in progress",
    description: "Document security processing must complete before review.",
    actionLabel: "View documents",
    href: "/admin/appointments/appointment-document",
    source: "appointments",
    createdAt: null,
    appointmentId: "appointment-document",
    customerName: "Blair",
    presentation: "waiting",
  },
  {
    id: "communication-failed:message-1",
    priority: "critical",
    category: "communications",
    title: "Communication failed",
    description: "A communication could not be sent.",
    actionLabel: "Open communication",
    href: "/admin/communications/message-1",
    source: "communications",
    createdAt: null,
  },
];

describe("Mission Control attention panel", () => {
  it("keeps actions ahead of waiting work and uses existing destinations", () => {
    render(<AttentionPanel items={issues} todayAppointmentIds={["appointment-payment"]} />);

    expect(screen.getByRole("heading", { name: "Action required" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Waiting / processing" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review payment" }).getAttribute("href")).toBe("/admin/appointments/appointment-payment");
    expect(screen.getByRole("link", { name: "Open communication" }).getAttribute("href")).toBe("/admin/communications/message-1");
  });

  it("filters the already-loaded queue without a server request and has a safe empty state", () => {
    render(<AttentionPanel items={issues} todayAppointmentIds={["appointment-payment"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getByText(/Security processing in progress/)).toBeTruthy();
    expect(screen.queryByText("Waiting for payment")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText(/Waiting for payment/)).toBeTruthy();
    expect(screen.queryByText(/Security processing in progress/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByText("No items match this filter.")).toBeTruthy();
  });
});
