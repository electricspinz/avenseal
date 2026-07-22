import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

export function hasSupabaseServiceConfig() {
  const env = getServerEnv();
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function normalizeSupabaseUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith("/rest/v1")) {
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
  }
  return parsed.toString().replace(/\/$/, "");
}

export function getSupabaseAdmin() {
  const env = getServerEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service config is missing.");
  }
  return createClient(normalizeSupabaseUrl(url), serviceKey, {
    auth: {
      persistSession: false
    }
  });
}
