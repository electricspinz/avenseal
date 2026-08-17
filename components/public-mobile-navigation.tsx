"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/button";

const links = [
  ["Home", "/"],
  ["How It Works", "/how-it-works"],
  ["Pricing", "/pricing"],
  ["FAQ", "/faq"],
  ["About", "/about"],
  ["Contact", "/contact"]
] as const;

export function PublicMobileNavigation() {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-navy/55 px-4 text-sm font-semibold text-navy hover:bg-mist"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        Menu
      </button>
      {open ? (
        <nav id={menuId} aria-label="Mobile navigation" className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-64 rounded-lg border border-silver bg-white p-3 shadow-quiet">
          <ul className="space-y-1">
            {links.map(([label, href]) => (
              <li key={href}>
                <Link className="focus-ring block rounded-md px-4 py-3 text-sm font-semibold text-navy hover:bg-mist" href={href} onClick={() => setOpen(false)}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <ButtonLink href="/book" className="mt-3 w-full" onClick={() => setOpen(false)}>
            Request Appointment
          </ButtonLink>
        </nav>
      ) : null}
    </div>
  );
}
