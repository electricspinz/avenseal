import { NextRequest, NextResponse } from "next/server";
import {
  AppointmentAvailabilityError,
  getAvailableAppointmentSlots
} from "@/lib/server/appointment-availability";
import { resolvePublicOrganization } from "@/lib/server/organization";
import { checkRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = checkRateLimit(`booking-availability:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  const organizationSlug = request.nextUrl.searchParams.get("organization");
  const serviceId = request.nextUrl.searchParams.get("service");
  const date = request.nextUrl.searchParams.get("date");
  if (!organizationSlug || !serviceId || !date || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug)) {
    return NextResponse.json({ error: "A valid availability request is required." }, { status: 400 });
  }

  try {
    const organization = await resolvePublicOrganization(organizationSlug);
    const availability = await getAvailableAppointmentSlots({
      organizationId: organization.id,
      serviceId,
      date
    });
    return NextResponse.json({
      date: availability.date,
      timezone: availability.timezone,
      slots: availability.slots.map(({ startAt, endAt }) => ({ startAt, endAt }))
    });
  } catch (error) {
    if (error instanceof AppointmentAvailabilityError && error.code === "invalid_request") {
      return NextResponse.json({ error: "Availability could not be found." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Availability is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }
}
