import { describe, expect, it } from "vitest";
import { FakeCalendarProvider, FakePaymentProvider, FakeRONProvider } from "@/lib/server/connected-services/fake-providers";
import { ConnectedServiceRegistry, normalizeProviderError } from "@/lib/server/connected-services/registry";

describe("Connected Services Foundation", () => {
  it("discovers provider capabilities and resolves providers by category", () => {
    const registry = new ConnectedServiceRegistry();
    const payment = new FakePaymentProvider();
    registry.register(payment.asProvider());
    expect(registry.resolve("fake-payment", "payment")?.displayName).toBe("Fake Payments");
    expect(registry.resolve("fake-payment", "calendar")).toBeNull();
    expect(registry.capabilities("fake-payment")).toEqual(["payment.create_payment", "payment.status"]);
  });

  it("keeps fake provider status tenant-scoped and exposes a safe read model", async () => {
    const registry = new ConnectedServiceRegistry();
    const calendar = new FakeCalendarProvider();
    calendar.setStatus("organization-a", "available");
    calendar.setStatus("organization-b", "disabled");
    registry.register(calendar.asProvider());
    const first = await registry.adminReadModel({ organizationId: "organization-a" }, () => "configured");
    const second = await registry.adminReadModel({ organizationId: "organization-b" }, () => "disabled");
    expect(first[0]).toMatchObject({ status: "available", configurationState: "configured", category: "calendar" });
    expect(second[0]).toMatchObject({ status: "disabled", configurationState: "disabled" });
    expect(JSON.stringify(first)).not.toContain("organization-a");
  });

  it("supports independent future registration and duplicate registration protection", () => {
    const registry = new ConnectedServiceRegistry();
    registry.register(new FakeRONProvider().asProvider());
    registry.register(new FakePaymentProvider("future-payment").asProvider());
    expect(registry.discover().map((provider) => provider.id)).toEqual(["fake-ron", "future-payment"]);
    expect(() => registry.register(new FakeRONProvider().asProvider())).toThrow(/already registered/);
  });

  it("normalizes errors without exposing unsafe configuration details", () => {
    expect(normalizeProviderError(new Error("request timed out"), "fake-calendar")).toMatchObject({ code: "unknown", providerId: "fake-calendar" });
    expect(normalizeProviderError(new Error("token=private-value"))).toMatchObject({ code: "unknown", message: "The connected service could not complete the request." });
  });
});
