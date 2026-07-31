import { z } from "zod";

export const externalSessionStatuses = ["pending", "scheduled", "ready", "in_progress", "completed", "cancelled", "unknown"] as const;
export type ExternalSessionStatus = (typeof externalSessionStatuses)[number];
export type ExternalSession = Readonly<{ appointmentId: string; organizationId: string; provider: string; sessionName: string; launchUrl: string | null; referenceNumber: string | null; status: ExternalSessionStatus; notes: string | null; createdAt: string; updatedAt: string; metadata: Readonly<Record<string, string | number | boolean | null>> }>;

export const externalSessionInputSchema = z.object({ provider: z.string().trim().min(1).max(100), sessionName: z.string().trim().min(1).max(160), launchUrl: z.string().trim().url().max(2048).nullable().optional().refine((value) => { if (!value) return true; try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } }, "Launch URL must be a valid HTTPS URL without credentials."), referenceNumber: z.string().trim().max(160).nullable().optional(), status: z.enum(externalSessionStatuses), notes: z.string().trim().max(1000).nullable().optional() });
export type ExternalSessionInput = z.infer<typeof externalSessionInputSchema>;

export function isCustomerVisibleExternalSession(input: { paymentStatus: string | null; appointmentStatus: string; organizationId: string; appointmentId: string; session: ExternalSession | null }) {
  const session = input.session;
  if (!session || session.organizationId !== input.organizationId || session.appointmentId !== input.appointmentId) return false;
  if (input.paymentStatus !== "paid" || !["confirmed", "ready"].includes(input.appointmentStatus)) return false;
  if (!["scheduled", "ready", "in_progress"].includes(session.status) || !session.launchUrl) return false;
  try { return new URL(session.launchUrl).protocol === "https:"; } catch { return false; }
}

export function isCustomerVisibleExternalSessionStatus(status: ExternalSessionStatus) { return ["scheduled", "ready", "in_progress"].includes(status); }
