import { describe, expect, it } from "vitest";
import { FixedAutomationControlProvider } from "@/lib/server/automation/testing";

const rule = { id: "rule", version: "1", name: "Rule", requiresHumanApproval: false } as const;

describe("Automation controls", () => {
  it("resolves enabled, paused, disabled, approval-required, and unsupported states deterministically", async () => {
    await expect(new FixedAutomationControlProvider({ state: "enabled", reason: "Enabled." }).resolve({ organizationId: "org", rule })).resolves.toEqual({ state: "enabled", reason: "Enabled." });
    await expect(new FixedAutomationControlProvider({ state: "paused", reason: "Paused." }).resolve({ organizationId: "org", rule })).resolves.toEqual({ state: "paused", reason: "Paused." });
    await expect(new FixedAutomationControlProvider({ state: "disabled", reason: "Disabled." }).resolve({ organizationId: "org", rule })).resolves.toEqual({ state: "disabled", reason: "Disabled." });
    await expect(new FixedAutomationControlProvider({ state: "approval_required", reason: "Approval required." }).resolve({ organizationId: "org", rule })).resolves.toEqual({ state: "approval_required", reason: "Approval required." });
    await expect(new FixedAutomationControlProvider().resolve({ organizationId: "org", rule })).resolves.toEqual({ state: "unsupported", reason: "Automation controls are not configured." });
  });

  it("uses organization-scoped fixed controls and fails closed for unconfigured organizations", async () => {
    const provider = new FixedAutomationControlProvider(
      { state: "unsupported", reason: "No organization control configuration exists." },
      { "trusted-org": { state: "enabled", reason: "Enabled for this organization." } }
    );

    await expect(provider.resolve({ organizationId: "trusted-org", rule })).resolves.toMatchObject({ state: "enabled" });
    await expect(provider.resolve({ organizationId: "another-org", rule })).resolves.toMatchObject({ state: "unsupported" });
  });
});
