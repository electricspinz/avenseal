import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type ClientWorkspaceTokenPurpose = "client_workspace";
export type ClientWorkspaceAccessToken = Readonly<{ identifier: string; organizationId: string; appointmentId: string; expiresAt: string; issuedAt: string; revokedAt: string | null; lastAccessedAt: string | null; purpose: ClientWorkspaceTokenPurpose; createdBy: string | null }>;
export type ClientWorkspaceAuditEvent = Readonly<{ type: "client_workspace_token_issued" | "client_workspace_token_revoked" | "client_workspace_token_validated" | "client_workspace_token_expired"; organizationId: string; appointmentId: string; tokenIdentifier: string; occurredAt: string; safeMetadata: Readonly<Record<string, string | number | boolean | null>> }>;

export function generateClientWorkspaceToken() { return randomBytes(32).toString("base64url"); }
export function hashClientWorkspaceToken(token: string) { return createHash("sha256").update(token).digest(); }
export function clientWorkspaceTokenHashesEqual(left: Buffer, right: Buffer) { return left.length === right.length && timingSafeEqual(left, right); }
export function isClientWorkspaceTokenActive(token: ClientWorkspaceAccessToken, now = new Date()) { return !token.revokedAt && Date.parse(token.expiresAt) > now.getTime(); }
