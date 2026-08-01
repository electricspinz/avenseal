import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createBookingHandler } from "@/app/api/appointments/handler";
import { createBookingAvailabilityHandler } from "@/app/api/booking/availability/handler";
import { createAvailabilityHandler } from "@/app/api/availability/handler";
import { AppointmentAvailabilityError } from "@/lib/server/appointment-availability";
import { InMemoryDistributedRateLimitStore, rateLimitIdentity, rateLimitPolicies, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";

const allowed: RateLimitResult = { allowed: true, retryAfterSeconds: 60 };
const booking = { serviceId: "00000000-0000-4000-8000-000000000002", fullName: "Customer Example", email: "customer@example.com", mobilePhone: "4075550100", documentCategory: "affidavit", documentCount: 1, signerCount: 1, estimatedNotarizations: 1, notarizationsNotSure: false, hasWitnessLines: false, witnessesAvailable: false, signerLocation: "Orlando, Florida", allSignersHaveGovernmentId: true, preferredDate: "2026-08-15", preferredTime: "10:00", urgency: "specific_date", consentAccepted: true } as const;
const serviceId = "00000000-0000-4000-8000-000000000002";
const bookingRequest = (body: unknown, ip = "203.0.113.40") => new NextRequest("http://localhost/api/appointments", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
const bookingAvailabilityRequest = (query = `organization=avenseal&service=${serviceId}&date=2026-08-15`, ip = "203.0.113.40") => new NextRequest(`http://localhost/api/booking/availability?${query}`, { headers: { "x-forwarded-for": ip } });
const availabilityRequest = (date = "2026-08-15", ip = "203.0.113.40") => new NextRequest(`http://localhost/api/availability?date=${date}`, { headers: { "x-forwarded-for": ip } });
const identity = (request: NextRequest) => request.headers.get("x-forwarded-for") ?? "unknown-client";

describe("public booking distributed rate limits", () => {
  it("runs the existing booking workflow only after allowed IP and email limits", async () => {
    const createAppointment = vi.fn().mockResolvedValue({ status: "awaiting_review" }); const consume = vi.fn().mockResolvedValue(allowed);
    const handle = createBookingHandler({ requestIdentity: identity, consumeRateLimit: consume, createAppointment });
    const response = await handle(bookingRequest({ ...booking, email: " Customer@Example.com " }));
    expect(response.status).toBe(200); expect(createAppointment).toHaveBeenCalledOnce(); expect(consume).toHaveBeenCalledWith("booking", "203.0.113.40"); expect(consume).toHaveBeenCalledWith("booking_email", "Customer@Example.com");
  });
  it("blocks IP/email limits and limiter failure before booking side effects", async () => {
    for (const consume of [vi.fn().mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 13 }).mockResolvedValueOnce(allowed), vi.fn().mockResolvedValueOnce(allowed).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 14 }), vi.fn().mockRejectedValue(new Error("unavailable"))]) {
      const createAppointment = vi.fn().mockResolvedValue({ status: "awaiting_review" }); const handle = createBookingHandler({ requestIdentity: identity, consumeRateLimit: consume, createAppointment }); const response = await handle(bookingRequest(booking));
      expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("60"); expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(await response.json()).toEqual({ status: "rate_limited" }); expect(createAppointment).not.toHaveBeenCalled();
    }
  });
  it("preserves malformed and unavailable-slot responses when allowed", async () => {
    const createAppointment = vi.fn().mockRejectedValue(new AppointmentAvailabilityError("google_connection_failure", "private")); const handle = createBookingHandler({ requestIdentity: identity, consumeRateLimit: vi.fn().mockResolvedValue(allowed), createAppointment });
    const malformed = await handle(bookingRequest({ email: "not-an-email" })); expect(malformed.status).toBe(400); expect(createAppointment).not.toHaveBeenCalled();
    const unavailable = await handle(bookingRequest(booking)); expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: "Availability is temporarily unavailable. Please try again shortly." });
  });
  it("shares hashed booking counters without returning raw identities", async () => {
    const store = new InMemoryDistributedRateLimitStore(() => 0); const keys: string[] = []; const consume = async (policy: RateLimitPolicy, value: string) => { const key = rateLimitIdentity(policy, value); keys.push(key); return store.consume(policy, key); }; const createAppointment = vi.fn().mockResolvedValue({ status: "awaiting_review" }); const first = createBookingHandler({ requestIdentity: identity, consumeRateLimit: consume, createAppointment }); const second = createBookingHandler({ requestIdentity: identity, consumeRateLimit: consume, createAppointment }); const ip = "203.0.113.77";
    for (let count = 0; count < 8; count++) expect((await (count % 2 ? first : second)(bookingRequest({ ...booking, email: `customer-${count}@example.com` }, ip))).status).toBe(200);
    const blocked = await second(bookingRequest({ ...booking, email: "secret@example.com" }, ip)); const body = await blocked.text(); expect(blocked.status).toBe(429); expect(body).not.toContain(ip); expect(body).not.toContain("secret@example.com"); expect(keys.every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(true);
  });
});

