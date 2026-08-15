"use client";

import Link, { type LinkProps } from "next/link";
import React, { type ComponentProps } from "react";
import { ButtonLink } from "@/components/button";
import {
  trackMarketingCtaClick,
  trackScheduleAppointmentClick,
  type MarketingCtaLocation,
  type MarketingCtaName,
  type ScheduleAppointmentLocation
} from "@/lib/analytics";

type TrackedLinkProps = LinkProps & Omit<ComponentProps<typeof Link>, keyof LinkProps> & Readonly<{ location: ScheduleAppointmentLocation }>;

export function TrackedScheduleAppointmentLink({ location, onClick, ...props }: TrackedLinkProps) {
  return <Link {...props} onClick={(event) => { trackScheduleAppointmentClick(location); onClick?.(event); }} />;
}

export function TrackedScheduleAppointmentButtonLink({ location, onClick, ...props }: ComponentProps<typeof ButtonLink> & Readonly<{ location: ScheduleAppointmentLocation }>) {
  return <ButtonLink {...props} onClick={(event) => { trackScheduleAppointmentClick(location); onClick?.(event); }} />;
}

type TrackedMarketingLinkProps = LinkProps & Omit<ComponentProps<typeof Link>, keyof LinkProps> & Readonly<{
  cta: MarketingCtaName;
  location: MarketingCtaLocation;
}>;

export function TrackedMarketingLink({ cta, location, onClick, ...props }: TrackedMarketingLinkProps) {
  return <Link {...props} onClick={(event) => { trackMarketingCtaClick(cta, location); onClick?.(event); }} />;
}
