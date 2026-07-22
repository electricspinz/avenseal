import { afterEach, describe, expect, it } from "vitest";
import { getDefaultOrganizationSlug, roleCanManageOrganization } from "@/lib/server/organization";

const originalSlug = process.env.DEFAULT_ORGANIZATION_SLUG;

afterEach(() => {
  if (originalSlug === undefined) {
    delete process.env.DEFAULT_ORGANIZATION_SLUG;
  } else {
    process.env.DEFAULT_ORGANIZATION_SLUG = originalSlug;
  }
});

describe("organization helpers", () => {
  it("defaults public organization resolution to the Avenseal slug", () => {
    delete process.env.DEFAULT_ORGANIZATION_SLUG;
    expect(getDefaultOrganizationSlug()).toBe("avenseal");
  });

  it("allows an environment-configured default organization slug", () => {
    process.env.DEFAULT_ORGANIZATION_SLUG = "tenant-one";
    expect(getDefaultOrganizationSlug()).toBe("tenant-one");
  });

  it("limits organization management permissions to owners and admins", () => {
    expect(roleCanManageOrganization("owner")).toBe(true);
    expect(roleCanManageOrganization("admin")).toBe(true);
    expect(roleCanManageOrganization("notary")).toBe(false);
    expect(roleCanManageOrganization("staff")).toBe(false);
  });
});
