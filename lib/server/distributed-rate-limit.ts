import { createHmac } from "node:crypto";
import { getAdminSessionSecret, getServerEnv } from "@/lib/env";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";

export const rateLimitPolicies = { admin_login_ip: { limit: 10, windowSeconds: 900 }, admin_login_email: { limit: 5, windowSeconds: 900 }, magic_link_ip: { limit: 10, windowSeconds: 900 }, magic_link_email: { limit: 3, windowSeconds: 900 }, client_workspace_access_ip: { limit: 10, windowSeconds: 900 }, client_workspace_access_email: { limit: 3, windowSeconds: 900 }, booking: { limit: 8, windowSeconds: 60 }, booking_email: { limit: 5, windowSeconds: 60 }, booking_availability: { limit: 60, windowSeconds: 60 }, availability: { limit: 60, windowSeconds: 60 }, client_document_upload_ip: { limit: 10, windowSeconds: 900 }, client_document_upload_scoped: { limit: 10, windowSeconds: 900 }, client_payment_ip: { limit: 5, windowSeconds: 300 }, client_payment_scoped: { limit: 5, windowSeconds: 300 }, external_session_launch_ip: { limit: 20, windowSeconds: 300 }, external_session_launch_scoped: { limit: 20, windowSeconds: 300 }, admin_payment_link: { limit: 10, windowSeconds: 300 }, admin_client_access_generate: { limit: 10, windowSeconds: 300 }, admin_client_access_send: { limit: 5, windowSeconds: 300 }, admin_communication_retry: { limit: 10, windowSeconds: 300 }, admin_calendar_retry: { limit: 5, windowSeconds: 300 }, admin_provider_action: { limit: 10, windowSeconds: 300 } } as const;
export type RateLimitPolicy = keyof typeof rateLimitPolicies;
export type RateLimitResult = Readonly<{ allowed: boolean; retryAfterSeconds: number }>;
export interface DistributedRateLimitStore { consume(policy: RateLimitPolicy, identityHash: string): Promise<RateLimitResult>; }

export class InMemoryDistributedRateLimitStore implements DistributedRateLimitStore {
  private readonly counters = new Map<string, { count: number; endsAt: number }>();
  constructor(private readonly now: () => number = () => Date.now(), private readonly fail = false) {}
  async consume(policy: RateLimitPolicy, identityHash: string): Promise<RateLimitResult> {
    if (this.fail) throw new Error("Rate limiting is unavailable.");
    const config = rateLimitPolicies[policy]; const now = this.now(); const start = Math.floor(now / (config.windowSeconds * 1000)) * config.windowSeconds * 1000; const key = `${policy}:${identityHash}:${start}`;
    const counter = this.counters.get(key) ?? { count: 0, endsAt: start + config.windowSeconds * 1000 }; counter.count += 1; this.counters.set(key, counter);
    return { allowed: counter.count <= config.limit, retryAfterSeconds: Math.max(1, Math.ceil((counter.endsAt - now) / 1000)) };
  }
}

export function rateLimitIdentity(policy: RateLimitPolicy, rawIdentity: string) {
  return createHmac("sha256", getAdminSessionSecret()).update(`${policy}:${rawIdentity.trim().toLowerCase()}`).digest("hex");
}

export async function consumeDistributedRateLimit(policy: RateLimitPolicy, rawIdentity: string) {
  if (!hasSupabaseServiceConfig()) return { allowed: getServerEnv().NODE_ENV !== "production", retryAfterSeconds: 60 };
  const config = rateLimitPolicies[policy];
  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit", { p_policy: policy, p_identity_hash: rateLimitIdentity(policy, rawIdentity), p_limit: config.limit, p_window_seconds: config.windowSeconds });
  if (error || !data?.[0]) throw new Error("Rate limiting is unavailable.");
  return { allowed: Boolean(data[0].allowed), retryAfterSeconds: Number(data[0].retry_after_seconds) };
}

export function rateLimitedResponse(retryAfterSeconds: number, noStore = true) {
  return Response.json({ status: "rate_limited" }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))), ...(noStore ? { "Cache-Control": "no-store" } : {}) } });
}

/** Vercel's trusted deployment header takes precedence; local development falls back safely. */
export function requestRateLimitIdentity(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown-client").slice(0, 128);
}
