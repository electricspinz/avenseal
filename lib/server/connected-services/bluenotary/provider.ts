import type { ConnectedServiceContext, ProviderResult, ProviderStatusResult, RonDocumentUpload, RonParticipantInvitation, RonProvider, RonRecordingMetadata, RonSession, RonSessionRequest, RonSessionStatus, RonSignedDocumentMetadata } from "@/lib/server/connected-services/types";

/** A replaceable transport. The adapter does not supply a network implementation. */
export interface BlueNotaryTransport { request(input: BlueNotaryTransportRequest): Promise<BlueNotaryTransportResponse>; }
export type BlueNotaryTransportRequest = Readonly<{ method: string; path: string; body?: unknown }>;
export type BlueNotaryTransportResponse = Readonly<{ status: number; body: unknown }>;

/**
 * This is the only place an official BlueNotary endpoint schema may be introduced later.
 * It intentionally has no default paths, methods, headers, DTOs, or lifecycle mappings.
 */
export type BlueNotaryContractFixture = Readonly<{
  version: string;
  createSession?: (context: ConnectedServiceContext, request: RonSessionRequest) => BlueNotaryTransportRequest;
  parseSession?: (body: unknown) => RonSession | null;
  sessionStatus?: (context: ConnectedServiceContext, sessionId: string) => BlueNotaryTransportRequest;
  parseSessionStatus?: (body: unknown) => RonSessionStatus | null;
  completedDocuments?: (context: ConnectedServiceContext, sessionId: string) => BlueNotaryTransportRequest;
  parseCompletedDocuments?: (body: unknown) => readonly RonSignedDocumentMetadata[] | null;
  uploadDocument?: (context: ConnectedServiceContext, sessionId: string, document: RonDocumentUpload) => BlueNotaryTransportRequest;
  inviteParticipant?: (context: ConnectedServiceContext, sessionId: string, participant: RonParticipantInvitation) => BlueNotaryTransportRequest;
}>;

export type BlueNotaryProviderOptions = Readonly<{ transport: BlueNotaryTransport; configured: boolean; contract?: BlueNotaryContractFixture; version?: string }>;

/** Provider-neutral BlueNotary scaffold. It is deliberately not production-registered. */
export class BlueNotaryProvider implements RonProvider {
  readonly id = "bluenotary";
  readonly category = "ron" as const;
  readonly displayName = "BlueNotary";
  readonly version: string;
  readonly description = "Remote online notarization provider adapter; official contract pending.";
  readonly capabilities = ["ron.create_session", "ron.upload_document", "ron.invite_participant", "ron.session_status", "ron.completed_documents", "ron.webhook_events", "ron.signed_webhook_payloads"] as const;
  constructor(private readonly options: BlueNotaryProviderOptions) { this.version = options.version ?? "1"; }

  async getStatus(context: ConnectedServiceContext): Promise<ProviderStatusResult> { void context; return !this.options.configured || !this.options.contract ? { status: "not_configured", checkedAt: null, detail: "BlueNotary requires an official API contract fixture before it can be configured." } : { status: "unknown", checkedAt: null, detail: "BlueNotary status verification is not implemented until official status-contract details are available." }; }
  async createSession(context: ConnectedServiceContext, request: RonSessionRequest): Promise<ProviderResult<RonSession>> { const operation = this.options.contract?.createSession; const parse = this.options.contract?.parseSession; if (!operation || !parse) return notConfigured(); const result = await this.request(operation(context, request)); return result.ok ? parse(result.value) ? { ok: true, value: parse(result.value)! } : invalidResponse() : result; }
  async retrieveCompletionStatus(context: ConnectedServiceContext, sessionId: string): Promise<ProviderResult<RonSessionStatus>> { const operation = this.options.contract?.sessionStatus; const parse = this.options.contract?.parseSessionStatus; if (!operation || !parse) return notConfigured(); const result = await this.request(operation(context, sessionId)); return result.ok ? parse(result.value) ? { ok: true, value: parse(result.value)! } : invalidResponse() : result; }
  async retrieveSignedDocumentMetadata(context: ConnectedServiceContext, sessionId: string): Promise<ProviderResult<readonly RonSignedDocumentMetadata[]>> { const operation = this.options.contract?.completedDocuments; const parse = this.options.contract?.parseCompletedDocuments; if (!operation || !parse) return notConfigured(); const result = await this.request(operation(context, sessionId)); return result.ok ? parse(result.value) ? { ok: true, value: parse(result.value)! } : invalidResponse() : result; }
  async uploadDocument(context: ConnectedServiceContext, sessionId: string, document: RonDocumentUpload): Promise<ProviderResult<void>> { const operation = this.options.contract?.uploadDocument; if (!operation) return notConfigured(); const result = await this.request(operation(context, sessionId, document)); return result.ok ? { ok: true, value: undefined } : result; }
  async inviteParticipant(context: ConnectedServiceContext, sessionId: string, participant: RonParticipantInvitation): Promise<ProviderResult<void>> { const operation = this.options.contract?.inviteParticipant; if (!operation) return notConfigured(); const result = await this.request(operation(context, sessionId, participant)); return result.ok ? { ok: true, value: undefined } : result; }

  async retrieveSession(context: ConnectedServiceContext, sessionId: string): Promise<ProviderResult<RonSession>> { void context; void sessionId; return unsupported("Session retrieval is not supported until BlueNotary documents its session contract."); }
  async cancelSession(context: ConnectedServiceContext, sessionId: string): Promise<ProviderResult<RonSession>> { void context; void sessionId; return unsupported("Session cancellation is not supported by verified BlueNotary documentation."); }
  async retrieveJoinUrl(context: ConnectedServiceContext, sessionId: string): Promise<ProviderResult<string | null>> { void context; void sessionId; return unsupported("Join-link retrieval is not supported by verified BlueNotary documentation."); }
  async retrieveRecordingMetadata(context: ConnectedServiceContext, sessionId: string): Promise<ProviderResult<readonly RonRecordingMetadata[]>> { void context; void sessionId; return unsupported("Recording metadata is not supported by verified BlueNotary documentation."); }

  private async request(input: BlueNotaryTransportRequest): Promise<ProviderResult<unknown>> { if (!this.options.configured) return notConfigured(); try { const response = await this.options.transport.request(input); return response.status >= 200 && response.status < 300 ? { ok: true, value: response.body } : { ok: false, error: { code: "unknown", message: "BlueNotary returned an unverified HTTP response.", retryable: false, providerId: this.id } }; } catch { return { ok: false, error: { code: "unavailable", message: "BlueNotary could not be reached.", retryable: false, providerId: this.id } }; } }
}

function notConfigured<T>(): ProviderResult<T> { return { ok: false, error: { code: "configuration", message: "BlueNotary's official API contract is not configured.", retryable: false, providerId: "bluenotary" } }; }
function unsupported<T>(message: string): ProviderResult<T> { return { ok: false, error: { code: "unsupported_capability", message, retryable: false, providerId: "bluenotary" } }; }
function invalidResponse<T>(): ProviderResult<T> { return { ok: false, error: { code: "validation", message: "BlueNotary returned a response that does not match the configured contract.", retryable: false, providerId: "bluenotary" } }; }
