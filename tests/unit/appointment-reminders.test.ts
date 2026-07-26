import { describe, expect, it } from "vitest";
import { reminderSchedule } from "@/lib/server/appointment-reminders";

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
});
