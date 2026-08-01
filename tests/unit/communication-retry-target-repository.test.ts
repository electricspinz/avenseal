import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ hasSupabaseServiceConfig: mocks.configured, getSupabaseAdmin: () => ({ from: mocks.from }) }));

import { repository } from "@/lib/server/repository";

function readChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    update: vi.fn(() => { throw new Error("read boundary must not update"); }),
    insert: vi.fn(() => { throw new Error("read boundary must not insert"); }),
    delete: vi.fn(() => { throw new Error("read boundary must not delete"); }),
    upsert: vi.fn(() => { throw new Error("read boundary must not upsert"); })
  };
  return chain;
}

describe("repository.getCommunicationRetryTarget", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.configured.mockReturnValue(true); });

  it("uses a tenant-scoped id,status-only read and returns the minimal eligible projection", async () => {
    const chain = readChain({ data: { id: "message-1", status: "failed", recipient: "must-not-project" }, error: null });
    mocks.from.mockReturnValue(chain);

    await expect(repository.getCommunicationRetryTarget({ organizationId: "org-1", communicationId: "message-1" })).resolves.toEqual({ id: "message-1", retryEligible: true });
    expect(mocks.from).toHaveBeenCalledWith("communication_messages");
    expect(chain.select).toHaveBeenCalledWith("id,status");
    expect(chain.eq).toHaveBeenNthCalledWith(1, "id", "message-1");
    expect(chain.eq).toHaveBeenNthCalledWith(2, "organization_id", "org-1");
    expect(chain.eq).toHaveBeenNthCalledWith(3, "status", "failed");
    expect(chain.maybeSingle).toHaveBeenCalledOnce();
  });

  it("returns the same safe absence for unknown and wrong-tenant rows", async () => {
    for (const result of [{ data: null, error: null }, { data: null, error: null }]) {
      const chain = readChain(result); mocks.from.mockReturnValue(chain);
      await expect(repository.getCommunicationRetryTarget({ organizationId: "org-1", communicationId: "other" })).resolves.toBeNull();
    }
  });

  it("maps all rows reachable through the retry-eligible query to true and propagates server errors", async () => {
    const eligible = readChain({ data: { id: "message-2", status: "failed" }, error: null }); mocks.from.mockReturnValue(eligible);
    await expect(repository.getCommunicationRetryTarget({ organizationId: "org-1", communicationId: "message-2" })).resolves.toEqual({ id: "message-2", retryEligible: true });
    const errored = readChain({ data: null, error: new Error("database unavailable") }); mocks.from.mockReturnValue(errored);
    await expect(repository.getCommunicationRetryTarget({ organizationId: "org-1", communicationId: "message-2" })).rejects.toThrow("database unavailable");
  });
});
