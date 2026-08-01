import { describe, expect, it } from "vitest";
import { InMemoryDistributedRateLimitStore, rateLimitIdentity } from "@/lib/server/distributed-rate-limit";

describe("distributed rate-limit test store", () => {
  it("shares fixed-window counters without persisting raw identity", async () => {
    let now = 0; const first = new InMemoryDistributedRateLimitStore(() => now); const second = first; const identity = rateLimitIdentity("admin_login_email", "Customer@Example.com");
    for (let count = 0; count < 5; count++) expect((await first.consume("admin_login_email", identity)).allowed).toBe(true);
    expect(await second.consume("admin_login_email", identity)).toEqual({ allowed: false, retryAfterSeconds: 900 });
    now = 900_000; expect((await first.consume("admin_login_email", identity)).allowed).toBe(true);
    expect(identity).not.toContain("Customer");
  });
});
