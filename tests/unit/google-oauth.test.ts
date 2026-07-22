import { describe, expect, it, vi } from "vitest";
import {
  assertGoogleOAuthState,
  buildGoogleAuthorizationUrl,
  decryptToken,
  encryptToken,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  googleCalendarScopes,
  isRevokedGoogleGrant,
  revokeGoogleToken,
  resolveRefreshTokenForStorage
} from "@/lib/server/google-oauth";

const encryptionKey = Buffer.from("0123456789abcdef0123456789abcdef");

describe("Google OAuth token security", () => {
  it("encrypts and decrypts token values", () => {
    const encrypted = encryptToken("refresh-token-secret", encryptionKey);

    expect(encrypted.ciphertext).not.toContain("refresh-token-secret");
    expect(decryptToken(encrypted, encryptionKey)).toBe("refresh-token-secret");
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptToken("refresh-token-secret", encryptionKey);

    expect(() => decryptToken({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}xx` }, encryptionKey)).toThrow(/could not be decrypted/);
  });

  it("rejects an incorrect key without exposing token material", () => {
    const encrypted = encryptToken("refresh-token-secret", encryptionKey);
    const wrongKey = Buffer.from("abcdef0123456789abcdef0123456789");

    try {
      decryptToken(encrypted, wrongKey);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("refresh-token-secret");
    }
  });
});

describe("Google OAuth state validation", () => {
  const validState = {
    id: "state-id",
    organization_id: "org-1",
    user_id: "user-1",
    redirect_path: "/admin/settings/integrations",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null
  };

  it("accepts valid state", () => {
    expect(() => assertGoogleOAuthState(validState, { organizationId: "org-1", userId: "user-1" })).not.toThrow();
  });

  it("rejects expired, tampered, mismatched, and replayed state", () => {
    expect(() => assertGoogleOAuthState({ ...validState, expires_at: new Date(Date.now() - 1).toISOString() }, { organizationId: "org-1", userId: "user-1" })).toThrow(/expired/);
    expect(() => assertGoogleOAuthState(undefined, { organizationId: "org-1", userId: "user-1" })).toThrow(/Invalid/);
    expect(() => assertGoogleOAuthState(validState, { organizationId: "other-org", userId: "user-1" })).toThrow(/organization mismatch/);
    expect(() => assertGoogleOAuthState(validState, { organizationId: "org-1", userId: "other-user" })).toThrow(/user mismatch/);
    expect(() => assertGoogleOAuthState({ ...validState, used_at: new Date().toISOString() }, { organizationId: "org-1", userId: "user-1" })).toThrow(/already been used/);
  });
});

describe("Google OAuth provider calls", () => {
  it("builds the minimum calendar authorization URL", () => {
    const url = buildGoogleAuthorizationUrl({ state: "state", clientId: "client-id", redirectUri: "http://localhost/callback" });

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(googleCalendarScopes);
  });

  it("handles provider denial and callback errors without exposing codes or tokens", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost/callback";
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_grant", error_description: "bad-code authorization-code-secret" })
    });

    await expect(exchangeGoogleAuthorizationCode("authorization-code-secret", fetcher)).rejects.toThrow(/invalid_grant/);
    await expect(exchangeGoogleAuthorizationCode("authorization-code-secret", fetcher)).rejects.not.toThrow(/authorization-code-secret/);
  });

  it("verifies Google identity through userinfo", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "google-user", email: "owner@example.com" })
    });

    await expect(fetchGoogleUserInfo("access-token", fetcher)).resolves.toEqual({ id: "google-user", email: "owner@example.com" });
  });

  it("classifies revoked grants separately from temporary errors", () => {
    expect(isRevokedGoogleGrant(new Error("invalid_grant: revoked"))).toBe(true);
    expect(isRevokedGoogleGrant(new Error("temporarily_unavailable"))).toBe(false);
  });

  it("revokes tokens in the request body rather than the URL", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    await revokeGoogleToken("refresh-token-secret", fetcher);

    expect(fetcher).toHaveBeenCalledWith("https://oauth2.googleapis.com/revoke", expect.objectContaining({
      method: "POST",
      body: expect.any(URLSearchParams)
    }));
    const [, init] = fetcher.mock.calls[0];
    expect(String(init.body)).toBe("token=refresh-token-secret");
  });

  it("preserves an existing refresh token when Google omits a new one", () => {
    expect(resolveRefreshTokenForStorage(undefined, {
      encrypted_refresh_token: "ciphertext",
      refresh_token_iv: "iv",
      refresh_token_tag: "tag"
    })).toEqual({ ciphertext: "ciphertext", iv: "iv", tag: "tag" });
  });
});
