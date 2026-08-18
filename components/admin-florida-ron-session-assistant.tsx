"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin-shell";
import { Button } from "@/components/button";
import { AdminFloridaRonCandidatePreview } from "@/components/admin-florida-ron-candidate-preview";

type Module = { id: string; version: string; classification: string };
type StopReason = "notarial_act_not_established" | "notary_not_in_florida" | "identity" | "technology" | "willingness" | "capacity" | "incomplete_document" | "outside_florida_confirmation" | "remote_witness" | null;
type Principal = { fullName: string; location: "florida" | "outside_florida"; identityMethod: "personally_known" | "ron_identity_verification"; identityStatus: "pending" | "passed" | "failed"; capacity: "individual" | "representative"; documentDescription: string };
type Witness = { fullName: string; kind: "physical" | "remote"; location: string; identityStatus: "pending" | "passed" | "failed" | null; usResidencyConfirmed: boolean | null; usLocationConfirmed: boolean | null };
type PreparationParameters = { jurisdiction: "Florida"; notarialAct: "acknowledgment_individual" | "acknowledgment_representative" | "jurat" | "other_authorized" | "not_established"; notaryState: string; notaryCounty: string; principals: Principal[]; witnesses: Witness[]; special117285: boolean; physicalWitnessCount: number; providerScreening: "unavailable" | "passed" | "not_permitted" };
type Attempt = { sessionId: string; parameters: PreparationParameters; state: string; workflowVersion: string; specificationStatus: string; modules: Module[]; stopReason: StopReason; productionEnabled: false };
type RoutePreview = Pick<Attempt, "modules" | "stopReason" | "productionEnabled">;

const inputClass = "mt-1 min-h-11 w-full rounded-md border border-silver bg-white px-3 text-sm text-navy";
const emptyPrincipal = (): Principal => ({ fullName: "", location: "florida", identityMethod: "ron_identity_verification", identityStatus: "pending", capacity: "individual", documentDescription: "" });
const emptyWitness = (): Witness => ({ fullName: "", kind: "physical", location: "", identityStatus: null, usResidencyConfirmed: null, usLocationConfirmed: null });
const emptyPreparation = (): PreparationParameters => ({ jurisdiction: "Florida", notarialAct: "acknowledgment_individual", notaryState: "Florida", notaryCounty: "", principals: [emptyPrincipal()], witnesses: [], special117285: false, physicalWitnessCount: 0, providerScreening: "unavailable" });

