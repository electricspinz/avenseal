import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/process-communications.yml"), "utf8");

describe("communications scheduler workflow", () => {
  it("has the required triggers, timeout, and non-overlapping concurrency group", () => {
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("group: avenseal-communications-scheduler");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 10");
  });

  it("validates secret configuration, normalizes an HTTPS app URL, and uses repository secrets", () => {
    expect(workflow).toContain("secrets.AVENSEAL_APP_URL");
    expect(workflow).toContain("secrets.COMMUNICATION_PROCESSOR_SECRET");
    expect(workflow).toContain('app_url="${AVENSEAL_APP_URL%/}"');
    expect(workflow).toContain('[[ ! "$app_url" =~ ^https:// ]]');
    expect(workflow).not.toContain("https://app.example.com");
    expect(workflow).not.toContain("strong-random-secret");
  });

  it("posts reminders before communications and does not send an Origin header", () => {
    const reminderCall = workflow.indexOf('process_endpoint "Appointment reminders"');
    const communicationsCall = workflow.indexOf('process_endpoint "Queued communications"');

    expect(reminderCall).toBeGreaterThan(-1);
    expect(communicationsCall).toBeGreaterThan(reminderCall);
    expect(workflow).toContain("--request POST");
    expect(workflow).toContain('Authorization: Bearer ${COMMUNICATION_PROCESSOR_SECRET}');
    expect(workflow).not.toMatch(/--header\s+["']?Origin:/);
  });

  it("fails non-2xx responses and retries only network and 5xx failures", () => {
    expect(workflow).toContain("--fail");
    expect(workflow).toContain("--connect-timeout 10");
    expect(workflow).toContain("--max-time 60");
    expect(workflow).toContain('"$http_status" == "000" || "$http_status" =~ ^5[0-9]{2}$');
    expect(workflow).toContain("return 1");
    expect(workflow).toContain("--output /dev/null");
  });
});
