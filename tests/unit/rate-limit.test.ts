import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/server/rate-limit";

describe("checkRateLimit", () => {
  it("allows initial requests", () => {
    const result = checkRateLimit(`test-${Date.now()}`);
    expect(result.allowed).toBe(true);
  });
});

