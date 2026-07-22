import Link from "next/link";
import { Brand } from "@/components/brand";
import { ButtonLink } from "@/components/button";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-silver/70 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm font-semibold text-navy md:flex" aria-label="Primary navigation">
          <Link className="focus-ring rounded-md" href="/how-it-works">How It Works</Link>
          <Link className="focus-ring rounded-md" href="/pricing">Pricing</Link>
          <Link className="focus-ring rounded-md" href="/faq">FAQ</Link>
          <ButtonLink href="/book" className="px-5">Schedule Appointment</ButtonLink>
        </nav>
        <ButtonLink href="/book" className="md:hidden">Schedule</ButtonLink>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Brand dark />
          <p className="mt-5 max-w-xs text-sm leading-6 text-white/72">
            Avenseal provides remote online notary appointment support for Florida customers.
          </p>
        </div>
        <FooterGroup title="Company" links={[["How It Works", "/how-it-works"], ["Pricing", "/pricing"], ["FAQ", "/faq"], ["Schedule Appointment", "/book"]]} />
        <FooterGroup title="Support" links={[["Check Appointment Status", "/appointments/status"], ["Contact Us", "/contact"]]} />
        <FooterGroup title="Legal" links={[["Privacy Policy", "/privacy"], ["Terms", "/terms"]]} />
      </div>
      <div className="mx-auto max-w-7xl border-t border-white/12 px-5 py-5 text-xs text-white/58 lg:px-8">
        © 2026 Avenseal. Privacy and terms content is pending legal review.
      </div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm text-white/72">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link className="focus-ring rounded-md hover:text-white" href={href}>{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main>{children}</main>
      <PublicFooter />
    </>
  );
}
