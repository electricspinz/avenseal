import { BookingFlow } from "@/components/booking-flow";
import { getDefaultOrganizationSlug } from "@/lib/server/organization";
import { repository } from "@/lib/server/repository";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BookPage() {
  const settings = await repository.getOrganizationSettings();
  const service = settings.services.find((item) => item.isActive);
  if (!service) {
    return <BookingFlow organizationSlug={getDefaultOrganizationSlug()} serviceId="" />;
  }
  return (
    <BookingFlow
      organizationSlug={getDefaultOrganizationSlug()}
      serviceId={service.id}
    />
  );
}
