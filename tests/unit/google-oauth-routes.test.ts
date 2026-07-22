import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminOrganizationContext: vi.fn(),
  createGoogleOAuthState: vi.fn(),
  buildGoogleAuthorizationUrl: vi.fn(),
  disconnectGoogleConnection: vi.fn(),
  getSupabaseAdmin: vi.fn()
}));

vi.mock("@/lib/server/admin-context", () => ({
  requireAdminOrganizationContext: mocks.requireAdminOrganizationContext
}));

vi.mock("@/lib/server/google-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/google-oauth")>();
  return {
    ...actual,
    createGoogleOAuthState: mocks.createGoogleOAuthState,
    buildGoogleAuthorizationUrl: mocks.buildGoogleAuthorizationUrl,
    disconnectGoogleConnection: mocks.disconnectGoogleConnection
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin
}));

describe("Google OAuth admin routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("rejects unauthorized connect attempts safely", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/admin/integrations/google/callback";
    mocks.requireAdminOrganizationContext.mockRejectedValue(new Error("No access"));
    const { GET } = await import("@/app/api/admin/integrations/google/connect/route");

    const response = await GET();

    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/settings/integrations?google=unauthorized");
    expect(mocks.createGoogleOAuthState).not.toHaveBeenCalled();
  });

  it("redirects authorized admins to Google without exposing secrets", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/admin/integrations/google/callback";
    mocks.requireAdminOrganizationContext.mockResolvedValue({ organizationId: "org-1", userId: "user-1" });
    mocks.createGoogleOAuthState.mockResolvedValue("state-value");
    mocks.buildGoogleAuthorizationUrl.mockReturnValue(new URL("https://accounts.google.com/o/oauth2/v2/auth?state=state-value"));
    const { GET } = await import("@/app/api/admin/integrations/google/connect/route");

    const response = await GET();

    expect(response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=state-value");
    expect(response.headers.get("location")).not.toContain("client-secret");
  });

  it("rejects unauthorized disconnect attempts", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    mocks.requireAdminOrganizationContext.mockRejectedValue(new Error("No access"));
    const { POST } = await import("@/app/api/admin/integrations/google/disconnect/route");

    const response = await POST();

    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/settings/integrations?google=unauthorized");
    expect(mocks.disconnectGoogleConnection).not.toHaveBeenCalled();
  });
});
