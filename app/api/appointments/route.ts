import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { repository } from "@/lib/server/repository";
import { bookingSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const body = await request.json();
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const appointment = await repository.createAppointment(parsed.data);
    return NextResponse.json({ status: appointment.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create appointment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
