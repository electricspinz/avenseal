import { describe, expect, it } from "vitest";
import { isCustomerVisibleExternalSession } from "@/lib/server/external-sessions";

const session = { appointmentId: "appointment", organizationId: "org", provider: "BlueNotary", sessionName: "Session", launchUrl: "https://provider.example/session", referenceNumber: "private", status: "scheduled" as const, notes: "private", createdAt: "now", updatedAt: "now", metadata: {} };
const eligible = (overrides: Record<string, unknown> = {}) => isCustomerVisibleExternalSession({ paymentStatus: "paid", appointmentStatus: "confirmed", organizationId: "org", appointmentId: "appointment", session, ...overrides });

describe("external session customer eligibility", () => {
  it.each([["confirmed", "scheduled"], ["ready", "ready"], ["confirmed", "in_progress"]] as const)("allows paid %s appointments with %s sessions", (appointmentStatus, status) => expect(eligible({ appointmentStatus, session: { ...session, status } })).toBe(true));
  it.each(["pending", "completed", "cancelled", "unknown"] as const)("rejects %s sessions", (status) => expect(eligible({ session: { ...session, status } })).toBe(false));
  it.each(["http://provider.example", "javascript:alert(1)", "data:text/plain,x", "file:///x", "blob:https://provider.example/x", "not a url", null])("rejects unsafe or missing URLs", (launchUrl) => expect(eligible({ session: { ...session, launchUrl } })).toBe(false));
  it("rejects unpaid, non-eligible, and mismatched trusted records", () => { expect(eligible({ paymentStatus: "payment_link_created" })).toBe(false); expect(eligible({ appointmentStatus: "cancelled" })).toBe(false); expect(eligible({ session: { ...session, organizationId: "other" } })).toBe(false); expect(eligible({ session: { ...session, appointmentId: "other" } })).toBe(false); });
});
