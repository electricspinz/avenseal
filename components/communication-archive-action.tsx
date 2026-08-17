"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CommunicationArchiveAction({ messageId, archived }: { messageId: string | null; archived: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  if (!messageId) return null;
  const communicationId = messageId;

  async function update() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/communications/${encodeURIComponent(communicationId)}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived })
      });
      if (!response.ok) throw new Error("archive unavailable");
      setConfirming(false);
      router.refresh();
    } catch {
      setMessage("Communication archiving is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (archived) {
    return <div className="mt-3"><button type="button" className="focus-ring rounded-md border border-navy/55 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-mist" disabled={pending} onClick={update}>{pending ? "Restoring…" : "Unarchive"}</button>{message && <p role="status" className="mt-2 text-xs text-red-800">{message}</p>}</div>;
  }

  if (confirming) {
    return <section className="mt-3 rounded-md border border-silver bg-mist p-3" role="dialog" aria-label="Archive communication confirmation"><p className="text-xs text-slateDeep">Archive this communication from the default Communications Center view?</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="focus-ring rounded-md border border-navy/55 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-white" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="focus-ring rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90" disabled={pending} onClick={update}>{pending ? "Archiving…" : "Archive"}</button></div>{message && <p role="status" className="mt-2 text-xs text-red-800">{message}</p>}</section>;
  }

  return <div className="mt-3"><button type="button" className="focus-ring rounded-md border border-navy/55 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-mist" onClick={() => setConfirming(true)}>Archive</button>{message && <p role="status" className="mt-2 text-xs text-red-800">{message}</p>}</div>;
}
