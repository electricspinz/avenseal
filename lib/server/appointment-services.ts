import { devStore } from "@/lib/server/dev-store";
import { fallbackAvensealOrganizationId } from "@/lib/server/organization";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";
import type { AppointmentRequest, OrganizationService } from "@/lib/types";

export type BookableAppointmentService = OrganizationService & {
  organizationId: string;
};

export type AppointmentServiceSnapshot = {
  serviceId: string;
  serviceNameSnapshot: string;
  serviceDurationMinutesSnapshot: number;
  servicePriceCentsSnapshot: number | null;
  serviceCurrencySnapshot: string;
};

export async function loadBookableAppointmentService(
  organizationId: string,
  serviceId: string
): Promise<BookableAppointmentService> {
  if (!hasSupabaseServiceConfig()) {
    const settings = await devStore.getOrganizationSettings();
    const service = settings.services.find((item) => item.id === serviceId);
    if (
      organizationId !== fallbackAvensealOrganizationId ||
      !service ||
      !service.isActive ||
      service.deliveryType !== "remote"
    ) {
      throw new Error("Selected service is not available.");
    }
    return { ...service, organizationId };
  }

  const { data, error } = await getSupabaseAdmin()
    .from("organization_services")
    .select("id,organization_id,internal_name,customer_name,description,base_price_cents,currency,default_duration_minutes,is_active,display_order,delivery_type,metadata")
    .eq("organization_id", organizationId)
    .eq("id", serviceId)
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (
    !row ||
    !row.is_active ||
    row.delivery_type !== "remote" ||
    (isRecord(row.metadata) && row.metadata.bookable === false)
  ) {
    throw new Error("Selected service is not available.");
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    internalName: row.internal_name,
    customerName: row.customer_name,
    description: row.description,
    basePriceCents: row.base_price_cents,
    currency: row.currency,
    defaultDurationMinutes: row.default_duration_minutes,
    isActive: row.is_active,
    displayOrder: row.display_order,
    deliveryType: row.delivery_type
  };
}

export function buildAppointmentServiceSnapshot(
  service: BookableAppointmentService,
  organizationId: string
): AppointmentServiceSnapshot {
  if (
    service.organizationId !== organizationId ||
    !service.isActive ||
    service.deliveryType !== "remote"
  ) {
    throw new Error("Selected service is not available.");
  }
  if (
    !Number.isInteger(service.defaultDurationMinutes) ||
    service.defaultDurationMinutes < 5 ||
    service.defaultDurationMinutes > 240
  ) {
    throw new Error("Selected service duration is invalid.");
  }
  if (
    service.basePriceCents !== null &&
    (!Number.isInteger(service.basePriceCents) || service.basePriceCents < 0)
  ) {
    throw new Error("Selected service price is invalid.");
  }
  if (!/^[A-Z]{3}$/.test(service.currency)) {
    throw new Error("Selected service currency is invalid.");
  }

  return {
    serviceId: service.id,
    serviceNameSnapshot: service.customerName,
    serviceDurationMinutesSnapshot: service.defaultDurationMinutes,
    servicePriceCentsSnapshot: service.basePriceCents,
    serviceCurrencySnapshot: service.currency
  };
}

export function resolveAppointmentDuration(
  durationSnapshot: number | null | undefined,
  legacyDefaultDurationMinutes: number
) {
  if (
    typeof durationSnapshot === "number" &&
    Number.isInteger(durationSnapshot) &&
    durationSnapshot >= 5 &&
    durationSnapshot <= 240
  ) {
    return durationSnapshot;
  }
  return legacyDefaultDurationMinutes;
}

export function calculateAppointmentCheckoutLineItem(
  appointment: Pick<
    AppointmentRequest,
    "serviceNameSnapshot" | "servicePriceCentsSnapshot" | "serviceCurrencySnapshot"
  >
) {
  if (
    !appointment.serviceNameSnapshot ||
    appointment.servicePriceCentsSnapshot === null ||
    !appointment.serviceCurrencySnapshot
  ) {
    throw new Error("Appointment service pricing is not assigned.");
  }
  if (appointment.servicePriceCentsSnapshot !== 2500) {
    throw new Error("Avenseal standard notarial act must be booked at 2500 cents.");
  }
  return {
    name: appointment.serviceNameSnapshot,
    quantity: 1,
    amountCents: appointment.servicePriceCentsSnapshot,
    currency: appointment.serviceCurrencySnapshot.toLowerCase(),
    totalCents: appointment.servicePriceCentsSnapshot
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
