import { createClient } from "@supabase/supabase-js";

export function hasSupabaseServiceConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service config is missing.");
  }
  return createClient(normalizeSupabaseUrl(url), serviceKey, {
    auth: {
      persistSession: false
    }
  });
}
