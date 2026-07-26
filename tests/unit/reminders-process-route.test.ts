import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  admin: vi.fn(),
  configured: vi.fn(),
  env: vi.fn()
}));

vi.mock("@/lib/server/appointment-reminders", () => ({ processAppointmentReminders: mocks.process }));
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
});
