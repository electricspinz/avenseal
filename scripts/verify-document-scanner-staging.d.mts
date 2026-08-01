export type DocumentScannerStagingSummary = Readonly<{
  mode: "dry-run" | "adapter-only";
  provider: "cloudmersive";
  configurationValid: true;
  cleanCheck: "passed" | "failed" | "not_run";
  infectedCheck: "passed" | "failed" | "approval_required" | "not_run";
  workerCheck: "not_run";
  cleanupCheck: "not_run";
  overallPass: boolean;
  failureCategory?: string;
}>;

export function validateStagingScannerEnvironment(env: Record<string, string | undefined>): { provider: "cloudmersive"; baseUrl: string; apiKey: string; timeoutMs: number };
export function runDocumentScannerStagingVerification(input?: { env?: Record<string, string | undefined>; args?: string[]; fetchImplementation?: typeof fetch }): Promise<DocumentScannerStagingSummary>;
