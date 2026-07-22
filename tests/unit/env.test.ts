import { describe, expect, it } from "vitest";
import { getAdminSessionSecret, getGoogleTokenEncryptionKey, getSmtpConfig, parseEnvironment } from "@/lib/env";

const baseEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000"
} satisfies NodeJS.ProcessEnv;

describe("environment validation", () => {
  it("requires a strong admin session secret in production", () => {
    expect(() => getAdminSessionSecret({ ...baseEnv, NODE_ENV: "production" })).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it("rejects malformed URL values", () => {
    expect(() => parseEnvironment({ ...baseEnv, NEXT_PUBLIC_SITE_URL: "not-a-url" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("rejects invalid enum and numeric values", () => {
    const invalidNodeEnv: Record<string, string> = { ...baseEnv, NODE_ENV: "staging" };
    expect(() => parseEnvironment(invalidNodeEnv)).toThrow(/NODE_ENV/);
    expect(() => parseEnvironment({ ...baseEnv, RATE_LIMIT_MAX: "0" })).toThrow(/RATE_LIMIT_MAX/);
  });

  it("accepts omitted optional integration variables", () => {
    expect(parseEnvironment(baseEnv)).toMatchObject({
      NODE_ENV: "test",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      DEFAULT_ORGANIZATION_SLUG: "avenseal",
      RATE_LIMIT_MAX: 8,
      RATE_LIMIT_WINDOW_MS: 60000
    });
  });

  it("accepts valid configuration and parses typed values", () => {
    const env = parseEnvironment({
      ...baseEnv,
      NODE_ENV: "production",
      ADMIN_SESSION_SECRET: "a-production-secret-with-enough-length",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-service-key",
      RATE_LIMIT_WINDOW_MS: "120000",
      RATE_LIMIT_MAX: "12",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "appointments@avenseal.com"
    });

    expect(env.RATE_LIMIT_WINDOW_MS).toBe(120000);
    expect(env.RATE_LIMIT_MAX).toBe(12);
    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe("true");
  });

  it("does not include secret values in validation errors", () => {
    const secret = "sk_test_do_not_echo_this_secret";
    expect(() => parseEnvironment({
      ...baseEnv,
      STRIPE_SECRET_KEY: secret,
      PLAYWRIGHT_BASE_URL: "bad-url"
    })).toThrow(/PLAYWRIGHT_BASE_URL/);

    try {
      parseEnvironment({ ...baseEnv, STRIPE_SECRET_KEY: secret, PLAYWRIGHT_BASE_URL: "bad-url" });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("returns null for incomplete optional SMTP configuration", () => {
    expect(getSmtpConfig({ ...baseEnv, EMAIL_FROM: "Avenseal <appointments@avenseal.com>" })).toBeNull();
  });

  it("validates Google token encryption key format", () => {
    const key = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
    expect(getGoogleTokenEncryptionKey({ ...baseEnv, GOOGLE_TOKEN_ENCRYPTION_KEY: key })).toHaveLength(32);
    expect(() => getGoogleTokenEncryptionKey({ ...baseEnv, GOOGLE_TOKEN_ENCRYPTION_KEY: "not-base64" })).toThrow(/GOOGLE_TOKEN_ENCRYPTION_KEY/);
  });
});
