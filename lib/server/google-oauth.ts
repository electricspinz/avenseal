import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getGoogleTokenEncryptionKey, getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const googleCalendarScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy"
];

const stateTtlMs = 10 * 60 * 1000;
const refreshSafetyWindowMs = 5 * 60 * 1000;

type Fetcher = typeof fetch;

type EncryptedValue = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export type GoogleConnectionRow = {
  id: string;
  organization_id: string;
  google_account_id: string | null;
  google_account_email: string | null;
  encrypted_refresh_token: string | null;
  refresh_token_iv: string | null;
  refresh_token_tag: string | null;
  encrypted_access_token: string | null;
  access_token_iv: string | null;
  access_token_tag: string | null;
  access_token_expires_at: string | null;
  scopes: string[] | null;
  status: "connected" | "disconnected" | "reconnect_required" | "error";
  last_successful_refresh_at: string | null;
  last_verified_at: string | null;
  last_error_category: string | null;
  last_error_message: string | null;
  disconnected_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoogleConnectionStatus = {
  status: "connected" | "disconnected" | "reconnect_required" | "error";
  accountEmail: string | null;
  scopes: string[];
  lastVerifiedAt: string | null;
  lastSuccessfulRefreshAt: string | null;
  lastErrorCategory: string | null;
  lastErrorMessage: string | null;
  disconnectedAt: string | null;
};

export type GoogleOAuthStateRecord = {
  id: string;
  organization_id: string;
  user_id: string;
  redirect_path: string;
  expires_at: string;
  used_at: string | null;
};

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function encryptToken(plaintext: string, key = getGoogleTokenEncryptionKey()): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
  };
}

export function decryptToken(encrypted: EncryptedValue, key = getGoogleTokenEncryptionKey()) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error("Encrypted Google token could not be decrypted.");
  }
}

export function createOAuthStateValue() {
  return randomBytes(32).toString("base64url");
}

export function buildGoogleAuthorizationUrl(input: { state: string; redirectUri: string; clientId: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleCalendarScopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  return url;
}

export async function createGoogleOAuthState(input: { organizationId: string; userId: string; redirectPath?: string }) {
  const state = createOAuthStateValue();
  const expiresAt = new Date(Date.now() + stateTtlMs).toISOString();
  const { error } = await getSupabaseAdmin().from("google_oauth_states").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    state_hash: hashOAuthState(state),
    redirect_path: input.redirectPath ?? "/admin/settings/integrations",
    expires_at: expiresAt
  });
  if (error) throw error;
  return state;
}

export async function consumeGoogleOAuthState(input: { state: string; organizationId: string; userId: string }) {
  const stateHash = hashOAuthState(input.state);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("google_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state_hash", stateHash)
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id,organization_id,user_id,redirect_path,expires_at,used_at")
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("Invalid, expired, or already used Google OAuth state.");
  return { redirectPath: String(row.redirect_path) };
}

export function assertGoogleOAuthState(
  row: GoogleOAuthStateRecord | undefined,
  expected: { organizationId: string; userId: string },
  now = Date.now()
) {
  if (!row) throw new Error("Invalid Google OAuth state.");
  if (String(row.organization_id) !== expected.organizationId) throw new Error("Google OAuth state organization mismatch.");
  if (String(row.user_id) !== expected.userId) throw new Error("Google OAuth state user mismatch.");
  if (row.used_at) throw new Error("Google OAuth state has already been used.");
  if (new Date(String(row.expires_at)).getTime() <= now) throw new Error("Google OAuth state has expired.");
}

async function postGoogleForm<T>(url: string, body: URLSearchParams, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const category = typeof json.error === "string" ? json.error : "provider_error";
    throw new Error(`${category}: Google OAuth request failed.`);
  }
  return json as T;
}

export async function exchangeGoogleAuthorizationCode(code: string, fetcher: Fetcher = fetch) {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error("Google OAuth is not configured.");
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI
  });
  return postGoogleForm<GoogleTokenResponse>("https://oauth2.googleapis.com/token", body, fetcher);
}

export async function fetchGoogleUserInfo(accessToken: string, fetcher: Fetcher = fetch) {
  const response = await fetcher("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Google account verification failed.");
  return {
    id: typeof json.id === "string" ? json.id : null,
    email: typeof json.email === "string" ? json.email : null
  };
}

