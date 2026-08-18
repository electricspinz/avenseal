"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin-shell";
import { Button } from "@/components/button";

type Principal = { fullName: string; location?: "florida" | "outside_florida"; documentDescription?: string };
type Module = { id: string; version: string; classification: "required_by_florida_law" | "conditional_florida_requirement" | "avenseal_safeguard"; content: string };
type PreviewParameters = { principals: Principal[]; witnesses?: { kind: "physical" | "remote" }[]; notaryCounty?: string; notarialAct?: string; special117285?: boolean };
type PreviewPayload = { attempt: { workflowVersion: string; productionEnabled: false; parameters: PreviewParameters }; modules: Module[] };
type HistoryEntry = { id: string; workflow_version: string; state: string; outcome: string | null; stop_reason: string | null; parameters: { principals?: { fullName: string }[]; witnesses?: { fullName: string }[] }; module_versions: { id: string; version: string }[]; provider_reference: string | null; created_at: string; started_at: string | null; completed_or_stopped_at: string | null; events: { id: string; event_type: string; actor_id: string | null; created_at: string; payload: Record<string, unknown> }[] };

export function AdminFloridaRonCandidatePreview({ appointmentId, available }: { appointmentId: string; available: boolean }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [principalIndex, setPrincipalIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [terminal, setTerminal] = useState<"stopped" | "preview_completed" | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/session-assistant/history`, { cache: "no-store" });
    if (!response.ok) return;
    const next = await response.json() as { history: HistoryEntry[] };
    setHistory(next.history);
  }, [appointmentId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function openPreview() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/session-assistant/preview`, { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const next = await response.json() as PreviewPayload;
      setPayload(next);
      setIndex(0);
      setPrincipalIndex(0);
      setTerminal(null);
    } catch {
      setError("Candidate preview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  if (!available) return <section id="candidate-preview"><AdminCard><History history={history} /></AdminCard></section>;
  const current = payload?.modules[index] ?? null;
  const principals = payload?.attempt.parameters.principals ?? [];
  return <section id="candidate-preview" aria-labelledby="candidate-preview-heading"><AdminCard>
    <p className="text-xs font-semibold uppercase tracking-wide text-emeraldAction">Review Route</p>
    <h2 id="candidate-preview-heading" className="mt-1 text-xl font-semibold text-navy">Guided Candidate Preview</h2>
    <p className="mt-2 text-sm font-semibold text-slateDeep">Candidate — Not approved for production notarizations</p>
    <p className="mt-2 text-sm leading-6 text-slateDeep">Preview can record Candidate-only STOP and preview-completion states. It does not create production ceremony evidence, provider results, or production completion.</p>
    {!payload ? <div className="mt-4"><Button type="button" onClick={openPreview} disabled={loading}>{loading ? "Loading preview…" : "Enter Candidate Preview"}</Button>{error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-800">{error}</p> : null}</div> : <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-silver bg-mist p-3 text-sm"><span>Workflow version: <code>{payload.attempt.workflowVersion}</code></span><span>Module {index + 1} of {payload.modules.length}</span></div>
      {principals.length > 1 ? <div aria-label="Principal preview progression" className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-navy">Principal preview:</span>{principals.map((principal, candidate) => <button key={`${principal.fullName}-${candidate}`} type="button" onClick={() => setPrincipalIndex(candidate)} className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold ${candidate === principalIndex ? "bg-navy text-white" : "border border-silver text-navy"}`}>{candidate + 1}. {principal.fullName}</button>)}</div> : null}
      {principals[principalIndex] ? <p className="text-sm text-slateDeep">Preview context: {principals[principalIndex].fullName}</p> : null}
      {current ? <ModulePreview module={current} parameters={payload.attempt.parameters} /> : <p className="text-sm text-slateDeep">No routed modules are available for preview.</p>}
      {current?.id === "FL-COMPLETE" && !terminal ? <FinalComplianceReview content={current.content} parameters={payload.attempt.parameters} confirmed={confirmed} onChange={setConfirmed} onComplete={async () => { const result = await transition(appointmentId, { action: "preview_complete", moduleId: "FL-COMPLETE", confirmations: confirmed }); if (result) { setTerminal("preview_completed"); void loadHistory(); } }} /> : null}
      {current && !terminal ? <details className="rounded-md border border-red-200 bg-red-50"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-red-900 focus-ring">Candidate Preview STOP</summary><div className="px-4 pb-4"><StopActions appointmentId={appointmentId} moduleId={current.id} principalIndex={principals.length ? principalIndex : null} onStopped={async () => { setTerminal("stopped"); await loadHistory(); }} /></div></details> : null}
      <div className="flex gap-3"><Button type="button" variant="secondary" disabled={index === 0 || Boolean(terminal)} onClick={() => setIndex((currentIndex) => currentIndex - 1)}>Previous module</Button><Button type="button" variant="secondary" disabled={index >= payload.modules.length - 1 || Boolean(terminal)} onClick={() => setIndex((currentIndex) => currentIndex + 1)}>Next module</Button></div>
      {terminal ? <p role="status" className="rounded-md border border-silver bg-mist p-3 text-sm font-semibold text-navy">Candidate Preview {terminal === "preview_completed" ? "Completed" : "Stopped"}. This is not a production notarization outcome.</p> : null}
      <p className="rounded-md border border-silver bg-mist p-3 text-sm text-slateDeep">Production execution remains unavailable for Candidate attempts.</p>
    </div>}
    <History history={history} />
  </AdminCard></section>;
}

const stopReasons = ["identity", "technology", "willingness", "capacity", "incomplete_document", "declined_consent", "remote_witness", "outside_florida_confirmation", "notarial_act_not_established", "notary_not_in_florida"] as const;
function StopActions({ appointmentId, moduleId, principalIndex, onStopped }: { appointmentId: string; moduleId: string; principalIndex: number | null; onStopped: () => Promise<void> }) {
  const [reason, setReason] = useState<"" | (typeof stopReasons)[number]>("");
  const [pending, setPending] = useState(false);
  return <aside aria-label="Candidate Preview STOP action"><p className="text-sm text-red-900">Use only when a safe STOP condition applies. This terminal Candidate state is not a production ceremony outcome.</p><div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold text-navy">Safe STOP reason<select aria-label="Safe STOP reason" value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} className="mt-1 block rounded-md border border-slate-500 bg-white px-2 py-2 focus-ring"><option value="">Select STOP reason…</option><option value="identity">Identity failure</option><option value="technology">Technical/audio-video failure</option><option value="willingness">Unwillingness/coercion concern</option><option value="capacity">Capacity concern</option><option value="incomplete_document">Incomplete/blank document</option><option value="declined_consent">Declined consent</option><option value="remote_witness">Remote-witness eligibility failure</option><option value="outside_florida_confirmation">Outside-Florida confirmation failure</option><option value="notarial_act_not_established">Notarial act not established</option><option value="notary_not_in_florida">Notary not in Florida</option></select></label><Button type="button" disabled={pending || !reason} onClick={async () => { if (!reason) return; setPending(true); const result = await transition(appointmentId, { action: "stop", stopReason: reason, moduleId, principalIndex, witnessIndex: null }); if (result) await onStopped(); setPending(false); }}>Stop Candidate Preview</Button></div></aside>;
}

function FinalComplianceReview({ content, parameters, confirmed, onChange, onComplete }: { content: string; parameters: PreviewParameters; confirmed: string[]; onChange: (value: string[]) => void; onComplete: () => Promise<void> }) {
  const items = completionItems(content).map((item) => ({ item, applicable: completionItemApplies(item, parameters) }));
  const complete = items.some(({ applicable }) => applicable) && items.filter(({ applicable }) => applicable).every(({ item }) => confirmed.includes(item));
  return <section aria-labelledby="final-preview-review" className="rounded-md border border-navy bg-slate-50 p-4"><h3 id="final-preview-review" className="font-semibold text-navy">Final Compliance Review — Candidate simulation</h3><p className="mt-2 text-sm text-slateDeep">Confirm applicable items from the locked completion module for this simulation only. These confirmations are not production evidence.</p><div className="mt-3 space-y-2">{items.map(({ item, applicable }) => applicable ? <label key={item} className="flex gap-2 text-sm text-slateDeep"><input type="checkbox" checked={confirmed.includes(item)} onChange={(event) => onChange(event.target.checked ? [...confirmed, item] : confirmed.filter((value) => value !== item))} />{item}</label> : <p key={item} className="text-sm text-slateDeep"><span className="mr-2 rounded bg-mist px-2 py-1 text-xs font-semibold">N/A</span>{item}</p>)}</div><Button type="button" className="mt-4" disabled={!complete} onClick={() => void onComplete()}>Complete Candidate Preview</Button></section>;
}

function completionItems(content: string) { const section = content.match(/## Final Compliance Review\n([\s\S]*?)(?=\n## |$)/); return (section?.[1].match(/^- (.+)$/gm) ?? []).map((line) => line.slice(2)); }
function completionItemApplies(item: string, parameters: PreviewParameters) { const normalized = item.toLowerCase(); if (normalized.includes("outside-florida")) return parameters.principals.some((principal) => principal.location === "outside_florida"); if (normalized.includes("witness")) return (parameters.witnesses?.length ?? 0) > 0; if (normalized.includes("117.285")) return parameters.special117285 === true; return true; }
async function transition(appointmentId: string, body: Record<string, unknown>) { const response = await fetch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/session-assistant/preview/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return response.ok ? response.json() : null; }
function History({ history }: { history: readonly HistoryEntry[] }) { return <section aria-labelledby="session-history-heading" className="mt-6 border-t border-silver pt-5"><h3 id="session-history-heading" className="font-semibold text-navy">Session Assistant history</h3>{history.length === 0 ? <p className="mt-2 text-sm text-slateDeep">No prior Session Assistant attempts.</p> : <div className="mt-3 space-y-3">{history.map((entry) => <article key={entry.id} className="rounded-md border border-silver p-3 text-sm text-slateDeep"><p className="font-semibold text-navy">{entry.outcome ?? entry.state}{entry.stop_reason ? ` · STOP: ${entry.stop_reason}` : ""}</p><p>Principals: {entry.parameters.principals?.map((principal) => principal.fullName).join(", ") || "None"}</p><p>Created {formatDateTime(entry.created_at)}{entry.completed_or_stopped_at ? ` · Terminal ${formatDateTime(entry.completed_or_stopped_at)}` : ""}</p><details className="mt-2"><summary className="cursor-pointer font-semibold text-navy focus-ring">Audit and technical details</summary><p className="mt-2"><code>{entry.id}</code> · workflow {entry.workflow_version}</p><p>Provider reference: {entry.provider_reference ?? "None"}</p><p>Modules: {entry.module_versions.map((module) => `${module.id} v${module.version}`).join(", ")}</p>{entry.events.map((event) => <details key={event.id} className="mt-2"><summary>{event.event_type} · {formatDateTime(event.created_at)} · actor {event.actor_id ?? "system"}</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(event.payload, null, 2)}</pre></details>)}</details></article>)}</div>}</section>; }
function formatDateTime(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed); }

function ModulePreview({ module, parameters }: { module: Module; parameters: PreviewParameters }) {
  return <article aria-labelledby="preview-module-heading" className="rounded-md border border-silver bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 id="preview-module-heading" className="font-semibold text-navy"><code>{module.id}</code> · version <code>{module.version}</code></h3><span className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-navy">{classificationLabel(module.classification)}</span></div><LockedModuleContent moduleId={module.id} content={renderLockedPlaceholders(module.content, parameters)} /></article>;
}

function LockedModuleContent({ moduleId, content }: { moduleId: string; content: string }) {
  const sections = content.split(/\n(?=## |### )/);
  if (moduleId === "FL-CORE") sections.sort((left, right) => sectionOrder(left) - sectionOrder(right));
  return <div className="mt-4 space-y-4">{sections.map((section, index) => {
    const [heading, ...body] = section.split("\n");
    const kind = contentKind(heading);
    const exactContent = [heading, ...body].join("\n");
    const containsRequiredConfirmation = /\bRequired (affirmative response|response|workflow)/i.test(exactContent);
    return <section key={`${heading}-${index}`} className={kind === "read" ? "rounded-md border-l-4 border-emeraldAction bg-emerald-50 p-4" : kind === "required" ? "rounded-md border-l-4 border-navy bg-slate-50 p-3" : "rounded-md border border-silver p-3"}><p className="text-xs font-bold uppercase tracking-wide text-navy">{kind === "read" ? "Read aloud" : heading.toLowerCase().includes("safeguard") ? "Required confirmation / consent" : kind === "required" ? "Required confirmation" : "Notary instructions / checklist"}</p>{containsRequiredConfirmation ? <p className="mt-2 inline-flex rounded-full bg-navy px-2 py-1 text-xs font-semibold text-white">Required confirmations</p> : null}<MarkdownPresentation content={exactContent} hideReadHeading={kind === "read"} /></section>;
  })}</div>;
}

function MarkdownPresentation({ content, hideReadHeading = false }: { content: string; hideReadHeading?: boolean }) {
  const lines = content.split("\n");
  return <div className="mt-2 space-y-2 text-sm leading-6 text-slateDeep">{lines.map((line, index) => {
    if (!line) return null;
    if (/^---+$/.test(line)) return <hr key={index} className="border-silver" />;
    if (line.startsWith("### ")) return <h5 key={index} className="font-semibold text-navy">{inlineMarkdown(line.slice(4))}</h5>;
    if (line.startsWith("## ")) return hideReadHeading && line.toLowerCase() === "## read aloud" ? null : <h4 key={index} className="font-semibold text-navy">{inlineMarkdown(line.slice(3))}</h4>;
    if (line.startsWith("> ")) return <blockquote key={index} className="border-l-4 border-emeraldAction pl-3 font-medium text-navy">{inlineMarkdown(line.slice(2))}</blockquote>;
    if (/^- /.test(line)) return <ul key={index} className="list-disc pl-5"><li>{inlineMarkdown(line.slice(2))}</li></ul>;
    return <p key={index}>{inlineMarkdown(line)}</p>;
  })}</div>;
}

function inlineMarkdown(value: string): React.ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => part.startsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith("`") ? <code key={index} className="rounded bg-mist px-1 font-mono text-xs">{part.slice(1, -1)}</code> : <React.Fragment key={index}>{part}</React.Fragment>);
}

function contentKind(heading: string) {
  const normalized = heading.toLowerCase();
  if (normalized.includes("read aloud")) return "read";
  if (normalized.includes("safeguard")) return "required";
  if (normalized.includes("required") || normalized.includes("final compliance")) return "required";
  return "instruction";
}
function sectionOrder(section: string) { const normalized = section.toLowerCase(); return normalized.includes("safeguard") ? 0 : normalized.includes("read aloud") ? 1 : 2; }

function renderLockedPlaceholders(content: string, parameters: PreviewParameters) {
  const replacements: Record<string, string | undefined> = { "[County]": parameters.notaryCounty, "[Date]": new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date()), "[Document Title or General Description]": parameters.principals[0]?.documentDescription, "[Notarial Act]": notarialActLabel(parameters.notarialAct) };
  return Object.entries(replacements).reduce((rendered, [placeholder, value]) => value ? rendered.replaceAll(placeholder, value) : rendered, content);
}
function notarialActLabel(value?: string) { return value === "acknowledgment_individual" ? "acknowledgment in an individual capacity" : value === "acknowledgment_representative" ? "acknowledgment in a representative capacity" : value === "jurat" ? "jurat" : undefined; }

function classificationLabel(classification: Module["classification"]) {
  return classification === "required_by_florida_law" ? "Required by Florida law" : classification === "conditional_florida_requirement" ? "Conditional Florida requirement" : "Avenseal safeguard";
}
