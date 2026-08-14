"use client";

import React, { useState } from "react";
import { Button } from "@/components/button";

type CustomerDocument = Readonly<{ id: string; originalFilename: string; uploadedAt: string; status: "uploaded" | "approved" | "needs_replacement"; replacementReason: string | null }>;

export function ClientDocumentUploadCard({ token, initialDocuments = [] }: { token: string; initialDocuments?: readonly CustomerDocument[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [documents, setDocuments] = useState<readonly CustomerDocument[]>(initialDocuments);
  const [replacementDocumentId, setReplacementDocumentId] = useState<string | null>(null);
  const replacement = documents.find((document) => document.id === replacementDocumentId) ?? null;

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (replacementDocumentId) formData.append("replacementDocumentId", replacementDocumentId);
      const response = await fetch(`/api/appointments/access/${encodeURIComponent(token)}/documents`, { method: "POST", body: formData });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.status === "uploaded" && isCustomerDocument(result.document)) {
        setDocuments((current) => replacementDocumentId ? current.map((document) => document.id === replacementDocumentId ? result.document : document) : [...current, result.document]);
        setFile(null);
        setReplacementDocumentId(null);
        setMessage(replacementDocumentId ? "Replacement document received." : "Document received.");
        return;
      }
      setMessage("We couldn't upload your document. Please try again.");
    } catch {
      setMessage("We couldn't upload your document. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return <section className="rounded-lg border border-silver bg-white p-4 shadow-sm sm:p-5"><h2 className="text-xl font-semibold text-navy">Documents</h2>{documents.length > 0 && <ul className="mt-4 space-y-3" aria-label="Documents">{documents.map((document) => <li key={document.id} className="rounded-md bg-mist p-3"><p className="text-sm font-semibold text-navy">{document.originalFilename}</p><p className="mt-1 text-sm text-slateDeep">{document.status === "approved" ? "Approved ✓" : document.status === "needs_replacement" ? "A replacement document is needed" : "Received — we’re securely processing and reviewing your document."}</p>{document.status === "needs_replacement" && <><p className="mt-2 text-sm text-slateDeep">Reason: {document.replacementReason ?? "Please upload a replacement document."}</p><Button type="button" variant="secondary" className="mt-3" disabled={uploading} onClick={() => { setReplacementDocumentId(document.id); setMessage(""); }}>Upload Replacement</Button></>}</li>)}</ul>}<p className="mt-4 text-sm leading-6 text-slateDeep">{replacement ? `Choose a replacement for ${replacement.originalFilename}.` : "Upload one PDF, JPEG, or PNG document for your appointment. Files must be 10 MB or smaller."}</p><label className="mt-4 block text-sm font-semibold text-navy">Choose document<input aria-label="Choose document" className="mt-2 block w-full text-sm text-slateDeep file:mr-4 file:rounded-md file:border-0 file:bg-mist file:px-3 file:py-2 file:text-sm file:font-semibold file:text-navy" type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading} onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} /></label><div className="mt-4"><Button type="button" onClick={upload} disabled={!file || uploading}>{uploading ? "Uploading..." : replacement ? "Upload replacement" : "Upload document"}</Button></div>{message && <p className="mt-3 text-sm text-slateDeep" role="status">{message}{message.startsWith("Document received") ? " You don’t need to stay on this page. We’ll let you know if anything else is needed." : ""}</p>}</section>;
}

function isCustomerDocument(value: unknown): value is CustomerDocument {
  return Boolean(value && typeof value === "object" && typeof (value as CustomerDocument).id === "string" && typeof (value as CustomerDocument).originalFilename === "string" && typeof (value as CustomerDocument).uploadedAt === "string" && ["uploaded", "approved", "needs_replacement"].includes((value as CustomerDocument).status) && ((value as CustomerDocument).replacementReason === null || typeof (value as CustomerDocument).replacementReason === "string"));
}
