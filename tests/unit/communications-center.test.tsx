import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommunicationList, CommunicationsErrorState, CommunicationsFilters, CommunicationsLoadingState } from "@/components/communications-center";
import { normalizeQuery, queryCommunicationsCenter, type CommunicationsCenterRepository } from "@/lib/server/communications-center";
import type { AdminCommunication } from "@/lib/types";

const record: AdminCommunication = { id: "m:communication-1", source: "message", messageId: "communication-1", appointmentId: "appointment-1", customerId: "customer-1", customerName: "Jordan Lee", messageType: "appointment_reminder_24h", recipientEmail: "jordan@example.com", subject: "Reminder", bodyHtml: null, status: "sent", scheduledFor: null, queuedAt: "2026-07-29T10:00:00.000Z", sentAt: "2026-07-29T10:05:00.000Z", attemptCount: 1, lastAttemptedAt: "2026-07-29T10:05:00.000Z", lastError: null, providerMessageId: "provider-secret", createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:05:00.000Z" };

const dataSource: CommunicationsCenterRepository = {
  async listAdminCommunications() { return { records: [record], currentPage: 1, totalPages: 1, totalRecords: 1 }; },
  async getAdminCommunication(id) { return id === record.id ? record : null; }
};

describe("Communications Center", () => {
  it("filters and sorts through the server-side query boundary", async () => {
    await expect(queryCommunicationsCenter({ search: "jordan", appointment: "appointment-1", sort: "oldest" }, dataSource)).resolves.toMatchObject({ records: [{ id: record.id, channel: "email", status: "sent" }], query: { sort: "oldest" } });
    await expect(queryCommunicationsCenter({ search: "no match" }, dataSource)).resolves.toMatchObject({ records: [] });
  });

  it("narrows untrusted filter values", () => {
    expect(normalizeQuery({ status: "failed", channel: "email", from: "2026-07-01", to: "invalid" })).toMatchObject({ status: "failed", channel: "email", from: "2026-07-01", to: undefined });
  });

  it("renders accessible filters, linked records, and the empty state", () => {
    render(<><CommunicationsFilters query={normalizeQuery({})} /><CommunicationList records={[{ id: record.id, customerId: record.customerId, customerName: record.customerName, appointmentId: record.appointmentId, purpose: record.messageType, channel: "email", status: record.status, provider: null, occurredAt: record.sentAt!, safeSummary: "Communication delivered.", source: record.source, messageId: record.messageId }]} timezone="America/New_York" /></>);
    expect(screen.getByRole("form", { name: "Filter communications" })).toBeTruthy();
    expect(screen.getAllByText("24-hour reminder").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Delivered").length).toBeGreaterThan(0);
    render(<CommunicationList records={[]} timezone="America/New_York" />);
    expect(screen.getByText("No communications have been sent yet.")).toBeTruthy();
  });

  it("labels external-session availability without exposing URLs", () => {
    render(<CommunicationList records={[{ id: "external", customerId: record.customerId, customerName: record.customerName, appointmentId: record.appointmentId, purpose: "external_session_available", channel: "email", status: "queued", provider: null, occurredAt: record.createdAt, safeSummary: "Communication is queued.", source: "message", messageId: record.messageId }]} timezone="America/New_York" />);
    expect(screen.getAllByText("External Session Available").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("appointments/access/");
    expect(document.body.textContent).not.toContain("bluenotary");
  });

  it("renders a terminally suppressed handoff as cancelled without sensitive delivery context", () => {
    render(<CommunicationList records={[{ id: "suppressed", customerId: record.customerId, customerName: record.customerName, appointmentId: record.appointmentId, purpose: "external_session_available", channel: "email", status: "cancelled", provider: null, occurredAt: record.createdAt, safeSummary: "Communication was cancelled.", source: "message", messageId: record.messageId }]} timezone="America/New_York" />);
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Communication was cancelled.").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("appointments/access/");
    expect(document.body.textContent).not.toContain("bluenotary");
    expect(document.body.textContent).not.toContain("reference_number");
  });

  it("exposes a retry form only for failed records with a backing communication message", () => {
    const failed = { id: "m:communication-1", customerId: record.customerId, customerName: record.customerName, appointmentId: record.appointmentId, purpose: record.messageType, channel: "email" as const, status: "failed" as const, provider: null, occurredAt: record.createdAt, safeSummary: "Communication delivery failed.", source: "message" as const, messageId: "communication-1" };
    const { rerender } = render(<CommunicationList records={[failed]} timezone="America/New_York" />);
    const retries = screen.getAllByRole("button", { name: "Retry delivery" });
    expect(retries).toHaveLength(2);
    for (const retry of retries) {
      expect(retry.closest("form")?.getAttribute("action")).toBe("/api/admin/communications/communication-1/retry");
      expect(retry.closest("form")?.getAttribute("method")).toBe("post");
    }

    rerender(<CommunicationList records={[{ ...failed, status: "sent" }]} timezone="America/New_York" />);
    expect(screen.queryAllByRole("button", { name: "Retry delivery" })).toHaveLength(0);
  });

  it("renders the route-level loading and safe error states", () => {
    const { rerender } = render(<CommunicationsLoadingState />);
    expect(screen.getByRole("status", { name: "Loading Communications Center" })).toBeTruthy();
    rerender(<CommunicationsErrorState />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/No provider details were exposed\./)).toBeTruthy();
  });
});
