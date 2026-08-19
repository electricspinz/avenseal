import { floridaRonWorkflowVersion11, readFloridaRonCandidateSpecification, type FloridaRonModule } from "@/lib/server/florida-ron-session-assistant";

export type FloridaRonCandidatePreviewModule = Readonly<FloridaRonModule & { content: string }>;

/**
 * Extracts a versioned module verbatim from the locked candidate source. The preview
 * never owns a second copy of script or legal text.
 */
export async function readFloridaRonCandidatePreviewModules(modules: readonly FloridaRonModule[], workflowVersion?: string): Promise<readonly FloridaRonCandidatePreviewModule[]> {
  const source = await readFloridaRonCandidateSpecification(workflowVersion);
  return modules.map((module) => ({ ...module, content: extractModule(source, module.id, module.version) }));
}

function extractModule(source: string, id: string, version: string): string {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^# \\d+\\. ${escapedId} v${escapedVersion}\\n`, "m");
  const match = source.match(pattern);
  if (!match) throw new Error(`Locked Florida RON module ${id} v${version} is unavailable.`);
  const contentStart = (match.index ?? 0) + match[0].length;
  const nextModule = source.indexOf("\n# ", contentStart);
  return source.slice(contentStart, nextModule === -1 ? undefined : nextModule).trim();
}

/** The v1.1 completion checklist is source-backed and checked server-side before a Candidate simulation can finish. */
export async function requiredFloridaRonCandidateCompletionConfirmations(workflowVersion: string, parameters: unknown): Promise<readonly string[]> {
  if (workflowVersion !== floridaRonWorkflowVersion11) return [];
  const source = await readFloridaRonCandidateSpecification(workflowVersion);
  const completion = extractModule(source, "FL-COMPLETE", "1.1");
  const review = completion.match(/## Final Compliance Review\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? "";
  const principal = objectProperty(parameters, "principals");
  const witnesses = objectProperty(parameters, "witnesses");
  const special117285 = objectProperty(parameters, "special117285") === true;
  const notarialAct = objectProperty(parameters, "notarialAct");
  return (review.match(/^- (.+)$/gm) ?? []).map((line) => line.slice(2)).filter((item) => {
    const normalized = item.toLowerCase();
    if (normalized.includes("outside-florida")) return Array.isArray(principal) && principal.some((entry) => objectProperty(entry, "location") === "outside_florida");
    if (normalized.includes("witness")) return Array.isArray(witnesses) && witnesses.length > 0;
    if (normalized.includes("117.285")) return special117285;
    if (normalized.includes("representative")) return notarialAct === "acknowledgment_representative";
    return true;
  });
}

function objectProperty(value: unknown, key: string): unknown { return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined; }
