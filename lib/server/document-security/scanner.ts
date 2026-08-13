import { z } from "zod";
import { appointmentDocumentStorage } from "@/lib/server/document-storage";

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

export type DocumentScannerFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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

function cloudmersiveFilename(contentType: DocumentScanRequest["contentType"]) {
  return contentType === "application/pdf" ? "document.pdf" : contentType === "image/jpeg" ? "document.jpg" : "document.png";
}

async function scanBytes(bytes: DocumentScanRequest["bytes"]) {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (bytes instanceof Uint8Array) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(bytes).arrayBuffer();
}

const cloudmersiveVirusFindingSchema = z.object({
  FileName: z.string(),
  VirusName: z.string()
}).strict();

const cloudmersiveResponseSchema = z.object({
  CleanResult: z.boolean(),
  // Cloudmersive's basic endpoint returns null for FoundViruses on a clean result.
  FoundViruses: z.union([z.array(cloudmersiveVirusFindingSchema), z.null()]).optional()
}).strict().superRefine((value, context) => {
  if (value.CleanResult && Array.isArray(value.FoundViruses) && value.FoundViruses.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A clean scan result cannot contain virus findings." });
  }
});

type CloudmersiveResponse = z.infer<typeof cloudmersiveResponseSchema>;

function isCloudmersiveResponse(value: unknown): value is CloudmersiveResponse {
  return cloudmersiveResponseSchema.safeParse(value).success;
}

function cloudmersiveHttpFailure(status: number): DocumentScanResult {
  if (status === 401 || status === 403) return { outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "authentication_failed" };
  if (status === 429) return { outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "provider_rate_limited" };
  if ([408, 425, 500, 502, 503, 504].includes(status)) return { outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "provider_unavailable" };
  return status >= 400 && status < 500
    ? { outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "provider_rejected" }
    : { outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "provider_unavailable" };
}

/** Server-only adapter for Cloudmersive's verified basic virus-scan endpoint. */
export class CloudmersiveMalwareScanner implements MalwareScanner {
  constructor(readonly config: DocumentScannerConfiguration, private readonly fetchImplementation: DocumentScannerFetch = globalThis.fetch) {}
  async scan(request: DocumentScanRequest): Promise<DocumentScanResult> {
    try {
      validateDocumentScanRequest(request);
      const bytes = await scanBytes(request.bytes);
      if (bytes.byteLength === 0 || bytes.byteLength > appointmentDocumentStorage.maximumSizeBytes) throw new DocumentScannerProviderError("invalid_response");
      const form = new FormData();
      form.append("inputFile", new Blob([bytes], { type: request.contentType }), cloudmersiveFilename(request.contentType));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetchImplementation(new URL("/virus/scan/file", this.config.baseUrl), { method: "POST", headers: { Apikey: this.config.apiKey }, body: form, signal: controller.signal });
        if (!response.ok) return cloudmersiveHttpFailure(response.status);
        let payload: unknown;
        try { payload = await response.json(); } catch { return { outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "invalid_response" }; }
        if (!isCloudmersiveResponse(payload)) return { outcome: "permanent_failure", provider: "cloudmersive", safeFailureCategory: "invalid_response" };
        return payload.CleanResult ? { outcome: "clean", provider: "cloudmersive" } : { outcome: "infected", provider: "cloudmersive" };
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return { outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "provider_timeout" };
        if (error instanceof TypeError) return { outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "network_error" };
        return { outcome: "retryable_failure", provider: "cloudmersive", safeFailureCategory: "unexpected_error" };
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      return normalizeDocumentScannerError(error, "cloudmersive");
    }
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
