import { BookingFlow } from "@/components/booking-flow";
import { getDefaultOrganizationSlug } from "@/lib/server/organization";
import { repository } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

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
