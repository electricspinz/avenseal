import { NextRequest, NextResponse } from "next/server";
import { AppointmentAvailabilityError, getAvailableAppointmentSlots, type AppointmentAvailabilityResult } from "@/lib/server/appointment-availability";
import { consumeDistributedRateLimit, rateLimitedResponse, requestRateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";
import { resolvePublicOrganization } from "@/lib/server/organization";

type BookingAvailabilityWorkflow = (input: { organizationSlug: string; serviceId: string; date: string }) => Promise<AppointmentAvailabilityResult>;

export type BookingAvailabilityHandlerDependencies = Readonly<{
  requestIdentity: (request: NextRequest) => string;
  consumeRateLimit: (policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>;
  getAvailability: BookingAvailabilityWorkflow;
}>;

const productionDependencies: BookingAvailabilityHandlerDependencies = {
  requestIdentity: requestRateLimitIdentity,
  consumeRateLimit: consumeDistributedRateLimit,
  getAvailability: async ({ organizationSlug, serviceId, date }) => {
    const organization = await resolvePublicOrganization(organizationSlug);
    return getAvailableAppointmentSlots({ organizationId: organization.id, serviceId, date });
  }
};

export function createBookingAvailabilityHandler(dependencies: BookingAvailabilityHandlerDependencies = productionDependencies) {
  return async function handleBookingAvailability(request: NextRequest) {
    try {
      const rate = await dependencies.consumeRateLimit("booking_availability", dependencies.requestIdentity(request));
      if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
    } catch {
      return rateLimitedResponse(60);
    }

    const organizationSlug = request.nextUrl.searchParams.get("organization");
    const serviceId = request.nextUrl.searchParams.get("service");
    const date = request.nextUrl.searchParams.get("date");
    if (!organizationSlug || !serviceId || !date || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug)) {
      return NextResponse.json({ error: "A valid availability request is required." }, { status: 400 });
    }

    try {
      const availability = await dependencies.getAvailability({ organizationSlug, serviceId, date });
      return NextResponse.json({ date: availability.date, timezone: availability.timezone, slots: availability.slots.map(({ startAt, endAt }) => ({ startAt, endAt })) });
    } catch (error) {
      if (error instanceof AppointmentAvailabilityError && error.code === "invalid_request") return NextResponse.json({ error: "Availability could not be found." }, { status: 400 });
      return NextResponse.json({ error: "Availability is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
  };
}
