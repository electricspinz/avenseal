import { z } from "zod";

export const appointmentDocumentStatuses = ["uploaded", "approved", "rejected"] as const;

export type AppointmentDocumentStatus = (typeof appointmentDocumentStatuses)[number];
export type DocumentReviewer = Readonly<{ id: string; role: "owner" | "admin" }>;

const reviewNotesSchema = z
  .string()
  .trim()
  .max(2_000, "Review notes must be 2,000 characters or fewer.")
  .refine((value) => !/[<>]/.test(value), "Review notes must be plain text.")
  .refine((value) => !/(^|\s)(#{1,6}\s|[-*+]\s|>\s|`|\[[^\]]+\]\([^)]*\))/.test(value), "Review notes must be plain text.");

export function validateDocumentReviewer(reviewer: DocumentReviewer): DocumentReviewer {
  return z.object({ id: z.string().uuid(), role: z.enum(["owner", "admin"]) }).parse(reviewer);
}

export function validateReviewNotes(reviewNotes: string | null | undefined): string | null {
  if (reviewNotes === null || reviewNotes === undefined) return null;
  const normalized = reviewNotes.trim();
  return normalized.length === 0 ? null : reviewNotesSchema.parse(normalized);
}

export function assertDocumentReviewTransition(from: AppointmentDocumentStatus, to: Exclude<AppointmentDocumentStatus, "uploaded">) {
  if (!appointmentDocumentStatuses.includes(from)) throw new Error("Document has an unknown review status.");
  if (from === to) throw new Error(`Document is already ${to}.`);
  if (from !== "uploaded" && from !== "approved" && from !== "rejected") throw new Error("Document review transition is not allowed.");
}
