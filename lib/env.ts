import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => value === "" ? undefined : value;

const optionalString = z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional());
const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().trim().url().optional());
const optionalEmail = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address.").optional()
);
const optionalPositiveInt = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().positive().optional()
);
const optionalBooleanString = z.preprocess(
  (value) => typeof value === "string" ? value.trim().toLowerCase() : value,
  z.enum(["true", "false"]).optional()
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  NEXT_PUBLIC_SITE_URL: optionalUrl.default("http://localhost:3000"),

  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  DEFAULT_ORGANIZATION_SLUG: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase slug, such as avenseal.").default("avenseal")
  ),

  ADMIN_DEMO_EMAIL: optionalEmail.default("admin@avenseal.local"),
  ADMIN_DEMO_PASSWORD: optionalString.default("password"),
  ADMIN_SESSION_SECRET: optionalString,

  RATE_LIMIT_WINDOW_MS: optionalPositiveInt.default(60000),
  RATE_LIMIT_MAX: optionalPositiveInt.default(8),

  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_OAUTH_REDIRECT_URI: optionalUrl,
  GOOGLE_CALENDAR_ID: optionalString,
  GOOGLE_CALENDAR_ACCESS_TOKEN: optionalString,

  EMAIL_FROM: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPositiveInt,
  SMTP_SECURE: optionalBooleanString,
  SMTP_USER: optionalEmail,
  SMTP_PASSWORD: optionalString,

  E2E_PORT: optionalPositiveInt,
  PLAYWRIGHT_BASE_URL: optionalUrl,
  E2E_SKIP_WEB_SERVER: optionalString
});

export type AppEnvironment = z.infer<typeof environmentSchema>;

function formatEnvironmentError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
}

function requireProductionSecret(name: string, value: string | undefined, minLength = 32) {
  if (!value || value.length < minLength) {
    throw new Error(`Invalid environment configuration: ${name} must be set to a strong server-side secret in production.`);
  }
}

type RawEnvironment = Record<string, string | undefined>;

export function parseEnvironment(rawEnv: RawEnvironment = process.env): AppEnvironment {
  const parsed = environmentSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatEnvironmentError(parsed.error)}`);
  }

  return parsed.data;
}

export function getServerEnv() {
  return parseEnvironment(process.env);
}

export function getPublicEnv() {
  const env = getServerEnv();
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL
  };
}

export function getSmtpConfig(rawEnv: RawEnvironment = process.env) {
  const env = parseEnvironment(rawEnv);
  if (!env.EMAIL_FROM || !env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_SECURE || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    return null;
  }

  return {
    from: env.EMAIL_FROM,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD
  };
}

export function getAdminSessionSecret(rawEnv: RawEnvironment = process.env) {
  const env = parseEnvironment(rawEnv);
  if (env.NODE_ENV === "production") {
    requireProductionSecret("ADMIN_SESSION_SECRET", env.ADMIN_SESSION_SECRET);
  }
  return env.ADMIN_SESSION_SECRET ?? "development-only-admin-session-secret";
}
