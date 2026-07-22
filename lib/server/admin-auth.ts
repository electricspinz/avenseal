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
  const env = getServerEnv();
  if (hasSupabaseServiceConfig() && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const user = await authenticateSupabaseUser(email, password);
    if (!user) return false;
    return userHasOrganizationRole(user.id, ["owner", "admin"]);
  }
  const expectedEmail = env.ADMIN_DEMO_EMAIL;
  const expectedPassword = env.ADMIN_DEMO_PASSWORD;
  return email === expectedEmail && password === expectedPassword;
}
