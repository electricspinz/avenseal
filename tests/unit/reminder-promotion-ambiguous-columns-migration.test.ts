import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0026_fix_reminder_promotion_ambiguous_columns.sql"), "utf8");

describe("reminder promotion ambiguous-column migration", () => {
  it("qualifies every reminder, communication, and appointment column in the promotion function", () => {
    expect(migration).toContain("update public.appointment_reminders as reminder");
    expect(migration).toContain("where reminder.id = p_reminder_id and reminder.status = 'scheduled'");
    expect(migration).toContain("select message.id into v_message_id");
    expect(migration).toContain("where message.organization_id = (");
    expect(migration).toContain("select reminder.organization_id");
    expect(migration).toContain("and message.idempotency_key = p_idempotency_key");
    expect(migration).toContain("select reminder.organization_id, reminder.appointment_id, appointment.customer_id");
    expect(migration).toContain("reminder.template");
    expect(migration).toContain("join public.appointment_requests as appointment on appointment.id = reminder.appointment_id");
    expect(migration).toContain("returning message.id into v_message_id");
    expect(migration).toContain("where reminder.id = p_reminder_id and reminder.status = 'processing'");
    expect(migration).not.toContain("select organization_id, appointment_id, a.customer_id");
  });

  it("preserves the promotion contract, atomic lifecycle, and service-role-only execution", () => {
    expect(migration).toContain("p_reminder_id uuid");
    expect(migration).toContain("p_subject text");
    expect(migration).toContain("p_html text");
    expect(migration).toContain("p_recipient_email text");
    expect(migration).toContain("p_idempotency_key text");
    expect(migration).toContain("p_provider integration_provider default 'gmail_smtp'");
    expect(migration).toContain(") returns uuid");
    expect(migration).toContain("security definer set search_path = public");
    expect(migration).toContain("if not found then return null; end if;");
    expect(migration).toContain("if not found then raise exception 'Reminder promotion claim was lost'; end if;");
    expect(migration).toContain("revoke all on function public.promote_appointment_reminder(uuid, text, text, text, text, integration_provider) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.promote_appointment_reminder(uuid, text, text, text, text, integration_provider) to service_role");
  });
});
