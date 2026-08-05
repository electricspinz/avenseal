import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAdminAppointmentRescheduleHandler } from "@/app/api/admin/appointments/[id]/reschedule/handler";
import type { RateLimitPolicy, RateLimitResult } from "@/lib/server/distributed-rate-limit";

const context = { userId: "admin-1", email: "admin@example.com", organizationId: "org-1", role: "admin" as const };
const appointment = { id: "appointment-1", organizationId: "org-1" } as never;
const allowed: RateLimitResult = { allowed: true, retryAfterSeconds: 60 };

function harness(overrides: Record<string, unknown> = {}) {
  const contextLookup = vi.fn().mockResolvedValue(context);
  const getAppointment = vi.fn().mockResolvedValue(appointment);
  const consume = vi.fn<(policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>>().mockResolvedValue(allowed);
  const reschedule = vi.fn().mockResolvedValue({ appointment: { id: "appointment-1", organizationId: "org-1", preferredDate: "2026-08-20", preferredTime: "11:00" } as never, calendarSyncStatus: "updated" });
  return { contextLookup, getAppointment, consume, reschedule, handle: createAdminAppointmentRescheduleHandler({ context: contextLookup, getAppointment, consume, reschedule, ...overrides }) };
}

const params = () => ({ params: Promise.resolve({ id: "appointment-1" }) });
const request = (body: unknown) => new NextRequest("http://localhost/api/admin/appointments/appointment-1/reschedule", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("admin appointment reschedule route", () => {
  it("uses tenant context, rate limiting, and the trusted appointment target", async () => {
    const test = harness();
    const response = await test.handle(request({ preferredDate: "2026-08-20", preferredTime: "11:00" }), params());
    expect(response.status).toBe(200);
    expect(test.consume).toHaveBeenCalledWith("admin_appointment_reschedule", "org-1:admin-1:appointment-1");
    expect(test.reschedule).toHaveBeenCalledWith({ appointmentId: "appointment-1", organizationId: "org-1", actorUserId: "admin-1", preferredDate: "2026-08-20", preferredTime: "11:00" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects malformed input and wrong-tenant targets before mutation", async () => {
    const malformed = harness();
    expect((await malformed.handle(request({ preferredDate: "not-a-date", preferredTime: "11" }), params())).status).toBe(400);
    expect(malformed.reschedule).not.toHaveBeenCalled();

    expect((await malformed.handle(request({ preferredDate: "2026-02-31", preferredTime: "25:00" }), params())).status).toBe(400);
    expect(malformed.reschedule).not.toHaveBeenCalled();

    const wrongTenant = harness({ getAppointment: vi.fn().mockResolvedValue({ id: "appointment-1", organizationId: "org-2" } as never) });
    expect((await wrongTenant.handle(request({ preferredDate: "2026-08-20", preferredTime: "11:00" }), params())).status).toBe(404);
    expect(wrongTenant.consume).not.toHaveBeenCalled();
    expect(wrongTenant.reschedule).not.toHaveBeenCalled();
  });

  it("fails closed on unavailable rate limiting and never invokes the reschedule workflow", async () => {
    const test = harness({ consume: vi.fn().mockRejectedValue(new Error("unavailable")) });
    const response = await test.handle(request({ preferredDate: "2026-08-20", preferredTime: "11:00" }), params());
    expect(response.status).toBe(429);
    expect(test.reschedule).not.toHaveBeenCalled();
  });

  it("does not mutate when current owner/admin context rejects a staff member", async () => {
    const test = harness({ context: vi.fn().mockRejectedValue(new Error("insufficient role")) });
    expect((await test.handle(request({ preferredDate: "2026-08-20", preferredTime: "11:00" }), params())).status).toBe(400);
    expect(test.getAppointment).not.toHaveBeenCalled();
    expect(test.reschedule).not.toHaveBeenCalled();
  });
});