/** Candidate-only administrative preparation. The server remains the routing authority. */
export function AdminFloridaRonSessionAssistant({ appointmentId }: { appointmentId: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [form, setForm] = useState<PreparationParameters>(emptyPreparation);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/session-assistant`, { cache: "no-store" });
    if (response.status === 404) {
      setAttempt(null);
      setPreview(null);
      return;
    }
    if (!response.ok) throw new Error("Unable to load the prepared session.");
    const payload = await response.json() as { attempt: Attempt };
    setAttempt(payload.attempt);
    setForm(payload.attempt.parameters);
    setPreview({ modules: payload.attempt.modules, stopReason: payload.attempt.stopReason, productionEnabled: payload.attempt.productionEnabled });
  }, [appointmentId]);

  useEffect(() => {
    let active = true;
    load().catch(() => { if (active) setMessage("The prepared session could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const editable = !attempt || attempt.state === "prepared";
  const update = <K extends keyof PreparationParameters>(key: K, value: PreparationParameters[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updatePrincipal = (index: number, patch: Partial<Principal>) => setForm((current) => ({ ...current, principals: current.principals.map((principal, candidate) => candidate === index ? { ...principal, ...patch } : principal) }));
  const updateWitness = (index: number, patch: Partial<Witness>) => setForm((current) => ({ ...current, witnesses: current.witnesses.map((witness, candidate) => candidate === index ? { ...witness, ...patch } : witness) }));

  async function save() {
    if (saving || !editable) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/appointments/${encodeURIComponent(appointmentId)}/session-assistant`, { method: attempt ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!response.ok) throw new Error("Unable to save the prepared session.");
      const saved = await response.json() as { modules: Module[]; stopReason: StopReason; productionEnabled: false };
      // This is the server's deterministic route, not a client-side reimplementation.
      setPreview({ modules: saved.modules, stopReason: saved.stopReason, productionEnabled: saved.productionEnabled });
      await load();
      setMessage("Prepared session saved.");
    } catch {
      setMessage("The prepared session could not be saved. Review the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return <section id="session-assistant" aria-labelledby="session-assistant-heading"><AdminCard>
    <p className="text-xs font-semibold uppercase tracking-wide text-emeraldAction">Florida RON Session Assistant</p>
    <h2 id="session-assistant-heading" className="mt-1 text-xl font-semibold text-navy">Prepare Session</h2>
    <p className="mt-2 text-sm font-semibold text-slateDeep">Candidate — Not approved for production notarizations</p>
    <p className="mt-2 text-sm leading-6 text-slateDeep">Prepare the appointment details below. Routing is calculated and persisted by the server after each save.</p>
    {loading ? <p className="mt-4 text-sm text-slateDeep">Loading preparation…</p> : <div className="mt-5 space-y-6">
      {!attempt ? <p className="rounded-md border border-silver bg-mist p-3 text-sm text-slateDeep">No prepared session exists yet.</p> : null}
      {attempt && !editable ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-slateDeep">This session is {attempt.state.replaceAll("_", " ")} and can no longer be edited.</p> : null}
      <fieldset disabled={!editable || saving} className="space-y-5 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Jurisdiction"><input value="Florida" readOnly className={inputClass} /></Field>
          <Field label="Notarial act"><select aria-label="Notarial act" value={form.notarialAct} onChange={(event) => update("notarialAct", event.target.value as PreparationParameters["notarialAct"])} className={inputClass}><option value="acknowledgment_individual">Acknowledgment — individual</option><option value="acknowledgment_representative">Acknowledgment — representative</option><option value="jurat">Jurat</option><option value="other_authorized">Other authorized</option><option value="not_established">Not established</option></select></Field>
          <Field label="Notary state"><input aria-label="Notary state" value={form.notaryState} onChange={(event) => update("notaryState", event.target.value)} className={inputClass} /></Field>
          <Field label="Notary county"><input aria-label="Notary county" value={form.notaryCounty} onChange={(event) => update("notaryCounty", event.target.value)} className={inputClass} /></Field>
          <Field label="Physical witness count"><input aria-label="Physical witness count" type="number" min="0" max="20" value={form.physicalWitnessCount} onChange={(event) => update("physicalWitnessCount", Number(event.target.value))} className={inputClass} /></Field>
          <Field label="Provider screening"><select aria-label="Provider screening" value={form.providerScreening} onChange={(event) => update("providerScreening", event.target.value as PreparationParameters["providerScreening"])} className={inputClass}><option value="unavailable">Unavailable</option><option value="passed">Passed</option><option value="not_permitted">Not permitted</option></select></Field>
        </div>
        <label className="flex items-start gap-3 text-sm text-slateDeep"><input aria-label="Special 117.285" type="checkbox" checked={form.special117285} onChange={(event) => update("special117285", event.target.checked)} className="mt-1" /><span>Special 117.285 applies</span></label>
        <section aria-labelledby="principals-heading"><div className="flex items-center justify-between gap-3"><h3 id="principals-heading" className="text-base font-semibold text-navy">Principals</h3><Button type="button" variant="secondary" onClick={() => setForm((current) => ({ ...current, principals: [...current.principals, emptyPrincipal()] }))}>Add principal</Button></div><div className="mt-3 space-y-4">{form.principals.map((principal, index) => <PrincipalFields key={index} index={index} principal={principal} removable={form.principals.length > 1} onChange={updatePrincipal} onRemove={() => setForm((current) => ({ ...current, principals: current.principals.filter((_, candidate) => candidate !== index) }))} />)}</div></section>
        <section aria-labelledby="witnesses-heading"><div className="flex items-center justify-between gap-3"><h3 id="witnesses-heading" className="text-base font-semibold text-navy">Witnesses</h3><Button type="button" variant="secondary" onClick={() => setForm((current) => ({ ...current, witnesses: [...current.witnesses, emptyWitness()] }))}>Add witness</Button></div><div className="mt-3 space-y-4">{form.witnesses.map((witness, index) => <WitnessFields key={index} index={index} witness={witness} onChange={updateWitness} onRemove={() => setForm((current) => ({ ...current, witnesses: current.witnesses.filter((_, candidate) => candidate !== index) }))} />)}</div></section>
      </fieldset>
      <Button type="button" onClick={save} disabled={!editable || saving}>{saving ? "Saving…" : attempt ? "Save preparation" : "Prepare session"}</Button>
      {message ? <p role="status" className="text-sm font-semibold text-slateDeep">{message}</p> : null}
      <RoutePreview preview={preview} workflowVersion={attempt?.workflowVersion ?? "FL-RON-1.0"} />
      <AdminFloridaRonCandidatePreview appointmentId={appointmentId} available={Boolean(attempt && !preview?.stopReason && attempt.productionEnabled === false)} />
      <div aria-label="Production controls unavailable" className="rounded-md border border-silver bg-mist p-3"><p className="text-sm font-semibold text-navy">Production controls unavailable</p><div className="mt-3 flex flex-wrap gap-3"><Button type="button" disabled>Start ceremony</Button><Button type="button" disabled>Advance module</Button><Button type="button" disabled>Complete session</Button></div></div>
    </div>}
  </AdminCard></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-navy">{label}{children}</label>; }

function PrincipalFields({ index, principal, removable, onChange, onRemove }: { index: number; principal: Principal; removable: boolean; onChange: (index: number, patch: Partial<Principal>) => void; onRemove: () => void }) {
  const prefix = `Principal ${index + 1}`;
  return <div className="rounded-md border border-silver p-4"><div className="flex justify-between gap-3"><h4 className="font-semibold text-navy">{prefix}</h4>{removable ? <button type="button" onClick={onRemove} className="focus-ring text-sm font-semibold text-emeraldAction underline">Remove</button> : null}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label={`${prefix} name`}><input aria-label={`${prefix} name`} value={principal.fullName} onChange={(event) => onChange(index, { fullName: event.target.value })} className={inputClass} /></Field><Field label={`${prefix} location`}><select aria-label={`${prefix} location`} value={principal.location} onChange={(event) => onChange(index, { location: event.target.value as Principal["location"] })} className={inputClass}><option value="florida">Florida</option><option value="outside_florida">Georgia / outside Florida</option></select></Field><Field label={`${prefix} identity method`}><select aria-label={`${prefix} identity method`} value={principal.identityMethod} onChange={(event) => onChange(index, { identityMethod: event.target.value as Principal["identityMethod"] })} className={inputClass}><option value="ron_identity_verification">RON identity verification</option><option value="personally_known">Personally known</option></select></Field><Field label={`${prefix} identity status`}><select aria-label={`${prefix} identity status`} value={principal.identityStatus} onChange={(event) => onChange(index, { identityStatus: event.target.value as Principal["identityStatus"] })} className={inputClass}><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option></select></Field><Field label={`${prefix} capacity`}><select aria-label={`${prefix} capacity`} value={principal.capacity} onChange={(event) => onChange(index, { capacity: event.target.value as Principal["capacity"] })} className={inputClass}><option value="individual">Individual</option><option value="representative">Representative</option></select></Field><Field label={`${prefix} document description`}><input aria-label={`${prefix} document description`} value={principal.documentDescription} onChange={(event) => onChange(index, { documentDescription: event.target.value })} className={inputClass} /></Field></div></div>;
}

function WitnessFields({ index, witness, onChange, onRemove }: { index: number; witness: Witness; onChange: (index: number, patch: Partial<Witness>) => void; onRemove: () => void }) {
  const prefix = `Witness ${index + 1}`;
  return <div className="rounded-md border border-silver p-4"><div className="flex justify-between gap-3"><h4 className="font-semibold text-navy">{prefix}</h4><button type="button" onClick={onRemove} className="focus-ring text-sm font-semibold text-emeraldAction underline">Remove</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label={`${prefix} name`}><input aria-label={`${prefix} name`} value={witness.fullName} onChange={(event) => onChange(index, { fullName: event.target.value })} className={inputClass} /></Field><Field label={`${prefix} kind`}><select aria-label={`${prefix} kind`} value={witness.kind} onChange={(event) => onChange(index, { kind: event.target.value as Witness["kind"] })} className={inputClass}><option value="physical">Physical</option><option value="remote">Remote</option></select></Field><Field label={`${prefix} location`}><input aria-label={`${prefix} location`} value={witness.location} onChange={(event) => onChange(index, { location: event.target.value })} className={inputClass} /></Field><Field label={`${prefix} identity status`}><select aria-label={`${prefix} identity status`} value={witness.identityStatus ?? ""} onChange={(event) => onChange(index, { identityStatus: event.target.value ? event.target.value as Exclude<Witness["identityStatus"], null> : null })} className={inputClass}><option value="">Not recorded</option><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option></select></Field></div><div className="mt-3 flex flex-wrap gap-4 text-sm text-slateDeep"><label><input type="checkbox" checked={witness.usResidencyConfirmed === true} onChange={(event) => onChange(index, { usResidencyConfirmed: event.target.checked })} /> US residency confirmed</label><label><input type="checkbox" checked={witness.usLocationConfirmed === true} onChange={(event) => onChange(index, { usLocationConfirmed: event.target.checked })} /> US location confirmed</label></div></div>;
}

function RoutePreview({ preview, workflowVersion }: { preview: RoutePreview | null; workflowVersion: string }) { return <section aria-labelledby="route-preview-heading" className="rounded-md border border-silver bg-mist p-4"><h3 id="route-preview-heading" className="font-semibold text-navy">Persisted route preview</h3><p className="mt-1 text-sm text-slateDeep">Workflow version: {workflowVersion}</p>{preview ? <><ul className="mt-3 space-y-1 text-sm text-slateDeep">{preview.modules.map((module) => <li key={`${module.id}-${module.version}`}><code>{module.id}</code> · version <code>{module.version}</code></li>)}</ul>{preview.stopReason ? <p role="alert" className="mt-3 font-semibold text-red-800">Routing STOP: {preview.stopReason.replaceAll("_", " ")}</p> : <p className="mt-3 text-sm text-slateDeep">No routing STOP is present.</p>}</> : <p className="mt-3 text-sm text-slateDeep">Save preparation to receive the persisted route preview.</p>}</section>; }
