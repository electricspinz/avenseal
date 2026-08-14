"use client";

import Link, { type LinkProps } from "next/link";
import React, { type ComponentProps } from "react";
import { ButtonLink } from "@/components/button";
import { trackScheduleAppointmentClick, type ScheduleAppointmentLocation } from "@/lib/analytics";

type TrackedLinkProps = LinkProps & Omit<ComponentProps<typeof Link>, keyof LinkProps> & Readonly<{ location: ScheduleAppointmentLocation }>;

export function TrackedScheduleAppointmentLink({ location, onClick, ...props }: TrackedLinkProps) {
  return <Link {...props} onClick={(event) => { trackScheduleAppointmentClick(location); onClick?.(event); }} />;
}

export function TrackedScheduleAppointmentButtonLink({ location, onClick, ...props }: ComponentProps<typeof ButtonLink> & Readonly<{ location: ScheduleAppointmentLocation }>) {
  return <ButtonLink {...props} onClick={(event) => { trackScheduleAppointmentClick(location); onClick?.(event); }} />;
}
