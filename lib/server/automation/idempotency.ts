export type AutomationIdempotencyKey = string;

export type AutomationIdempotencyKeyInput = {
  readonly organizationId: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly logicalExecutionId: string;
  readonly policyDiscriminator?: string;
};

export type AutomationIdempotencyRecord = {
  readonly key: AutomationIdempotencyKey;
  readonly organizationId: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly logicalExecutionId: string;
  readonly state: "reserved" | "completed";
  readonly expiresAt: string;
};

export type AutomationReservation =
  | { readonly kind: "reserved"; readonly record: AutomationIdempotencyRecord }
  | { readonly kind: "duplicate"; readonly record: AutomationIdempotencyRecord }
  | { readonly kind: "expired"; readonly record: AutomationIdempotencyRecord };

export type AutomationIdempotencyLookup =
  | { readonly kind: "missing" }
  | { readonly kind: "reserved" | "completed" | "expired"; readonly record: AutomationIdempotencyRecord };

export type AutomationReservationRequest = {
  readonly key: AutomationIdempotencyKey;
  readonly organizationId: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly logicalExecutionId: string;
  readonly now: Date;
  readonly expiresAt: Date;
};

export interface AutomationIdempotencyStore {
  reserve(request: AutomationReservationRequest): Promise<AutomationReservation>;
  complete(key: AutomationIdempotencyKey, now: Date): Promise<void>;
  release(key: AutomationIdempotencyKey): Promise<void>;
  lookup(key: AutomationIdempotencyKey, now: Date): Promise<AutomationIdempotencyLookup>;
  reset(): Promise<void>;
}

export function createAutomationIdempotencyKey(input: AutomationIdempotencyKeyInput): AutomationIdempotencyKey {
  return [input.organizationId, input.ruleId, input.ruleVersion, input.logicalExecutionId, input.policyDiscriminator ?? ""].map(encodeKeyPart).join(".");
}

export class InMemoryAutomationIdempotencyStore implements AutomationIdempotencyStore {
  private readonly records = new Map<AutomationIdempotencyKey, AutomationIdempotencyRecord>();

  async reserve(request: AutomationReservationRequest): Promise<AutomationReservation> {
    const existing = this.records.get(request.key);
    if (existing) {
      if (isExpired(existing, request.now)) {
        this.records.delete(request.key);
        const record = createRecord(request);
        this.records.set(record.key, record);
        return { kind: "reserved", record: copyRecord(record) };
      }
      return { kind: "duplicate", record: copyRecord(existing) };
    }
    const record = createRecord(request);
    this.records.set(record.key, record);
    return { kind: "reserved", record: copyRecord(record) };
  }

  async complete(key: AutomationIdempotencyKey, now: Date): Promise<void> {
    const record = this.records.get(key);
    if (!record || isExpired(record, now)) throw new Error("Idempotency reservation is not available for completion.");
    this.records.set(key, { ...record, state: "completed" });
  }

  async release(key: AutomationIdempotencyKey): Promise<void> {
    this.records.delete(key);
  }

  async lookup(key: AutomationIdempotencyKey, now: Date): Promise<AutomationIdempotencyLookup> {
    const record = this.records.get(key);
    if (!record) return { kind: "missing" };
    if (isExpired(record, now)) return { kind: "expired", record: copyRecord(record) };
    return { kind: record.state, record: copyRecord(record) };
  }

  async reset(): Promise<void> {
    this.records.clear();
  }
}

function encodeKeyPart(value: string) {
  return `${value.length}:${value}`;
}

function createRecord(request: AutomationReservationRequest): AutomationIdempotencyRecord {
  return { key: request.key, organizationId: request.organizationId, ruleId: request.ruleId, ruleVersion: request.ruleVersion, logicalExecutionId: request.logicalExecutionId, state: "reserved", expiresAt: request.expiresAt.toISOString() };
}

function isExpired(record: AutomationIdempotencyRecord, now: Date) {
  return Date.parse(record.expiresAt) <= now.getTime();
}

function copyRecord(record: AutomationIdempotencyRecord): AutomationIdempotencyRecord {
  return { ...record };
}
