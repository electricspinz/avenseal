import { getServerEnv } from "@/lib/env";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string) {
  const env = getServerEnv();
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const max = env.RATE_LIMIT_MAX;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }

  if (current.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  current.count += 1;
  return { allowed: true, remaining: max - current.count };
}
