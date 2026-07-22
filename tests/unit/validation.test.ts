import { describe, expect, it } from "vitest";
import { hashAppointmentAccessToken } from "@/lib/server/repository";
import { bookingSchema, statusLinkRequestSchema } from "@/lib/validation";

const validBooking = {
  fullName: "Jane Morgan",
  email: "jane@example.com",
  mobilePhone: "(407) 555-0100",
  documentCategory: "affidavit",
  documentCount: 1,
  signerCount: 1,
  estimatedNotarizations: null,
  notarizationsNotSure: true,
  hasWitnessLines: null,
  witnessesAvailable: null,
  signerLocation: "Florida, USA",
  allSignersHaveGovernmentId: true,
  preferredDate: "2026-07-16",
  preferredTime: "14:00",
  urgency: "same_day",
  administrativeNotes: "Please review.",
  consentAccepted: true,
  privacyPolicyVersion: "legal-review-placeholder-2026-07",
  termsVersion: "legal-review-placeholder-2026-07"
};

describe("bookingSchema", () => {
  it("accepts compliant booking input", () => {
    expect(bookingSchema.safeParse(validBooking).success).toBe(true);
  });

  it("rejects missing consent", () => {
    expect(bookingSchema.safeParse({ ...validBooking, consentAccepted: false }).success).toBe(false);
  });

  it("sanitizes free text fields", () => {
    const parsed = bookingSchema.parse({ ...validBooking, administrativeNotes: "<script>alert(1)</script>" });
    expect(parsed.administrativeNotes).not.toContain("<");
  });
});

describe("statusLinkRequestSchema", () => {
  it("accepts an email and appointment reference", () => {
    expect(statusLinkRequestSchema.safeParse({ email: "jane@example.com", reference: "ABC123DEF4" }).success).toBe(true);
  });

  it("sanitizes reference text", () => {
    const parsed = statusLinkRequestSchema.parse({ email: "jane@example.com", reference: "<ABC123DEF4>" });
    expect(parsed.reference).toBe("ABC123DEF4");
  });
});

describe("appointment access token hashing", () => {
  it("stores only a deterministic SHA-256 token hash", () => {
    const token = "secure-token-example";
    const hash = hashAppointmentAccessToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
    expect(hashAppointmentAccessToken(token)).toBe(hash);
  });
});
