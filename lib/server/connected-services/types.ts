export type ConnectedServiceCategory = "ron" | "payment" | "storage" | "messaging" | "calendar";
export type ProviderStatus = "available" | "unavailable" | "disabled" | "not_configured" | "unknown";
export type ProviderConfigurationState = "configured" | "not_configured" | "disabled" | "unknown";
export type ProviderCapability =
  | "ron.create_session" | "ron.cancel_session" | "ron.retrieve_session" | "ron.join_url" | "ron.completion_status" | "ron.recording_metadata" | "ron.signed_document_metadata"
  | "payment.create_payment" | "payment.status" | "payment.refund" | "payment.receipt"
  | "storage.upload" | "storage.download" | "storage.delete" | "storage.metadata"
  | "messaging.email" | "messaging.sms" | "messaging.templates" | "messaging.delivery_status"
  | "calendar.create_event" | "calendar.update_event" | "calendar.delete_event" | "calendar.availability";
export type ProviderErrorCode = "configuration" | "authentication" | "rate_limited" | "unavailable" | "timeout" | "validation" | "unknown";

export type ConnectedServiceContext = Readonly<{ organizationId: string }>;
export type ProviderStatusResult = Readonly<{ status: ProviderStatus; checkedAt: string | null; detail: string }>;
export type ProviderConfiguration = Readonly<{ providerId: string; organizationId: string; state: ProviderConfigurationState; version: string; safeSettings: Readonly<Record<string, string | number | boolean | null>> }>;
export type ProviderError = Readonly<{ code: ProviderErrorCode; message: string; retryable: boolean; providerId?: string; causeName?: string }>;
export type ProviderAuditEvent = Readonly<{ eventType: "provider.requested" | "provider.succeeded" | "provider.failed" | "provider.status_checked"; providerId: string; organizationId: string; category: ConnectedServiceCategory; occurredAt: string; correlationId: string | null; safeMetadata: Readonly<Record<string, string | number | boolean | null>> }>;

export interface ConnectedServiceProvider {
  readonly id: string;
  readonly category: ConnectedServiceCategory;
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly capabilities: readonly ProviderCapability[];
  getStatus(context: ConnectedServiceContext): Promise<ProviderStatusResult>;
}

export interface RonProvider extends ConnectedServiceProvider { readonly category: "ron"; }
export interface PaymentProvider extends ConnectedServiceProvider { readonly category: "payment"; }
export interface StorageProvider extends ConnectedServiceProvider { readonly category: "storage"; }
export interface MessagingProvider extends ConnectedServiceProvider { readonly category: "messaging"; }
export interface CalendarProvider extends ConnectedServiceProvider { readonly category: "calendar"; }

export type ConnectedServiceAdminItem = Readonly<{ id: string; category: ConnectedServiceCategory; name: string; version: string; description: string; capabilities: readonly ProviderCapability[]; status: ProviderStatus; configurationState: ProviderConfigurationState; checkedAt: string | null; detail: string }>;
