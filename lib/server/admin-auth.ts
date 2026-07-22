import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminSessionSecret, getServerEnv } from "@/lib/env";
import { authenticateSupabaseUser, userHasOrganizationRole } from "@/lib/server/organization";
import { hasSupabaseServiceConfig } from "@/lib/supabase/server";

const cookieName = "avenseal_admin_session";

export function getAdminCookieName() {
  return cookieName;
}

function getSecret() {
  return getAdminSessionSecret();
}

export type AdminSessionPayload = {
  email: string;
  userId?: string;
  issuedAt: number;
};

export function signAdminSession(email: string, userId?: string) {
  const payload = Buffer.from(JSON.stringify({ email, userId, issuedAt: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readAdminSession(token?: string): AdminSessionPayload | null {
  if (!verifyAdminSession(token)) return null;
  const [payload] = token!.split(".");
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AdminSessionPayload>;
    if (!parsed.email || typeof parsed.email !== "string" || typeof parsed.issuedAt !== "number") return null;
    return { email: parsed.email, userId: typeof parsed.userId === "string" ? parsed.userId : undefined, issuedAt: parsed.issuedAt };
  } catch {
    return null;
  }
}

export function verifyAdminSession(token?: string) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(signatureBuffer, expectedBuffer);
}

export async function verifyAdminCredentials(email: string, password: string) {
  return Boolean(await authenticateAdminCredentials(email, password));
}

export async function authenticateAdminCredentials(email: string, password: string) {
  const env = getServerEnv();
  if (hasSupabaseServiceConfig() && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const user = await authenticateSupabaseUser(email, password);
    if (!user) return null;
    const allowed = await userHasOrganizationRole(user.id, ["owner", "admin"]);
    return allowed ? { email, userId: user.id } : null;
  }
  const expectedEmail = env.ADMIN_DEMO_EMAIL;
  const expectedPassword = env.ADMIN_DEMO_PASSWORD;
  return email === expectedEmail && password === expectedPassword ? { email } : null;
}
