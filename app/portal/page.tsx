import { ButtonLink } from "@/components/button";
import { PublicShell } from "@/components/public-shell";

export default function PortalEntryPage() {
  return <PublicShell><section className="mx-auto max-w-3xl px-5 py-20 text-center lg:px-8"><p className="text-sm font-semibold text-emeraldAction">Avenseal client portal</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-navy">Open your secure appointment workspace</h1><p className="mx-auto mt-5 max-w-2xl leading-7 text-slateDeep">Your appointment workspace is available through the secure link sent by Avenseal. Request a new link if you no longer have it.</p><div className="mt-8"><ButtonLink href="/appointments/status">Request secure link</ButtonLink></div></section></PublicShell>;
}
