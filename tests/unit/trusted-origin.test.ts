import { describe, expect, it } from "vitest";
import { hasTrustedAdminMutationOrigin } from "@/lib/server/trusted-origin";

describe("trusted admin mutation origin", () => {
  it("accepts only the configured same origin", () => {
    expect(hasTrustedAdminMutationOrigin(new Request("http://localhost/api/admin/settings", { method: "PATCH", headers: { origin: "http://localhost:3000" } }))).toBe(true);
    expect(hasTrustedAdminMutationOrigin(new Request("http://localhost/api/admin/settings", { method: "PATCH", headers: { origin: "https://evil.example" } }))).toBe(false);
    expect(hasTrustedAdminMutationOrigin(new Request("http://localhost/api/admin/settings", { method: "PATCH" }))).toBe(false);
    expect(hasTrustedAdminMutationOrigin(new Request("http://localhost/api/admin/settings", { method: "PATCH", headers: { origin: "null" } }))).toBe(false);
  });
});
