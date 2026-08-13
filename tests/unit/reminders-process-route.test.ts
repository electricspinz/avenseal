import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ReminderProcessingError extends Error {
    constructor(readonly category: "due_reminder_query_failure" | "reminder_promotion_rpc_failure") {
      super("Reminder processing failed.");
    }
  }

  return {
    process: vi.fn(),
    admin: vi.fn(),
    configured: vi.fn(),
    env: vi.fn(),
    ReminderProcessingError
  };
});

vi.mock("@/lib/server/appointment-reminders", () => ({ processAppointmentReminders: mocks.process, ReminderProcessingError: mocks.ReminderProcessingError }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: mocks.admin, hasSupabaseServiceConfig: mocks.configured }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.env }));

import { POST } from "@/app/api/internal/reminders/process/route";

describe("reminder processor route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env.mockReturnValue({ COMMUNICATION_PROCESSOR_SECRET: "processor-secret" });
    mocks.configured.mockReturnValue(true);
    mocks.admin.mockReturnValue({});
    mocks.process.mockResolvedValue({ considered: 2, queued: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects missing, malformed, and wrong authorization", async () => {
    for (const authorization of [null, "Basic processor-secret", "Bearer wrong"]) {
      const response = await POST(new Request("http://localhost/api/internal/reminders/process", { method: "POST", headers: authorization ? { authorization } : {} }));
      expect(response.status).toBe(401);
    }
  });

  it("rejects browser origins and returns only count summaries for a valid scheduler", async () => {
    const denied = await POST(new Request("http://localhost/api/internal/reminders/process", { method: "POST", headers: { authorization: "Bearer processor-secret", origin: "https://example.invalid" } }));
    expect(denied.status).toBe(403);
    const response = await POST(new Request("http://localhost/api/internal/reminders/process", { method: "POST", headers: { authorization: "Bearer processor-secret" } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: { considered: 2, queued: 1 } });
  });

  it.each([
    ["supabase_init_failure", () => mocks.admin.mockImplementationOnce(() => { throw new Error("unavailable"); })],
    ["due_reminder_query_failure", () => mocks.process.mockRejectedValueOnce(new mocks.ReminderProcessingError("due_reminder_query_failure"))],
    ["reminder_promotion_rpc_failure", () => mocks.process.mockRejectedValueOnce(new mocks.ReminderProcessingError("reminder_promotion_rpc_failure"))],
    ["unknown_reminder_processing_failure", () => mocks.process.mockRejectedValueOnce(new Error("unexpected database text"))]
  ] as const)("logs only the safe %s category and preserves the generic 503 response", async (category, arrangeFailure) => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    arrangeFailure();

    const response = await POST(new Request("http://localhost/api/internal/reminders/process", { method: "POST", headers: { authorization: "Bearer processor-secret" } }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Reminder scheduling is unavailable." });
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith("[reminder-processor]", { category });
    expect(logger).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("unexpected database text"));
  });
});
