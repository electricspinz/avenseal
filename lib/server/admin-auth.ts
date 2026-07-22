import { createHmac, timingSafeEqual } from "node:crypto";
import { authenticateSupabaseUser, userHasOrganizationRole } from "@/lib/server/organization";
import { hasSupabaseServiceConfig } from "@/lib/supabase/server";

const cookieName = "avenseal_admin_session";

export function getAdminCookieName() {
  return cookieName;
}

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? "development-only-admin-session-secret";
}

export function signAdminSession(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, issuedAt: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
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
  if (hasSupabaseServiceConfig() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const user = await authenticateSupabaseUser(email, password);
    if (!user) return false;
    return userHasOrganizationRole(user.id, ["owner", "admin"]);
  }
  const expectedEmail = process.env.ADMIN_DEMO_EMAIL ?? "admin@avenseal.local";
  const expectedPassword = process.env.ADMIN_DEMO_PASSWORD ?? "password";
  return email === expectedEmail && password === expectedPassword;
}
