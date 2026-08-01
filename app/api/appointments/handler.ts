import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppointmentAvailabilityError } from "@/lib/server/appointment-availability";
import { consumeDistributedRateLimit, rateLimitedResponse, requestRateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";
import { repository } from "@/lib/server/repository";
import { bookingSchema, type BookingInput } from "@/lib/validation";

const bookingEmailSchema = z.object({ email: z.string().trim().email().max(180) });

export type BookingHandlerDependencies = Readonly<{
  requestIdentity: (request: NextRequest) => string;
  consumeRateLimit: (policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>;
  createAppointment: (input: BookingInput) => ReturnType<typeof repository.createAppointment>;
}>;

const productionDependencies: BookingHandlerDependencies = {
  requestIdentity: requestRateLimitIdentity,
  consumeRateLimit: consumeDistributedRateLimit,
  createAppointment: (input) => repository.createAppointment(input)
};

export function createBookingHandler(dependencies: BookingHandlerDependencies = productionDependencies) {
  return async function handleBooking(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const email = bookingEmailSchema.safeParse(body);
    if (email.success) {
      try {
        const [ipRate, emailRate] = await Promise.all([
          dependencies.consumeRateLimit("booking", dependencies.requestIdentity(request)),
          dependencies.consumeRateLimit("booking_email", email.data.email)
        ]);
        if (!ipRate.allowed || !emailRate.allowed) return rateLimitedResponse(Math.max(ipRate.retryAfterSeconds, emailRate.retryAfterSeconds));
      } catch {
        return rateLimitedResponse(60);
      }
    }

    const parsed = bookingSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

    try {
      const appointment = await dependencies.createAppointment(parsed.data);
      return NextResponse.json({ status: appointment.status });
    } catch (error) {
      if (error instanceof AppointmentAvailabilityError && error.code !== "invalid_request") {
        return NextResponse.json({ error: "Availability is temporarily unavailable. Please try again shortly." }, { status: 503 });
      }
      const message = error instanceof Error ? error.message : "Unable to create appointment.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  };
}
