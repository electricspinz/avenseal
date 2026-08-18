import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCommunicationArchiveHandler } from "@/app/api/admin/communications/[id]/archive/handler";

const context = vi.fn();
const setArchiveState = vi.fn();
const params = () => ({ params: Promise.resolve({ id: "message-1" }) });
const request = (archived: unknown) => new Request("http://localhost/api/admin/communications/message-1/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived }) });

describe("admin communication archive route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    context.mockResolvedValue({ organizationId: "org-1", userId: "admin-1", role: "owner", email: "owner@example.com" });
    setArchiveState.mockResolvedValue({ id: "message-1", archivedAt: "2026-08-17T12:00:00.000Z" });
  });

  it("archives a tenant-scoped message as the authenticated owner/admin and returns no-store JSON", async () => {
    const handler = createCommunicationArchiveHandler({ context, setArchiveState });
    const response = await handler(request(true), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ archived: true });
    expect(setArchiveState).toHaveBeenCalledWith({ organizationId: "org-1", communicationId: "message-1", actorUserId: "admin-1", archived: true });
  });

  it("unarchives without touching reminder, delivery, appointment, payment, or consent boundaries", async () => {
    setArchiveState.mockResolvedValue({ id: "message-1", archivedAt: null });
    const handler = createCommunicationArchiveHandler({ context, setArchiveState });
    const response = await handler(request(false), params());
    await expect(response.json()).resolves.toEqual({ archived: false });
    expect(setArchiveState).toHaveBeenCalledWith(expect.objectContaining({ archived: false }));
  });

  it("denies unauthorized callers and does not mutate a message", async () => {
    context.mockRejectedValue(new Error("not authorized"));
    const handler = createCommunicationArchiveHandler({ context, setArchiveState });
    const response = await handler(request(true), params());
    expect(response.status).toBe(403);
    expect(setArchiveState).not.toHaveBeenCalled();
  });

  it("rejects invalid input and cross-tenant or missing messages without exposing state", async () => {
    const handler = createCommunicationArchiveHandler({ context, setArchiveState });
    expect((await handler(request("true"), params())).status).toBe(400);
    expect(setArchiveState).not.toHaveBeenCalled();
    setArchiveState.mockResolvedValue(null);
    const response = await handler(request(true), params());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Communication not found." });
  });
});
