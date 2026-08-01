import { NextRequest, NextResponse } from "next/server";
import { consumeDistributedRateLimit, rateLimitedResponse, requestRateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";
import { repository } from "@/lib/server/repository";

export type AvailabilityHandlerDependencies = Readonly<{
  requestIdentity: (request: NextRequest) => string;
  consumeRateLimit: (policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>;
  getAvailableSlots: (date: string) => ReturnType<typeof repository.getAvailableSlots>;
}>;

const productionDependencies: AvailabilityHandlerDependencies = {
  requestIdentity: requestRateLimitIdentity,
  consumeRateLimit: consumeDistributedRateLimit,
  getAvailableSlots: (date) => repository.getAvailableSlots(date)
};

export function createAvailabilityHandler(dependencies: AvailabilityHandlerDependencies = productionDependencies) {
  return async function handleAvailability(request: NextRequest) {
    try {
      const rate = await dependencies.consumeRateLimit("availability", dependencies.requestIdentity(request));
      if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
    } catch {
      return rateLimitedResponse(60);
    }

    const date = request.nextUrl.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Valid date is required." }, { status: 400 });

    try {
      return NextResponse.json(await dependencies.getAvailableSlots(date));
    } catch {
      return NextResponse.json({ error: "Availability is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
  };
}
