import { z } from "zod";

export const externalSessionStatuses = ["pending", "scheduled", "ready", "in_progress", "completed", "cancelled", "unknown"] as const;
export type ExternalSessionStatus = (typeof externalSessionStatuses)[number];
export type ExternalSession = Readonly<{ appointmentId: string; organizationId: string; provider: string; sessionName: string; launchUrl: string | null; referenceNumber: string | null; status: ExternalSessionStatus; notes: string | null; createdAt: string; updatedAt: string; metadata: Readonly<Record<string, string | number | boolean | null>> }>;

export const externalSessionInputSchema = z.object({ provider: z.string().trim().min(1).max(100), sessionName: z.string().trim().min(1).max(160), launchUrl: z.string().trim().url().max(2048).nullable().optional().refine((value) => !value || /^https?:\/\//i.test(value), "Launch URL must use HTTP or HTTPS."), referenceNumber: z.string().trim().max(160).nullable().optional(), status: z.enum(externalSessionStatuses), notes: z.string().trim().max(1000).nullable().optional() });
export type ExternalSessionInput = z.infer<typeof externalSessionInputSchema>;

const sessions = new Map<string, ExternalSession>();
const key = (organizationId: string, appointmentId: string) => `${organizationId}:${appointmentId}`;

export function getExternalSession(organizationId: string, appointmentId: string) { const session = sessions.get(key(organizationId, appointmentId)); return session ? copy(session) : null; }
export function saveExternalSession(organizationId: string, appointmentId: string, input: ExternalSessionInput, now = new Date()): ExternalSession { const existing = sessions.get(key(organizationId, appointmentId)); const timestamp = now.toISOString(); const session: ExternalSession = { appointmentId, organizationId, provider: input.provider, sessionName: input.sessionName, launchUrl: input.launchUrl ?? null, referenceNumber: input.referenceNumber ?? null, status: input.status, notes: input.notes ?? null, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, metadata: {} }; sessions.set(key(organizationId, appointmentId), session); return copy(session); }
export function removeExternalSession(organizationId: string, appointmentId: string) { return sessions.delete(key(organizationId, appointmentId)); }
function copy(session: ExternalSession): ExternalSession { return { ...session, metadata: { ...session.metadata } }; }
