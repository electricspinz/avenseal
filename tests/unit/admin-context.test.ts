import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookie: vi.fn(), readSession: vi.fn(), configured: vi.fn(), admin: vi.fn(), organization: vi.fn(), env: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookie }));
vi.mock("@/lib/server/admin-auth", () => ({ getAdminCookieName: () => "avenseal_admin_session", readAdminSession: mocks.readSession }));
vi.mock("@/lib/supabase/server", () => ({ hasSupabaseServiceConfig: mocks.configured, getSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/server/organization", () => ({ fallbackAvensealOrganizationId: "dev-org", resolvePublicOrganization: mocks.organization }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.env }));

import { requireAdminOrganizationContext } from "@/lib/server/admin-context";

describe("requireAdminOrganizationContext", () => {
  it("uses the signed fallback admin session only for the development organization", async () => {
    mocks.cookie.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: "signed" }) });
    mocks.readSession.mockReturnValue({ email: "admin@avenseal.local" });
    mocks.configured.mockReturnValue(false);
    mocks.env.mockReturnValue({ ADMIN_DEMO_EMAIL: "admin@avenseal.local" });
    await expect(requireAdminOrganizationContext()).resolves.toEqual({ userId: "development-admin", email: "admin@avenseal.local", organizationId: "dev-org", role: "owner" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects unsigned and non-demo local sessions", async () => {
    mocks.cookie.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: "bad" }) });
    mocks.readSession.mockReturnValue(null);
    mocks.configured.mockReturnValue(false);
    await expect(requireAdminOrganizationContext()).rejects.toThrow("Admin authentication is required.");

    mocks.readSession.mockReturnValue({ email: "other@example.com" });
    mocks.env.mockReturnValue({ ADMIN_DEMO_EMAIL: "admin@avenseal.local" });
    await expect(requireAdminOrganizationContext()).rejects.toThrow("Admin organization access is required.");
  });

  it("keeps Supabase owner/admin membership enforcement in place", async () => {
    mocks.cookie.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: "signed" }) });
    mocks.readSession.mockReturnValue({ email: "owner@example.com", userId: "user-1" });
    mocks.configured.mockReturnValue(true);
    mocks.organization.mockResolvedValue({ id: "org-1" });
    const membership = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), limit: vi.fn() };
    membership.select.mockReturnValue(membership); membership.eq.mockReturnValue(membership); membership.in.mockReturnValue(membership); membership.limit.mockResolvedValue({ data: [{ organization_id: "org-1", role: "owner", status: "active" }], error: null });
    mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValue(membership) });
    await expect(requireAdminOrganizationContext()).resolves.toEqual({ userId: "user-1", email: "owner@example.com", organizationId: "org-1", role: "owner" });
    expect(membership.in).toHaveBeenCalledWith("role", ["owner", "admin"]);
    expect(membership.eq).toHaveBeenCalledWith("status", "active");
  });
});
