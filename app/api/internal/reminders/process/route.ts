import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { processAppointmentReminders } from "@/lib/server/appointment-reminders";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";

function authorized(request: Request) {
  const secret = getServerEnv().COMMUNICATION_PROCESSOR_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !token) return false;
  return timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(token).digest());
}

export async function POST(request: Request) {
  if (request.headers.get("origin")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!authorized(request) || !hasSupabaseServiceConfig()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json({ result: await processAppointmentReminders(getSupabaseAdmin()) });
  } catch {
    return NextResponse.json({ error: "Reminder scheduling is unavailable." }, { status: 503 });
  }
}
