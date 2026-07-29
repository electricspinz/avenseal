import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomerTimeline, groupEvents, relativeTime, TimelineError, TimelineFiltersForm, TimelineLoading } from "@/components/customer-timeline";
import type { TimelineEvent } from "@/lib/server/customer-timeline";
import { parseTimelineFilters } from "@/lib/server/timeline-query";

const event: TimelineEvent = { id: "event", organizationId: "org", customerId: "customer", appointmentId: "appointment", category: "communication", type: "communication_delivered", outcome: "succeeded", title: "Communication Delivered", safeSummary: "A communication was delivered.", occurredAt: "2026-07-28T10:00:00.000Z", recordedAt: "2026-07-28T10:01:00.000Z", actor: { kind: "provider", actorId: "provider", safeDisplayName: "Provider" }, source: "communications_engine", correlationId: "event", causationId: "event", sourceEventId: "event", automationExecutionId: null, automationRuleId: null, automationRuleVersion: null, communicationRequestId: "request", paymentId: null, documentId: null, metadata: {} };

describe("CustomerTimeline", () => {
  it("renders accessible event hierarchy, badges, and metadata", () => {
    render(<CustomerTimeline events={[event]} title="Appointment Timeline" />);
    expect(screen.getByRole("heading", { name: "Appointment Timeline" })).toBeTruthy();
    expect(screen.getByText("Communication Delivered")).toBeTruthy();
    expect(screen.getAllByText("Communication").length).toBeGreaterThan(0);
    expect(screen.getByText("Succeeded")).toBeTruthy();
    expect(screen.getByLabelText(new Date(event.occurredAt).toLocaleString())).toBeTruthy();
  });
  it("renders an empty state and deterministic relative time", () => {
    render(<CustomerTimeline events={[]} />);
    expect(screen.getByText("No activity has been recorded yet.")).toBeTruthy();
    expect(relativeTime("2026-07-28T11:55:00.000Z", new Date("2026-07-28T12:00:00.000Z"))).toBe("5 minutes ago");
  });
  it("renders loading, error, and query-boundary filter controls", () => {
    const { rerender } = render(<TimelineLoading />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<TimelineError />);
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(<TimelineFiltersForm filters={{ category: "communication", outcome: "succeeded" }} appointments={[{ id: "appointment", label: "Appointment" }]} />);
    expect(screen.getByRole("button", { name: "Apply filters" })).toBeTruthy();
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("communication");
  });
  it("preserves newest-first event order inside date groups", () => {
    const older = { ...event, id: "older", occurredAt: "2026-07-28T09:00:00.000Z" };
    const groups = groupEvents([event, older], new Date("2026-07-28T12:00:00.000Z"));
    expect(groups[0]?.[1].map((item) => item.id)).toEqual(["event", "older"]);
  });
  it("narrows permitted URL filters at the timeline query boundary", () => {
    expect(parseTimelineFilters({ category: "communication", outcome: "succeeded", appointmentId: "appointment" })).toEqual({ category: "communication", outcome: "succeeded", appointmentId: "appointment" });
    expect(parseTimelineFilters({ category: "invalid", outcome: "invalid" })).toEqual({ category: undefined, outcome: undefined, appointmentId: undefined });
  });
});
