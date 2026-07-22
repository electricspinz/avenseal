import type { OrganizationService } from "@/lib/types";

export const standardServiceInternalName = "florida_remote_online_notarial_act";

export function getStandardNotarialActService(services: OrganizationService[]) {
  return services.find((service) => service.internalName === standardServiceInternalName && service.isActive) ?? null;
}

export function calculateCheckoutLineItem(service: OrganizationService) {
  if (!service.isActive) throw new Error("Selected service is not active.");
  if (service.basePriceCents === null) throw new Error("Selected service is missing a configured price.");
  if (service.basePriceCents !== 2500) throw new Error("Avenseal standard notarial act must be configured at 2500 cents.");
  return {
    name: service.customerName,
    quantity: 1,
    amountCents: service.basePriceCents,
    currency: service.currency.toLowerCase(),
    totalCents: service.basePriceCents
  };
}

export function assertNoUnapprovedFees(lineItems: Array<{ name: string; amountCents: number }>) {
  const forbidden = ["technology", "coordination", "same-day", "after-hours", "weekend", "convenience", "tip"];
  return lineItems.every((item) => forbidden.every((term) => !item.name.toLowerCase().includes(term)));
}
