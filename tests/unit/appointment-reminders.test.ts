import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { processAppointmentReminders, reminderSchedule } from "@/lib/server/appointment-reminders";

const settings = { emailRemindersEnabled: true, reviewRequestsEnabled: true, reminder24hMinutesBefore: 1440, reminder2hMinutesBefore: 120, followupMinutesAfter: 1440, reviewRequestMinutesAfter: 2880 };

describe("appointment reminder scheduling", () => {
  it("calculates future reminder and follow-up times", () => {
    const startsAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const reminders = reminderSchedule(startsAt, settings);
    expect(reminders.map((item) => item.template)).toEqual(["appointment_reminder_24h", "appointment_reminder_2h", "appointment_followup", "appointment_review_request"]);
  });

  it("respects disabled reminder settings", () => {
    expect(reminderSchedule(new Date(Date.now() + 72 * 60 * 60 * 1000), { ...settings, emailRemindersEnabled: false, reviewRequestsEnabled: false })).toEqual([]);
  });

  it("skips offsets that are already in the past", () => {
    const reminders = reminderSchedule(new Date(Date.now() + 60 * 60 * 1000), settings);
    expect(reminders.map((item) => item.template)).not.toContain("appointment_reminder_24h");
    expect(reminders.map((item) => item.template)).not.toContain("appointment_reminder_2h");
  });

  it("normalizes due-reminder query failures without preserving database error text", async () => {
    const query = {
      eq: vi.fn(),
      lte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: null, error: new Error("database detail") })
    };
    query.eq.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => query) }))
    } as unknown as SupabaseClient;

    await expect(processAppointmentReminders(supabase)).rejects.toEqual(expect.objectContaining({
      category: "due_reminder_query_failure",
      message: "Reminder processing failed."
    }));
  });

  it("normalizes reminder-promotion RPC failures without preserving database error text", async () => {
    const dueReminder = {
      organization_id: "organization",
      appointment_id: "appointment",
      template: "appointment_reminder_24h",
      appointment_requests: {
        preferred_date: "2026-08-13",
        preferred_time: "10:00",
        customers: { full_name: "Customer", email: "customer@example.com" }
      }
    };
    const query = {
      eq: vi.fn(),
      lte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [dueReminder], error: null })
    };
    query.eq.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => query) })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("rpc detail") })
    } as unknown as SupabaseClient;

    await expect(processAppointmentReminders(supabase)).rejects.toEqual(expect.objectContaining({
      category: "reminder_promotion_rpc_failure",
      message: "Reminder processing failed."
    }));
  });
});
