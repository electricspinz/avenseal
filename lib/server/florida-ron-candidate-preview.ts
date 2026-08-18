import { readFloridaRonCandidateSpecification, type FloridaRonModule } from "@/lib/server/florida-ron-session-assistant";

export type FloridaRonCandidatePreviewModule = Readonly<FloridaRonModule & { content: string }>;

/**
 * Extracts a versioned module verbatim from the locked candidate source. The preview
 * never owns a second copy of script or legal text.
 */
export async function readFloridaRonCandidatePreviewModules(modules: readonly FloridaRonModule[]): Promise<readonly FloridaRonCandidatePreviewModule[]> {
  const source = await readFloridaRonCandidateSpecification();
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
