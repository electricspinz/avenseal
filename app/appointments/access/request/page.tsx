import { ClientWorkspaceLinkRequestForm } from "@/components/client-workspace-link-request-form";
import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function ClientWorkspaceRequestPage() { return <PublicShell><section className="mx-auto max-w-3xl px-5 py-20 lg:px-8"><h1 className="text-4xl font-semibold tracking-tight text-navy">Request a New Link</h1><p className="mt-5 leading-7 text-slateDeep">Enter the email used for booking. If a matching appointment is eligible, we’ll send a secure link.</p><ClientWorkspaceLinkRequestForm /></section></PublicShell>; }
