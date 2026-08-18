import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assistantStopReasons, advanceFloridaRonSession, completeFloridaRonSession, floridaRonModules, startFloridaRonSession, stopFloridaRonSession } from "@/lib/server/florida-ron-session-assistant";

const candidate = { specificationStatus: "candidate" as const, state: "prepared" as const, modules: [floridaRonModules.core], currentModuleIndex: 0, stopReason: null, principalProgress: [] };

describe("Florida RON Candidate terminal states", () => {
  it("covers every safe STOP condition and keeps stopped attempts terminal", () => {
    expect(assistantStopReasons).toEqual(expect.arrayContaining(["identity", "technology", "willingness", "capacity", "incomplete_document", "declined_consent", "remote_witness", "outside_florida_confirmation", "notarial_act_not_established", "notary_not_in_florida"]));
    for (const reason of assistantStopReasons) {
      const stopped = stopFloridaRonSession(candidate, reason);
      expect(stopped).toMatchObject({ state: "stopped", stopReason: reason });
      expect(startFloridaRonSession(stopped)).toEqual(stopped);
      expect(advanceFloridaRonSession(stopped)).toEqual(stopped);
      expect(completeFloridaRonSession({ ...stopped, state: "final_review" }, true)).not.toMatchObject({ state: "completed" });
    }
  });

  it("keeps the Candidate production gate closed and persists separate preview terminals", async () => {
    expect(startFloridaRonSession(candidate)).toEqual(candidate);
    expect(completeFloridaRonSession({ ...candidate, state: "final_review" }, true)).not.toMatchObject({ state: "completed" });
    const sql = await readFile(fileURLToPath(new URL("../../supabase/migrations/0030_florida_ron_session_assistant_candidate_terminals.sql", import.meta.url)), "utf8");
    expect(sql).toContain("preview_completed");
    expect(sql).toContain("Candidate Florida RON attempts cannot enter production ceremony execution");
    expect(sql).toContain("Terminal Florida RON attempts cannot transition");
  });
});
