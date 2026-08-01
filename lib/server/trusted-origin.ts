import { getServerEnv } from "@/lib/env";

/** Validates browser-originated, cookie-authorized admin mutations. */
export function hasTrustedAdminMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const trusted = new URL(getServerEnv().NEXT_PUBLIC_SITE_URL);
    const candidate = new URL(origin);
    if (candidate.origin !== trusted.origin) return false;
    return getServerEnv().NODE_ENV !== "production" || candidate.protocol === "https:";
  } catch {
    return false;
  }
}