function mapStatus(row: GoogleConnectionRow | null): GoogleConnectionStatus {
  if (!row) {
    return {
      status: "disconnected",
      accountEmail: null,
      scopes: [],
      lastVerifiedAt: null,
      lastSuccessfulRefreshAt: null,
      lastErrorCategory: null,
      lastErrorMessage: null,
      disconnectedAt: null
    };
  }
  return {
    status: row.status,
    accountEmail: row.google_account_email,
    scopes: row.scopes ?? [],
    lastVerifiedAt: row.last_verified_at,
    lastSuccessfulRefreshAt: row.last_successful_refresh_at,
    lastErrorCategory: row.last_error_category,
    lastErrorMessage: row.last_error_message,
    disconnectedAt: row.disconnected_at
  };
}

export async function getGoogleConnectionStatus(organizationId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("google_oauth_connections")
    .select("id,organization_id,google_account_id,google_account_email,access_token_expires_at,scopes,status,last_successful_refresh_at,last_verified_at,last_error_category,last_error_message,disconnected_at,revoked_at,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "google")
    .limit(1);
  if (error?.code === "PGRST205" || error?.code === "42P01") return mapStatus(null);
  if (error) throw error;
  return mapStatus((data?.[0] as GoogleConnectionRow | undefined) ?? null);
}

export async function upsertGoogleIntegrationSummary(input: {
  organizationId: string;
  status: "connected" | "disconnected" | "reconnect_required" | "error";
  accountEmail?: string | null;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
}) {
  const integrationStatus = input.status === "connected" ? "connected" : input.status === "disconnected" ? "disconnected" : "error";
  const { error } = await getSupabaseAdmin().from("organization_integrations").upsert({
    organization_id: input.organizationId,
    provider: "google_calendar",
    status: integrationStatus,
    account_label: input.accountEmail ?? "Google Calendar",
    last_connected_at: input.status === "connected" ? input.lastVerifiedAt ?? new Date().toISOString() : null,
    last_synced_at: input.lastVerifiedAt ?? null,
    last_error: input.lastError ?? null,
    metadata: { oauthStatus: input.status }
  }, { onConflict: "organization_id,provider" });
  if (error && error.code !== "PGRST205") throw error;
}

export async function storeGoogleConnection(input: {
  organizationId: string;
  tokens: GoogleTokenResponse;
  googleAccount: { id: string | null; email: string | null };
}) {
  const supabase = getSupabaseAdmin();
  const { data: existingRows, error: existingError } = await supabase
    .from("google_oauth_connections")
    .select("encrypted_refresh_token,refresh_token_iv,refresh_token_tag")
    .eq("organization_id", input.organizationId)
    .eq("provider", "google")
    .limit(1);
  if (existingError && existingError.code !== "PGRST205") throw existingError;
  const existing = existingRows?.[0] as Partial<GoogleConnectionRow> | undefined;

  const refreshToken = resolveRefreshTokenForStorage(input.tokens.refresh_token, existing);
  if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect with consent is required.");

  const accessToken = encryptToken(input.tokens.access_token);
  const expiresAt = input.tokens.expires_in
    ? new Date(Date.now() + input.tokens.expires_in * 1000).toISOString()
    : null;
  const scopes = input.tokens.scope?.split(/\s+/).filter(Boolean) ?? googleCalendarScopes;

  const { error } = await supabase.from("google_oauth_connections").upsert({
    organization_id: input.organizationId,
    provider: "google",
    google_account_id: input.googleAccount.id,
    google_account_email: input.googleAccount.email,
    encrypted_refresh_token: refreshToken.ciphertext,
    refresh_token_iv: refreshToken.iv,
    refresh_token_tag: refreshToken.tag,
    encrypted_access_token: accessToken.ciphertext,
    access_token_iv: accessToken.iv,
    access_token_tag: accessToken.tag,
    access_token_expires_at: expiresAt,
    scopes,
    status: "connected",
    last_verified_at: new Date().toISOString(),
    last_error_category: null,
    last_error_message: null,
    disconnected_at: null,
    revoked_at: null
  }, { onConflict: "organization_id,provider" });
  if (error) throw error;
  await upsertGoogleIntegrationSummary({
    organizationId: input.organizationId,
    status: "connected",
    accountEmail: input.googleAccount.email,
    lastVerifiedAt: new Date().toISOString()
  });
}

export function resolveRefreshTokenForStorage(
  refreshToken: string | undefined,
  existing?: Partial<Pick<GoogleConnectionRow, "encrypted_refresh_token" | "refresh_token_iv" | "refresh_token_tag">>
) {
  if (refreshToken) return encryptToken(refreshToken);
  if (existing?.encrypted_refresh_token && existing.refresh_token_iv && existing.refresh_token_tag) {
    return {
      ciphertext: existing.encrypted_refresh_token,
      iv: existing.refresh_token_iv,
      tag: existing.refresh_token_tag
    };
  }
  return null;
}

function encryptedValueFromRow(row: GoogleConnectionRow, prefix: "access" | "refresh") {
  const ciphertext = prefix === "access" ? row.encrypted_access_token : row.encrypted_refresh_token;
  const iv = prefix === "access" ? row.access_token_iv : row.refresh_token_iv;
  const tag = prefix === "access" ? row.access_token_tag : row.refresh_token_tag;
  if (!ciphertext || !iv || !tag) return null;
  return { ciphertext, iv, tag };
}

export async function getValidGoogleAccessToken(organizationId: string, fetcher: Fetcher = fetch) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("google_oauth_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google")
    .limit(1);
  if (error) throw error;
  const row = data?.[0] as GoogleConnectionRow | undefined;
  if (!row || row.status !== "connected") throw new Error("Google Calendar is not connected.");

  const encryptedAccess = encryptedValueFromRow(row, "access");
  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (encryptedAccess && expiresAt - refreshSafetyWindowMs > Date.now()) {
    return decryptToken(encryptedAccess);
  }

  const encryptedRefresh = encryptedValueFromRow(row, "refresh");
  if (!encryptedRefresh) throw new Error("Google Calendar reconnect is required.");
  const refreshToken = decryptToken(encryptedRefresh);
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth is not configured.");

  try {
    const tokens = await postGoogleForm<GoogleTokenResponse>("https://oauth2.googleapis.com/token", new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }), fetcher);
    const accessToken = encryptToken(tokens.access_token);
    const rotatedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    const expires = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
    await supabase.from("google_oauth_connections").update({
      encrypted_access_token: accessToken.ciphertext,
      access_token_iv: accessToken.iv,
      access_token_tag: accessToken.tag,
      access_token_expires_at: expires,
      ...(rotatedRefreshToken
        ? {
            encrypted_refresh_token: rotatedRefreshToken.ciphertext,
            refresh_token_iv: rotatedRefreshToken.iv,
            refresh_token_tag: rotatedRefreshToken.tag
          }
        : {}),
      status: "connected",
      last_successful_refresh_at: new Date().toISOString(),
      last_error_category: null,
      last_error_message: null
    }).eq("id", row.id);
    return tokens.access_token;
  } catch (error) {
    const revoked = isRevokedGoogleGrant(error);
    await supabase.from("google_oauth_connections").update({
      status: revoked ? "reconnect_required" : "error",
      last_error_category: revoked ? "revoked" : "temporary_provider_failure",
      last_error_message: revoked ? "Google authorization was revoked or expired." : "Google token refresh failed."
    }).eq("id", row.id);
    throw new Error(revoked ? "Google Calendar reconnect is required." : "Google token refresh failed.");
  }
}

