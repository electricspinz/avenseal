import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CommunicationArchiveAction } from "@/components/communication-archive-action";

describe("CommunicationArchiveAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    router.refresh.mockReset();
  });

  it("requires confirmation before archiving and refreshes only after the archive succeeds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ archived: true }), { status: 200 }));
    render(<CommunicationArchiveAction messageId="message-1" archived={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("dialog", { name: "Archive communication confirmation" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/communications/message-1/archive", expect.objectContaining({ method: "POST", body: JSON.stringify({ archived: true }) }));
  });

  it("unarchives an archived message and renders no control for reminder-only rows", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ archived: false }), { status: 200 }));
    const { rerender } = render(<CommunicationArchiveAction messageId="message-1" archived />);
    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/communications/message-1/archive", expect.objectContaining({ body: JSON.stringify({ archived: false }) }));
    rerender(<CommunicationArchiveAction messageId={null} archived={false} />);
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });
});
