import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { documentMetadataCreationDefaults } from "@/lib/server/document-repository";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0019_document_scan_state_foundation.sql"), "utf8");

describe("document scan-state migration", () => {
  it("adds conservative scan and storage lifecycle defaults with clean-only activation", () => {
    expect(migration).toContain(`scan_status text not null default '${documentMetadataCreationDefaults.scan_status}'`);
    expect(migration).toContain(`storage_status text not null default '${documentMetadataCreationDefaults.storage_status}'`);
    expect(migration).toContain(`scan_attempt_count integer not null default ${documentMetadataCreationDefaults.scan_attempt_count}`);
    expect(migration).toContain("scan_status in ('pending', 'clean', 'infected', 'suspicious', 'failed')");
    expect(migration).toContain("storage_status in ('quarantined', 'active', 'removed')");
    expect(migration).toContain("scan_attempt_count >= 0");
    expect(migration).toContain("storage_status <> 'active' or scan_status = 'clean'");
  });

  it("adds operational indexes without raw scanner-report or credential fields", () => {
    expect(migration).toContain("appointment_document_files_pending_scan_idx");
    expect(migration).toContain("appointment_document_files_active_clean_appointment_idx");
    expect(migration).toContain("appointment_document_files_cleanup_idx");
    for (const prohibited of ["scanner_report", "raw_report", "signed_url", "token", "credential", "file_bytes"]) expect(migration).not.toContain(prohibited);
  });
});
