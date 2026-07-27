import type { AppointmentRequest, OrganizationSettings } from "@/lib/types";

export type AttentionItem = {
  id: "email-reminders" | "confirmations" | "concierge" | "services" | "availability";
  title: string;
  description: string;
  href: string;
};

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hour${hours === 1 ? "" : "s"} ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
}

export function deriveAttentionItems(settings: OrganizationSettings): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (!settings.communications.emailRemindersEnabled) {
    items.push({
      id: "email-reminders",
      title: "Appointment reminders are disabled.",
      description: "New appointments will not receive 24-hour, 2-hour, or follow-up emails.",
      href: "/admin/settings"
    });
  }
  if (!settings.communications.confirmationMessagingEnabled) {
    items.push({
      id: "confirmations",
      title: "Booking confirmations are disabled.",
      description: "Customers will not receive confirmation emails after submitting a booking request.",
      href: "/admin/settings"
    });
  }
  if (!settings.concierge.conciergeEnabled) {
    items.push({
      id: "concierge",
      title: "AI concierge is disabled.",
      description: "Customers will not receive automated booking assistance.",
      href: "/admin/settings"
    });
  }
  if (!settings.services.some((service) => service.isActive)) {
    items.push({
      id: "services",
      title: "No active services are configured.",
      description: "Customers cannot select an appointment service when they book.",
      href: "/admin/settings"
    });
  }
  if (settings.intervals.length === 0) {
    items.push({
      id: "availability",
      title: "No availability intervals are configured.",
      description: "Customers cannot find an available appointment time.",
      href: "/admin/settings"
    });
  }
  return items;
}

export function getUpcomingAppointments(appointments: AppointmentRequest[], now = new Date()) {
  const nowTimestamp = now.getTime();
  return appointments
    .filter((appointment) => new Date(`${appointment.preferredDate}T${appointment.preferredTime}:00`).getTime() >= nowTimestamp)
    .sort((left, right) => {
      const leftTimestamp = new Date(`${left.preferredDate}T${left.preferredTime}:00`).getTime();
      const rightTimestamp = new Date(`${right.preferredDate}T${right.preferredTime}:00`).getTime();
      return leftTimestamp - rightTimestamp;
    })
    .slice(0, 5);
}
