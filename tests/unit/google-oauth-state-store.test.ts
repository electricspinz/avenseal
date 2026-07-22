import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin
}));

import { consumeGoogleOAuthState, hashOAuthState } from "@/lib/server/google-oauth";

function stateUpdateChain(result: { data: unknown[]; error: null }) {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    select: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue(result)
  };
  return chain;
}

describe("Google OAuth state persistence", () => {
  it("atomically consumes unused state with organization and user predicates", async () => {
    const chain = stateUpdateChain({
      data: [{
        id: "state-id",
        organization_id: "org-1",
        user_id: "user-1",
        redirect_path: "/admin/settings/integrations",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used_at: new Date().toISOString()
      }],
      error: null
    });
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn(() => chain) });

    await expect(consumeGoogleOAuthState({ state: "state-value", organizationId: "org-1", userId: "user-1" })).resolves.toEqual({
      redirectPath: "/admin/settings/integrations"
    });

    expect(chain.update).toHaveBeenCalledWith({ used_at: expect.any(String) });
    expect(chain.eq).toHaveBeenCalledWith("state_hash", hashOAuthState("state-value"));
    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.is).toHaveBeenCalledWith("used_at", null);
    expect(chain.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("rejects reused, expired, or mismatched state when the atomic update returns no row", async () => {
    const chain = stateUpdateChain({ data: [], error: null });
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn(() => chain) });

    await expect(consumeGoogleOAuthState({ state: "state-value", organizationId: "org-1", userId: "user-1" })).rejects.toThrow(/Invalid, expired, or already used/);
  });
});
