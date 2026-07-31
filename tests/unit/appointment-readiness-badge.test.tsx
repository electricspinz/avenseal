import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppointmentReadinessBadge } from "@/components/appointment-readiness-badge";

describe("AppointmentReadinessBadge", () => {
  it.each([
    ["ready_for_notary", "Ready for notarization"],
    ["waiting_for_payment", "Waiting for payment"],
    ["waiting_for_documents", "Waiting for documents"],
    ["waiting_for_review", "Waiting for document review"],
    ["waiting_for_replacement", "Waiting for document replacement"],
    ["waiting_for_session", "Waiting for online session"],
    ["in_progress", "In progress"],
    ["blocked", "Blocked"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"]
  ] as const)("renders the shared %s presentation", (state, label) => {
    render(<AppointmentReadinessBadge state={state} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
