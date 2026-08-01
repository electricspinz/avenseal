import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/process-document-scans-staging.yml"), "utf8");

describe("staging document scan scheduler workflow", () => {
  it("uses a conservative five-minute schedule with deployment-controlled staging access", () => {
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("group: avenseal-staging-document-scan-scheduler");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 10");
  });

  it("uses only HTTPS server-to-server bearer authentication and a bounded batch", () => {
    expect(workflow).toContain("secrets.AVENSEAL_STAGING_APP_URL");
    expect(workflow).toContain("secrets.DOCUMENT_SCAN_WORKER_SECRET");
    expect(workflow).toContain('[[ ! "$app_url" =~ ^https:// ]]');
    expect(workflow).toContain("Authorization: Bearer ${DOCUMENT_SCAN_WORKER_SECRET}");
    expect(workflow).toContain("/api/internal/document-scans/process?batchSize=5");
    expect(workflow).toContain("--output /dev/null");
    expect(workflow).not.toMatch(/--header\s+["']?Origin:/);
    expect(workflow).not.toMatch(/cookie/i);
    expect(workflow).not.toContain("app.example.com");
  });
});
