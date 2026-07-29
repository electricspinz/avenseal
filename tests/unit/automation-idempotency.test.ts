import { describe, expect, it } from "vitest";
import { InMemoryAutomationIdempotencyStore, createAutomationIdempotencyKey } from "@/lib/server/automation/idempotency";

const now = new Date("2026-07-28T12:00:00.000Z");

function reservation(key: string, organizationId = "org-a", logicalExecutionId = "event-1") {
  return { key, organizationId, ruleId: "rule", ruleVersion: "1", logicalExecutionId, now, expiresAt: new Date("2026-07-28T12:05:00.000Z") };
}

describe("Automation idempotency", () => {
  it("derives stable keys from business facts, not time or randomness", () => {
    const input = { organizationId: "org-a", ruleId: "rule", ruleVersion: "1", logicalExecutionId: "event-1", policyDiscriminator: "communication" };
    expect(createAutomationIdempotencyKey(input)).toBe(createAutomationIdempotencyKey(input));
    expect(createAutomationIdempotencyKey({ ...input, logicalExecutionId: "event-2" })).not.toBe(createAutomationIdempotencyKey(input));
    expect(createAutomationIdempotencyKey({ ...input, organizationId: "org-b" })).not.toBe(createAutomationIdempotencyKey(input));
  });

  it("reserves once, detects duplicates, completes, releases, and resets safely", async () => {
    const store = new InMemoryAutomationIdempotencyStore();
    const key = createAutomationIdempotencyKey({ organizationId: "org-a", ruleId: "rule", ruleVersion: "1", logicalExecutionId: "event-1" });

    await expect(store.reserve(reservation(key))).resolves.toMatchObject({ kind: "reserved" });
    await expect(store.reserve(reservation(key))).resolves.toMatchObject({ kind: "duplicate" });
    await store.complete(key, now);
    await expect(store.lookup(key, now)).resolves.toMatchObject({ kind: "completed" });
    await store.release(key);
    await expect(store.lookup(key, now)).resolves.toEqual({ kind: "missing" });

    await store.reserve(reservation(key));
    await store.reset();
    await expect(store.lookup(key, now)).resolves.toEqual({ kind: "missing" });
  });

  it("exposes expiration and permits a fresh reservation after expiry", async () => {
    const store = new InMemoryAutomationIdempotencyStore();
    const key = createAutomationIdempotencyKey({ organizationId: "org-a", ruleId: "rule", ruleVersion: "1", logicalExecutionId: "event-1" });
    await store.reserve({ ...reservation(key), expiresAt: new Date("2026-07-28T12:01:00.000Z") });

    await expect(store.lookup(key, new Date("2026-07-28T12:02:00.000Z"))).resolves.toMatchObject({ kind: "expired" });
    await expect(store.reserve({ ...reservation(key), now: new Date("2026-07-28T12:02:00.000Z"), expiresAt: new Date("2026-07-28T12:07:00.000Z") })).resolves.toMatchObject({ kind: "reserved" });
  });

  it("keeps organizations isolated even when rules and source events match", async () => {
    const store = new InMemoryAutomationIdempotencyStore();
    const keyA = createAutomationIdempotencyKey({ organizationId: "org-a", ruleId: "rule", ruleVersion: "1", logicalExecutionId: "event-1" });
    const keyB = createAutomationIdempotencyKey({ organizationId: "org-b", ruleId: "rule", ruleVersion: "1", logicalExecutionId: "event-1" });

    await store.reserve(reservation(keyA, "org-a"));
    await expect(store.reserve(reservation(keyB, "org-b"))).resolves.toMatchObject({ kind: "reserved" });
  });
});
