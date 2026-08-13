import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { processAppointmentReminders, ReminderProcessingError, type ReminderProcessingFailureCategory } from "@/lib/server/appointment-reminders";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";

type ReminderProcessorDiagnosticCategory = "supabase_init_failure" | ReminderProcessingFailureCategory | "unknown_reminder_processing_failure";

/** Temporary production diagnostic. Remove after the 503 source is confirmed. */
function logReminderProcessorDiagnostic(category: ReminderProcessorDiagnosticCategory) {
  console.error("[reminder-processor]", { category });
}

function authorized(request: Request) {
  const secret = getServerEnv().COMMUNICATION_PROCESSOR_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !token) return false;
  return timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(token).digest());
}

export async function POST(request: Request) {
  if (request.headers.get("origin")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!authorized(request) || !hasSupabaseServiceConfig()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    logReminderProcessorDiagnostic("supabase_init_failure");
    return NextResponse.json({ error: "Reminder scheduling is unavailable." }, { status: 503 });
  }

  try {
    return NextResponse.json({ result: await processAppointmentReminders(supabase) });
  } catch (error) {
    logReminderProcessorDiagnostic(error instanceof ReminderProcessingError ? error.category : "unknown_reminder_processing_failure");
    return NextResponse.json({ error: "Reminder scheduling is unavailable." }, { status: 503 });
  }
}
