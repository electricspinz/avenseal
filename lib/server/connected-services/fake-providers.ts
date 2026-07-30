import type { CalendarProvider, ConnectedServiceContext, MessagingProvider, PaymentProvider, ProviderError, ProviderResult, ProviderStatus, ProviderStatusResult, RonProvider, StorageProvider } from "@/lib/server/connected-services/types";

type FakeProviderOptions<T extends RonProvider | PaymentProvider | StorageProvider | MessagingProvider | CalendarProvider> = Omit<T, "getStatus"> & { status?: ProviderStatus };

class FakeProvider<T extends RonProvider | PaymentProvider | StorageProvider | MessagingProvider | CalendarProvider> {
  private readonly statuses = new Map<string, ProviderStatus>();
  constructor(private readonly options: FakeProviderOptions<T>) {}
  setStatus(organizationId: string, status: ProviderStatus) { this.statuses.set(organizationId, status); }
  asProvider(): T { return { ...this.options, getStatus: async (context: ConnectedServiceContext): Promise<ProviderStatusResult> => ({ status: this.statuses.get(context.organizationId) ?? this.options.status ?? "not_configured", checkedAt: null, detail: "Fake provider status." }) } as T; }
}

export class FakeRONProvider {
  private readonly status = new Map<string, ProviderStatus>();
  constructor(private readonly id = "fake-ron") {}
  setStatus(organizationId: string, status: ProviderStatus) { this.status.set(organizationId, status); }
  asProvider(): RonProvider {
    const unsupported = <T>(): Promise<ProviderResult<T>> => Promise.resolve({ ok: false, error: unsupportedRonError(this.id) });
    return { id: this.id, category: "ron", displayName: "Fake RON", version: "0.0.0-test", description: "Test-only RON provider.", capabilities: ["ron.create_session", "ron.retrieve_session"], getStatus: async (context) => ({ status: this.status.get(context.organizationId) ?? "not_configured", checkedAt: null, detail: "Fake provider status." }), createSession: () => unsupported(), retrieveSession: () => unsupported(), cancelSession: () => unsupported(), retrieveJoinUrl: () => unsupported(), retrieveCompletionStatus: () => unsupported(), retrieveRecordingMetadata: () => unsupported(), retrieveSignedDocumentMetadata: () => unsupported(), uploadDocument: () => unsupported(), inviteParticipant: () => unsupported() };
  }
}
export class FakePaymentProvider extends FakeProvider<PaymentProvider> { constructor(id = "fake-payment") { super({ id, category: "payment", displayName: "Fake Payments", version: "0.0.0-test", description: "Test-only payment provider.", capabilities: ["payment.create_payment", "payment.status"] }); } }
export class FakeStorageProvider extends FakeProvider<StorageProvider> { constructor(id = "fake-storage") { super({ id, category: "storage", displayName: "Fake Storage", version: "0.0.0-test", description: "Test-only storage provider.", capabilities: ["storage.upload", "storage.download", "storage.metadata"] }); } }
export class FakeMessagingProvider extends FakeProvider<MessagingProvider> { constructor(id = "fake-messaging") { super({ id, category: "messaging", displayName: "Fake Messaging", version: "0.0.0-test", description: "Test-only messaging provider.", capabilities: ["messaging.email", "messaging.delivery_status"] }); } }
export class FakeCalendarProvider extends FakeProvider<CalendarProvider> { constructor(id = "fake-calendar") { super({ id, category: "calendar", displayName: "Fake Calendar", version: "0.0.0-test", description: "Test-only calendar provider.", capabilities: ["calendar.create_event", "calendar.availability"] }); } }

function unsupportedRonError(providerId: string): ProviderError { return { code: "unavailable", message: "The fake RON provider does not implement this operation.", retryable: false, providerId }; }
