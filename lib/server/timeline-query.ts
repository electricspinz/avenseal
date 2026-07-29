import {
  InMemoryTimelineStore,
  type TimelineCategory,
  type TimelineOutcome,
  type TimelineQuery
} from "@/lib/server/customer-timeline";

const categories: readonly TimelineCategory[] = ["appointment", "communication", "automation", "payment", "document", "customer", "staff", "system"];
const outcomes: readonly TimelineOutcome[] = ["informational", "pending", "succeeded", "failed", "skipped", "cancelled", "requires_attention"];

// Persistence is intentionally deferred; this boundary keeps UI reads independent of the future store implementation.
const timelineStore = new InMemoryTimelineStore();

export type TimelineFilterInput = Readonly<{ category?: string; outcome?: string; appointmentId?: string }>;

export function parseTimelineFilters(input: TimelineFilterInput) {
  return {
    category: categories.find((category) => category === input.category),
    outcome: outcomes.find((outcome) => outcome === input.outcome),
    appointmentId: input.appointmentId || undefined
  };
}

export function queryCustomerTimeline(query: TimelineQuery) {
  return timelineStore.list(query);
}

export function queryAppointmentTimeline(query: TimelineQuery & { readonly appointmentId: string }) {
  return timelineStore.list(query);
}
