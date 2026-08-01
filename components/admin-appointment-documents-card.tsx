"use client";

import React, { useState } from "react";
import { AdminCard } from "@/components/admin-shell";
import { Button } from "@/components/button";
import type { AppointmentDocumentFile } from "@/lib/server/document-repository";

type ReviewAction = "approve" | "reject";
type ReviewDocument = Pick<AppointmentDocumentFile, "id" | "status" | "reviewerName" | "reviewedAt" | "reviewNotes">;

export function AdminAppointmentDocumentsCard({ appointmentId, documents: initialDocuments }: { appointmentId: string; documents: readonly AppointmentDocumentFile[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submit(documentId: string, action: ReviewAction, notes?: string) {
    if (pendingId) return;
    if (action === "reject" && !notes?.trim()) {
      setMessage("Enter a rejection reason before continuing.");
      return;
    }
    setPendingId(documentId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(documentId)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reviewNotes: notes?.trim() || undefined }) });
      const result = await response.json().catch(() => null) as { document?: ReviewDocument } | null;
      if (!response.ok || !result?.document) throw new Error("Document review is unavailable.");
      setDocuments((current) => current.map((document) => document.id === documentId ? { ...document, ...result.document } : document));
      setConfirmingId(null);
      setRejectingId(null);
      setReviewNotes("");
      setMessage(action === "approve" ? "Document approved." : "Document rejected.");
    } catch {
      setMessage("Document review could not be completed. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return <AdminCard><h2 className="text-xl font-semibold text-navy">Documents</h2>{documents.length === 0 ? <p className="mt-4 text-sm text-slateDeep">No uploaded documents yet.</p> : <ul className="mt-4 space-y-3">{documents.map((document) => <li key={document.id} className="rounded-md border border-silver p-3"><div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-navy">{document.originalFilename}</p><p className="mt-1 text-xs text-slateDeep">{document.contentType} · {formatBytes(document.sizeBytes)} · Uploaded {new Date(document.uploadedAt).toLocaleString()}</p><p className="mt-2"><StatusBadge status={document.status} /></p>{document.reviewedAt && <p className="mt-2 text-xs text-slateDeep">Reviewed by {document.reviewerName ?? "an administrator"} · {new Date(document.reviewedAt).toLocaleString()}</p>}{document.status === "rejected" && document.reviewNotes && <p className="mt-2 text-sm text-slateDeep">Rejection reason: {document.reviewNotes}</p>}</div><div className="flex flex-wrap gap-2">{document.scanStatus === "clean" && document.storageStatus === "active" ? <a href={`/api/admin/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(document.id)}/download`} className="focus-ring inline-flex min-h-11 items-center rounded-md bg-navy px-4 text-sm font-semibold text-white hover:bg-[#0b2035]">Download</a> : <span className="inline-flex min-h-11 items-center text-sm text-slateDeep">Download unavailable</span>}{document.status !== "approved" && <Button type="button" variant="secondary" disabled={Boolean(pendingId)} onClick={() => setConfirmingId(document.id)}>Approve</Button>}{document.status !== "rejected" && <Button type="button" variant="secondary" disabled={Boolean(pendingId)} onClick={() => { setRejectingId(document.id); setMessage(""); }}>Reject</Button>}</div></div>{confirmingId === document.id && <section className="mt-4 rounded-md border border-silver bg-mist p-4" role="dialog" aria-labelledby={`approve-${document.id}`}><p id={`approve-${document.id}`} className="text-sm font-semibold text-navy">Approve this document?</p><p className="mt-1 text-sm text-slateDeep">This marks the uploaded document as approved.</p><div className="mt-3 flex gap-3"><Button type="button" variant="secondary" disabled={Boolean(pendingId)} onClick={() => setConfirmingId(null)}>Cancel</Button><Button type="button" disabled={Boolean(pendingId)} onClick={() => submit(document.id, "approve")}>{pendingId === document.id ? "Approving..." : "Approve document"}</Button></div></section>}{rejectingId === document.id && <section className="mt-4 rounded-md border border-silver bg-mist p-4" role="dialog" aria-labelledby={`reject-${document.id}`}><label id={`reject-${document.id}`} className="block text-sm font-semibold text-navy">Reason for customer<textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} className="mt-2 min-h-24 w-full rounded-md border border-silver bg-white px-3 py-2 text-sm" disabled={Boolean(pendingId)} /></label><div className="mt-3 flex gap-3"><Button type="button" variant="secondary" disabled={Boolean(pendingId)} onClick={() => { setRejectingId(null); setReviewNotes(""); }}>Cancel</Button><Button type="button" disabled={!reviewNotes.trim() || Boolean(pendingId)} onClick={() => submit(document.id, "reject", reviewNotes)}>{pendingId === document.id ? "Rejecting..." : "Reject document"}</Button></div></section>}</li>)}</ul>}{message && <p className="mt-4 text-sm text-slateDeep" role="status">{message}</p>}</AdminCard>;
}

function StatusBadge({ status }: { status: AppointmentDocumentFile["status"] }) {
  const classes = status === "approved" ? "bg-emeraldAction/10 text-emerald-900" : status === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${classes}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

function formatBytes(sizeBytes: number) {
  return sizeBytes < 1024 * 1024 ? `${Math.ceil(sizeBytes / 1024)} KB` : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
