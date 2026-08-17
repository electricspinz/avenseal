import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const productionWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/process-document-scans-production.yml"), "utf8");
const stagingWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/process-document-scans-staging.yml"), "utf8");

describe("production document scan scheduler workflow", () => {
  it("uses the production environment, production URL variable, and required worker secret", () => {
    expect(productionWorkflow).toContain("environment: production");
    expect(productionWorkflow).toContain("AVENSEAL_APP_URL: ${{ vars.AVENSEAL_APP_URL }}");
    expect(productionWorkflow).toContain("DOCUMENT_SCAN_WORKER_SECRET: ${{ secrets.DOCUMENT_SCAN_WORKER_SECRET }}");
    expect(productionWorkflow).not.toContain("AVENSEAL_STAGING_APP_URL");
    expect(productionWorkflow).not.toMatch(/eicar|staging verification/i);
  });

  it("runs every five minutes or by manual dispatch with independent production serialization", () => {
    expect(productionWorkflow).toContain('cron: "*/5 * * * *"');
    expect(productionWorkflow).toContain("workflow_dispatch:");
    expect(productionWorkflow).toContain("group: avenseal-production-document-scan-scheduler");
    expect(productionWorkflow).toContain("cancel-in-progress: false");
    expect(productionWorkflow).toContain("timeout-minutes: 10");
  });

  it("uses server-to-server bearer authentication without an Origin header and fails on non-2xx responses", () => {
    expect(productionWorkflow).toContain("--request POST");
    expect(productionWorkflow).toContain("Authorization: Bearer ${DOCUMENT_SCAN_WORKER_SECRET}");
    expect(productionWorkflow).toContain("$APP_URL/api/internal/document-scans/process");
    expect(productionWorkflow).toContain("--fail");
    expect(productionWorkflow).toContain("--output /dev/null");
    expect(productionWorkflow).not.toMatch(/--header\s+["']?Origin:/);
    expect(productionWorkflow).not.toMatch(/cookie/i);
  });

  it("leaves the staging workflow isolated from production scheduler configuration", () => {
    expect(stagingWorkflow).toContain("environment: staging");
    expect(stagingWorkflow).toContain("group: avenseal-staging-document-scan-scheduler");
    expect(stagingWorkflow).toContain("AVENSEAL_STAGING_APP_URL");
    expect(stagingWorkflow).not.toContain("avenseal-production-document-scan-scheduler");
  });
});
