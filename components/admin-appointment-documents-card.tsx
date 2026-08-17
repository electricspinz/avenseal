"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AdminCard } from "@/components/admin-shell";
import { Button } from "@/components/button";
import type { AppointmentDocumentFile } from "@/lib/server/document-repository";

type ReviewAction = "approve" | "reject";
type ReviewDocument = Pick<AppointmentDocumentFile, "id" | "status" | "reviewerName" | "reviewedAt" | "reviewNotes">;
type DocumentPreview = Readonly<{ documentId: string; originalFilename: string; contentType: string; previewUrl: string }>;
export type AdminAppointmentDocumentPresentation = Pick<AppointmentDocumentFile, "id" | "originalFilename" | "contentType" | "sizeBytes" | "status" | "reviewerName" | "reviewedAt" | "reviewNotes" | "uploadedAt" | "scanStatus" | "storageStatus">;

const previewContentTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export function AdminAppointmentDocumentsCard({ appointmentId, documents: initialDocuments }: { appointmentId: string; documents: readonly AdminAppointmentDocumentPresentation[] }) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [handoffConfirmingId, setHandoffConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function requestPreview(document: AdminAppointmentDocumentPresentation) {
    if (previewPendingId) return;
    setPreviewPendingId(document.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(document.id)}/preview`);
      const result = await response.json().catch(() => null) as { previewUrl?: string; contentType?: string } | null;
      if (!response.ok || !result?.previewUrl || !result.contentType || !previewContentTypes.has(result.contentType)) throw new Error("Preview unavailable.");
      setPreview({ documentId: document.id, originalFilename: document.originalFilename, contentType: result.contentType, previewUrl: result.previewUrl });
    } catch {
      setMessage("The document could not be loaded.");
    } finally {
      setPreviewPendingId(null);
    }
  }

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
      router.refresh();
    } catch {
      setMessage("Document review could not be completed. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return <AdminCard>
    <h2 className="text-xl font-semibold text-navy">Documents</h2>
    {documents.length === 0 ? <p className="mt-4 text-sm text-slateDeep">No uploaded documents yet.</p> : <ul className="mt-4 space-y-3">{documents.map((document) => {
      const isCleanAndActive = document.scanStatus === "clean" && document.storageStatus === "active";
      const supportsPreview = previewContentTypes.has(document.contentType);
      const securityProcessing = document.scanStatus === "pending" || (document.scanStatus === "clean" && document.storageStatus === "quarantined");
      return <li key={document.id} className="rounded-md border border-silver p-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-navy">{document.originalFilename}</p><p className="mt-1 text-xs text-slateDeep">{document.contentType} · {formatBytes(document.sizeBytes)} · Uploaded {new Date(document.uploadedAt).toLocaleString()}</p><p className="mt-2"><StatusBadge status={document.status} /></p>{document.reviewedAt && <p className="mt-2 text-xs text-slateDeep">Reviewed by {document.reviewerName ?? "an administrator"} · {new Date(document.reviewedAt).toLocaleString()}</p>}{document.status === "rejected" && document.reviewNotes && <p className="mt-2 text-sm text-slateDeep">Rejection reason: {document.reviewNotes}</p>}</div>
          <div className="flex flex-wrap gap-2">
            {isCleanAndActive && supportsPreview ? <Button type="button" disabled={Boolean(previewPendingId)} aria-expanded={preview?.documentId === document.id} aria-controls={`preview-${document.id}`} onClick={() => requestPreview(document)}>{previewPendingId === document.id ? "Loading preview..." : "Preview document"}</Button> : <span className="inline-flex min-h-11 items-center text-sm text-slateDeep">{securityProcessing ? "Security processing in progress. Preview and provider handoff will be available when complete." : isCleanAndActive ? "Preview unavailable for this file type." : "Preview unavailable."}</span>}
            {isCleanAndActive && <Button type="button" variant="secondary" onClick={() => { setHandoffConfirmingId(document.id); setMessage(""); }}>Download for provider handoff</Button>}
            {document.status !== "approved" && <Button type="button" variant="secondary" disabled={Boolean(pendingId)} onClick={() => setConfirmingId(document.id)}>Approve</Button>}
            {document.status !== "rejected" && <Button type="button" variant="secondary" disabled={Boolean(pendingId)} onClick={() => { setRejectingId(document.id); setMessage(""); }}>Reject</Button>}
          </div>
        </div>
        {preview?.documentId === document.id && <section id={`preview-${document.id}`} className="mt-4 rounded-md border border-silver bg-mist p-4" role="dialog" aria-labelledby={`preview-title-${document.id}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p id={`preview-title-${document.id}`} className="text-sm font-semibold text-navy">Preview: {preview.originalFilename}</p><p className="mt-1 text-xs text-slateDeep">{preview.contentType}</p></div><Button type="button" variant="secondary" onClick={() => setPreview(null)}>Close Preview</Button></div>{preview.contentType === "application/pdf" ? <iframe className="mt-4 h-[560px] w-full rounded border border-silver bg-white" title={`Preview of ${preview.originalFilename}`} src={`${preview.previewUrl}#toolbar=0&navpanes=0`} referrerPolicy="no-referrer" /> : <Image unoptimized className="mt-4 h-auto max-h-[560px] w-auto max-w-full rounded border border-silver bg-white object-contain" alt={`Preview of ${preview.originalFilename}`} src={preview.previewUrl} width={1200} height={900} referrerPolicy="no-referrer" />}</section>}
        {handoffConfirmingId === document.id && <section className="mt-4 rounded-md border border-silver bg-mist p-4" role="dialog" aria-labelledby={`provider-handoff-${document.id}`}><p id={`provider-handoff-${document.id}`} className="text-sm font-semibold text-navy">Download document for provider handoff?</p><p className="mt-1 text-sm text-slateDeep">This downloads the customer document for upload to the notarization provider. Continue?</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => setHandoffConfirmingId(null)}>Cancel</Button><form action={`/api/admin/appointments/${encodeURIComponent(appointmentId)}/documents/${encodeURIComponent(document.id)}/provider-handoff`} method="get"><Button type="submit">Download for provider handoff</Button></form></div></section>}
        {confirmingId === document.id && <section className="mt-4 rounded-md border border-silver bg-mist p-4" role="dialog" aria-labelledby={`approve-${document.id}`}><p id={`approve-${document.id}`} className="text-sm font-semibold text-navy">Approve this document?</p><p className="mt-1 text-sm text-slateDeep">This marks the uploaded document as approved.</p><div className="mt-3 flex gap-3"><Button type="button" variant="secondary" disabled={Boolean(pendingId)} onClick={() => setConfirmingId(null)}>Cancel</Button><Button type="button" disabled={Boolean(pendingId)} onClick={() => submit(document.id, "approve")}>{pendingId === document.id ? "Approving..." : "Approve document"}</Button></div></section>}
        {rejectingId === document.id && <section className="mt-4 rounded-md border border-silver bg-mist p-4" role="dialog" aria-labelledby={`reject-${document.id}`}><label id={`reject-${document.id}`} className="block text-sm font-semibold text-navy">Reason for customer<textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} className="mt-2 min-h-24 w-full rounded-md border border-silver bg-white px-3 py-2 text-sm" disabled={Boolean(pendingId)} /></label><div className="mt-3 flex gap-3"><Button type="button" variant="secondary" disabled={Boolean(pendingId)} onClick={() => { setRejectingId(null); setReviewNotes(""); }}>Cancel</Button><Button type="button" disabled={!reviewNotes.trim() || Boolean(pendingId)} onClick={() => submit(document.id, "reject", reviewNotes)}>{pendingId === document.id ? "Rejecting..." : "Reject document"}</Button></div></section>}
      </li>;
    })}</ul>}
    {message && <p className="mt-4 text-sm text-slateDeep" role="status">{message}</p>}
  </AdminCard>;
}

function StatusBadge({ status }: { status: AppointmentDocumentFile["status"] }) {
  const classes = status === "approved" ? "bg-emeraldAction/10 text-emerald-900" : status === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${classes}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

function formatBytes(sizeBytes: number) {
  return sizeBytes < 1024 * 1024 ? `${Math.ceil(sizeBytes / 1024)} KB` : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
