import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ hasSupabaseServiceConfig: mocks.configured, getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));

import { repository } from "@/lib/server/repository";

describe("repository.setCommunicationArchived", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
  });

  it("uses the atomic tenant-scoped archive RPC with the actor, without writing delivery or reminder tables", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "message-1", archived_at: "2026-08-17T12:00:00.000Z" }, error: null });
    mocks.rpc.mockReturnValue({ maybeSingle });

    await expect(repository.setCommunicationArchived({ organizationId: "org-1", communicationId: "message-1", actorUserId: "admin-1", archived: true })).resolves.toEqual({ id: "message-1", archivedAt: "2026-08-17T12:00:00.000Z" });
    expect(mocks.rpc).toHaveBeenCalledWith("set_communication_message_archived", {
      p_organization_id: "org-1",
      p_communication_id: "message-1",
      p_actor_user_id: "admin-1",
      p_archived: true
    });
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it("returns a safe absence for missing or wrong-tenant messages", async () => {
    mocks.rpc.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
    await expect(repository.setCommunicationArchived({ organizationId: "org-1", communicationId: "other", actorUserId: "admin-1", archived: false })).resolves.toBeNull();
  });
});
