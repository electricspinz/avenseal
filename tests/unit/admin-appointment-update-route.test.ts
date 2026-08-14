import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  getAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  mapRescheduleDiagnostic: vi.fn(),
}));

vi.mock("@/lib/server/admin-context", () => ({
  requireAdminOrganizationContext: mocks.context,
}));
vi.mock("@/lib/server/repository", () => ({
  repository: {
    getAppointment: mocks.getAppointment,
    updateAppointment: mocks.updateAppointment,
  },
  mapAdminAppointmentRescheduleRpcDiagnostic: mocks.mapRescheduleDiagnostic,
}));

import {
  PATCH,
} from "@/app/api/admin/appointments/[id]/route";
import { classifyAdminAppointmentUpdateWriteError } from "@/lib/server/admin-appointment-update-diagnostics";

const context = {
  userId: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  role: "admin" as const,
};
const appointment = { id: "appointment-1", organizationId: "org-1", status: "confirmed" };
const params = { params: Promise.resolve({ id: "appointment-1" }) };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/appointments/appointment-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectDiagnostic(log: ReturnType<typeof vi.spyOn>, category: string) {
  expect(log).toHaveBeenCalledWith("[admin-appointment-update]", { category });
  expect(JSON.stringify(log.mock.calls)).not.toContain("appointment-1");
  expect(JSON.stringify(log.mock.calls)).not.toContain("admin@example.com");
}

describe("admin appointment update diagnostics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ["schedule guard token", { message: "P0001: AVENSEAL_RESCHEDULE_MINIMUM_NOTICE", code: "P0001" }, "rpc_minimum_notice_violation", "appointment_schedule_guard_rejected"],
    ["constraint", { code: "23514" }, "unknown_rpc_validation_failure", "appointment_write_constraint_failure"],
    ["permission", { code: "42501" }, "unknown_rpc_validation_failure", "appointment_write_permission_denied"],
    ["unknown database error", { code: "P0001" }, "unknown_rpc_validation_failure", "appointment_write_unknown_database_failure"],
    ["unknown runtime error", new Error("internal"), "unknown_rpc_validation_failure", "unknown_update_failure"],
  ] as const)("classifies %s without preserving raw database text", (_name, error, rescheduleCategory, expected) => {
    mocks.mapRescheduleDiagnostic.mockReturnValue(rescheduleCategory);
    expect(classifyAdminAppointmentUpdateWriteError(error)).toBe(expected);
    expect(expected).not.toContain("internal");
  });

  it("logs invalid input while preserving the existing 400 response", async () => {
    mocks.context.mockResolvedValue(context);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(request({ status: "invalid" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid enum value. Expected 'awaiting_review' | 'awaiting_payment' | 'clarification_needed' | 'approved_pending_payment' | 'payment_processing' | 'confirmed' | 'ready' | 'completed' | 'cancelled' | 'declined' | 'follow_up_required' | 'no_show', received 'invalid'",
    });
    expectDiagnostic(log, "invalid_update");
    log.mockRestore();
  });

  it("logs a missing or cross-tenant target while preserving the existing 404 response", async () => {
    mocks.context.mockResolvedValue(context);
    mocks.getAppointment.mockResolvedValue({ ...appointment, organizationId: "other-org" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(request({ status: "confirmed" }), params);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Appointment not found." });
    expect(mocks.updateAppointment).not.toHaveBeenCalled();
    expectDiagnostic(log, "appointment_missing_or_wrong_tenant");
    log.mockRestore();
  });

  it("logs rejected admin context and rethrows without changing framework error handling", async () => {
    mocks.context.mockRejectedValue(new Error("authorization"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(PATCH(request({ status: "confirmed" }), params)).rejects.toThrow("authorization");

    expect(mocks.getAppointment).not.toHaveBeenCalled();
    expectDiagnostic(log, "admin_context_rejected");
    log.mockRestore();
  });

  it("logs a schedule guard failure and rethrows without changing framework error handling", async () => {
    mocks.context.mockResolvedValue(context);
    mocks.getAppointment.mockResolvedValue(appointment);
    mocks.updateAppointment.mockRejectedValue({ message: "P0001: AVENSEAL_RESCHEDULE_MINIMUM_NOTICE", code: "P0001" });
    mocks.mapRescheduleDiagnostic.mockReturnValue("rpc_minimum_notice_violation");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(PATCH(request({ status: "confirmed" }), params)).rejects.toEqual({
      message: "P0001: AVENSEAL_RESCHEDULE_MINIMUM_NOTICE",
      code: "P0001",
    });

    expectDiagnostic(log, "appointment_schedule_guard_rejected");
    log.mockRestore();
  });

  it("preserves the existing successful response without diagnostic logging", async () => {
    mocks.context.mockResolvedValue(context);
    mocks.getAppointment.mockResolvedValue(appointment);
    mocks.updateAppointment.mockResolvedValue({ ...appointment, status: "completed" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(request({ status: "completed" }), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ appointment: { ...appointment, status: "completed" } });
    expect(mocks.updateAppointment).toHaveBeenCalledWith("appointment-1", { status: "completed" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