describe("public availability distributed rate limits", () => {
  const result = { date: "2026-08-15", timezone: "America/New_York", durationMinutes: 30, slots: [{ startAt: "2026-08-15T10:00:00-04:00", endAt: "2026-08-15T10:30:00-04:00" }] };
  it("runs booking availability only after the higher read-class policy", async () => {
    const workflow = vi.fn().mockResolvedValue(result); const consume = vi.fn().mockResolvedValue(allowed); const handle = createBookingAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: consume, getAvailability: workflow }); const response = await handle(bookingAvailabilityRequest());
    expect(response.status).toBe(200); expect(workflow).toHaveBeenCalledOnce(); expect(consume).toHaveBeenCalledWith("booking_availability", "203.0.113.40"); expect(rateLimitPolicies.booking_availability.limit).toBeGreaterThan(rateLimitPolicies.booking.limit);
  });
  it("blocks or fails closed before booking availability work and keeps malformed behavior", async () => {
    for (const consume of [vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 31 }), vi.fn().mockRejectedValue(new Error("unavailable"))]) { const workflow = vi.fn().mockResolvedValue(result); const handle = createBookingAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: consume, getAvailability: workflow }); const response = await handle(bookingAvailabilityRequest()); expect(response.status).toBe(429); expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(workflow).not.toHaveBeenCalled(); }
    const workflow = vi.fn().mockResolvedValue(result); const handle = createBookingAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: vi.fn().mockResolvedValue(allowed), getAvailability: workflow }); expect((await handle(bookingAvailabilityRequest("date=bad"))).status).toBe(400); expect(workflow).not.toHaveBeenCalled();
  });
  it("uses a separate policy namespace from general availability", async () => {
    const store = new InMemoryDistributedRateLimitStore(() => 0); const consume = (policy: RateLimitPolicy, value: string) => store.consume(policy, rateLimitIdentity(policy, value)); const bookingWorkflow = vi.fn().mockResolvedValue(result); const generalWorkflow = vi.fn().mockResolvedValue({ date: "2026-08-15", slots: [] }); const bookingHandle = createBookingAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: consume, getAvailability: bookingWorkflow }); const generalHandle = createAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: consume, getAvailableSlots: generalWorkflow }); const ip = "203.0.113.80";
    for (let count = 0; count < 60; count++) expect((await bookingHandle(bookingAvailabilityRequest(undefined, ip))).status).toBe(200);
    expect((await bookingHandle(bookingAvailabilityRequest(undefined, ip))).status).toBe(429); expect((await generalHandle(availabilityRequest(undefined, ip))).status).toBe(200); expect(generalWorkflow).toHaveBeenCalledOnce();
  });
  it("blocks or fails closed before general availability work and retains malformed behavior", async () => {
    const workflow = vi.fn().mockResolvedValue({ date: "2026-08-15", slots: [] }); const blocked = createAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 11 }), getAvailableSlots: workflow }); const response = await blocked(availabilityRequest()); expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("11"); expect(await response.json()).toEqual({ status: "rate_limited" }); expect(workflow).not.toHaveBeenCalled();
    const malformedWorkflow = vi.fn(); const malformed = createAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: vi.fn().mockResolvedValue(allowed), getAvailableSlots: malformedWorkflow }); expect((await malformed(availabilityRequest("bad"))).status).toBe(400); expect(malformedWorkflow).not.toHaveBeenCalled();
  });
  it("enforces the general availability read threshold with shared hashed counters", async () => {
    const store = new InMemoryDistributedRateLimitStore(() => 0); const keys: string[] = []; const consume = async (policy: RateLimitPolicy, value: string) => { const key = rateLimitIdentity(policy, value); keys.push(key); return store.consume(policy, key); }; const workflow = vi.fn().mockResolvedValue({ date: "2026-08-15", slots: [] }); const first = createAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: consume, getAvailableSlots: workflow }); const second = createAvailabilityHandler({ requestIdentity: identity, consumeRateLimit: consume, getAvailableSlots: workflow }); const ip = "203.0.113.82";
    for (let count = 0; count < 60; count++) expect((await (count % 2 ? first : second)(availabilityRequest(undefined, ip))).status).toBe(200);
    const blocked = await second(availabilityRequest(undefined, ip)); const body = await blocked.text(); expect(blocked.status).toBe(429); expect(body).not.toContain(ip); expect(keys.every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(true);
  });
});