export function isRevokedGoogleGrant(error: unknown) {
  return error instanceof Error && error.message.includes("invalid_grant");
}

export async function revokeGoogleToken(token: string, fetcher: Fetcher = fetch) {
  await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token })
  }).catch(() => undefined);
}

export async function disconnectGoogleConnection(organizationId: string, fetcher: Fetcher = fetch) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("google_oauth_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google")
    .limit(1);
  if (error && error.code !== "PGRST205") throw error;
  const row = data?.[0] as GoogleConnectionRow | undefined;
  if (row) {
    const encryptedRefresh = encryptedValueFromRow(row, "refresh");
    if (encryptedRefresh) {
      const refreshToken = decryptToken(encryptedRefresh);
      await revokeGoogleToken(refreshToken, fetcher);
    }
    await supabase.from("google_oauth_connections").update({
      status: "disconnected",
      encrypted_access_token: null,
      access_token_iv: null,
      access_token_tag: null,
      access_token_expires_at: null,
      encrypted_refresh_token: null,
      refresh_token_iv: null,
      refresh_token_tag: null,
      disconnected_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(),
      last_error_category: null,
      last_error_message: null
    }).eq("id", row.id);
  }
  await upsertGoogleIntegrationSummary({ organizationId, status: "disconnected", accountEmail: row?.google_account_email ?? null });
}
