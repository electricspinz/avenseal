import { z } from "zod";

export const documentScanOutcomes = ["clean", "infected", "suspicious", "retryable_failure", "permanent_failure"] as const;
export type DocumentScanOutcome = (typeof documentScanOutcomes)[number];

export const documentScanFailureCategories = ["configuration_error", "provider_timeout", "provider_unavailable", "provider_rate_limited", "invalid_response", "authentication_failed", "provider_rejected", "network_error", "unexpected_error"] as const;
export type DocumentScanFailureCategory = (typeof documentScanFailureCategories)[number];

export type DocumentScanRequest = Readonly<{
  documentId: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  bytes: Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;
  correlationId: string;
  originalFilename?: string;
}>;

export type DocumentScanResult = Readonly<{
  outcome: DocumentScanOutcome;
  provider: string;
  providerRequestId?: string;
  durationMs?: number;
  safeFailureCategory?: DocumentScanFailureCategory;
}>;

export interface MalwareScanner {
  scan(request: DocumentScanRequest): Promise<DocumentScanResult>;
}

const scannerRequestSchema = z.object({
  documentId: z.string().trim().min(1),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  correlationId: z.string().trim().min(1),
  originalFilename: z.string().trim().min(1).max(255).optional()
});

const scannerConfigSchema = z.object({
  provider: z.literal("cloudmersive"),
  enabled: z.literal(true),
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().trim().url().refine((value) => new URL(value).protocol === "https:", "Scanner base URL must use HTTPS."),
  timeoutMs: z.number().int().min(1_000).max(120_000)
});

export type DocumentScannerConfiguration = Readonly<z.infer<typeof scannerConfigSchema>>;
export type RawDocumentScannerEnvironment = Readonly<Record<string, string | undefined>>;

export class DocumentScannerConfigurationError extends Error {
  constructor() {
    super("Document scanner configuration is unavailable.");
    this.name = "DocumentScannerConfigurationError";
  }
}

export class DocumentScannerTimeoutError extends Error {
  constructor() {
    super("Document scanner request timed out.");
    this.name = "DocumentScannerTimeoutError";
  }
}

export class DocumentScannerProviderError extends Error {
  constructor(readonly category: DocumentScanFailureCategory) {
    super("Document scanner provider request failed.");
    this.name = "DocumentScannerProviderError";
  }
}

function invalidConfiguration(): never {
  throw new DocumentScannerConfigurationError();
}

export function parseDocumentScannerConfiguration(raw: RawDocumentScannerEnvironment = process.env): DocumentScannerConfiguration {
  if (raw.DOCUMENT_SCANNER_ENABLED?.trim().toLowerCase() !== "true") invalidConfiguration();
  if (raw.DOCUMENT_SCANNER_PROVIDER?.trim().toLowerCase() !== "cloudmersive") invalidConfiguration();
  const parsed = scannerConfigSchema.safeParse({
    provider: raw.DOCUMENT_SCANNER_PROVIDER?.trim().toLowerCase(),
    enabled: true,
    apiKey: raw.DOCUMENT_SCANNER_API_KEY,
    baseUrl: raw.DOCUMENT_SCANNER_BASE_URL,
    timeoutMs: Number(raw.DOCUMENT_SCANNER_TIMEOUT_MS ?? "45000")
  });
  if (!parsed.success) invalidConfiguration();
  return parsed.data;
}

/** Validates only metadata safe to send to a selected provider; byte ownership stays with the caller. */
export function validateDocumentScanRequest(request: DocumentScanRequest): DocumentScanRequest {
  const parsed = scannerRequestSchema.safeParse(request);
  if (!parsed.success) throw new DocumentScannerConfigurationError();
  return request;
}

export function normalizeDocumentScannerError(error: unknown, provider: string): DocumentScanResult {
  if (error instanceof DocumentScannerTimeoutError) return { outcome: "retryable_failure", provider, safeFailureCategory: "provider_timeout" };
  if (error instanceof DocumentScannerConfigurationError) return { outcome: "permanent_failure", provider, safeFailureCategory: "configuration_error" };
  if (error instanceof DocumentScannerProviderError) {
    return error.category === "authentication_failed" || error.category === "provider_rejected" || error.category === "invalid_response"
      ? { outcome: "permanent_failure", provider, safeFailureCategory: error.category }
      : { outcome: "retryable_failure", provider, safeFailureCategory: error.category };
  }
  return { outcome: "retryable_failure", provider, safeFailureCategory: "unexpected_error" };
}

export async function withDocumentScannerTimeout<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new DocumentScannerConfigurationError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DocumentScannerTimeoutError());
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type SafeScannerCall = Readonly<Pick<DocumentScanRequest, "documentId" | "contentType" | "sizeBytes" | "correlationId"> & { originalFilename?: string }>;
export type FakeScannerBehavior = DocumentScanOutcome | "timeout" | "malformed";

/** Test-only deterministic adapter. It captures safe request metadata and never retains file bytes. */
export function createFakeMalwareScanner(behavior: FakeScannerBehavior = "clean") {
  const calls: SafeScannerCall[] = [];
  const scanner: MalwareScanner = {
    async scan(request) {
      calls.push({ documentId: request.documentId, contentType: request.contentType, sizeBytes: request.sizeBytes, correlationId: request.correlationId, ...(request.originalFilename ? { originalFilename: request.originalFilename } : {}) });
      if (behavior === "timeout") return normalizeDocumentScannerError(new DocumentScannerTimeoutError(), "fake");
      if (behavior === "malformed") return normalizeDocumentScannerError(new DocumentScannerProviderError("invalid_response"), "fake");
      return behavior === "retryable_failure" || behavior === "permanent_failure"
        ? { outcome: behavior, provider: "fake", safeFailureCategory: behavior === "retryable_failure" ? "provider_unavailable" : "provider_rejected" }
        : { outcome: behavior, provider: "fake" };
    }
  };
  return { scanner, calls: () => [...calls] };
}

class FailClosedMalwareScanner implements MalwareScanner {
  constructor(private readonly provider: string, private readonly reason: DocumentScanFailureCategory) {}
  async scan(): Promise<DocumentScanResult> {
    return { outcome: "permanent_failure", provider: this.provider, safeFailureCategory: this.reason };
  }
}

/** No request is made until Cloudmersive's result schema is verified for this sensitive-document use case. */
export class CloudmersiveMalwareScanner implements MalwareScanner {
  constructor(readonly config: DocumentScannerConfiguration) {}
  async scan(request: DocumentScanRequest): Promise<DocumentScanResult> {
    validateDocumentScanRequest(request);
    return normalizeDocumentScannerError(new DocumentScannerProviderError("invalid_response"), "cloudmersive");
  }
}

/** Production factory. Fake scanners are accepted only as an explicit caller-provided test dependency. */
export function createDocumentMalwareScanner(raw: RawDocumentScannerEnvironment = process.env, testScanner?: MalwareScanner): MalwareScanner {
  if (testScanner) return testScanner;
  try {
    return new CloudmersiveMalwareScanner(parseDocumentScannerConfiguration(raw));
  } catch {
    return new FailClosedMalwareScanner("unconfigured", "configuration_error");
  }
}
