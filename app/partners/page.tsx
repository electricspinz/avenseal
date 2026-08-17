import React from "react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/button";
import { icons } from "@/components/icons";
import { PartnerInterestForm } from "@/components/partner-interest-form";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "Professional Partner Network | Online Notary Solutions for Your Clients",
  description: "Give your clients a simple way to schedule and pay for online notary appointments through Avenseal while your team stays focused on serving them.",
  alternates: { canonical: "/partners" },
  openGraph: {
    title: "Avenseal Professional Partner Network | Online Notary Solutions for Your Clients",
    description: "Give your clients a simple way to schedule and pay for online notary appointments through Avenseal while your team stays focused on serving them.",
    url: "/partners",
    images: ["/brand/avenseal-og-social.png"]
  },
  twitter: {
    card: "summary_large_image",
    title: "Avenseal Professional Partner Network | Online Notary Solutions for Your Clients",
    description: "Give your clients a simple way to schedule and pay for online notary appointments through Avenseal while your team stays focused on serving them.",
    images: ["/brand/avenseal-og-social.png"]
  }
};

const partnerGroups = [
  {
    title: "For Your Clients",
    items: ["Convenient online scheduling", "Clear preparation instructions", "Upfront pricing", "Professional customer support"],
    Icon: icons.user
  },
  {
    title: "For Your Team",
    items: ["Less scheduling coordination", "Less payment handling", "Fewer appointment follow-ups", "One reliable service option to recommend"],
    Icon: icons.calendar
  },
  {
    title: "For Your Brand",
    items: ["A polished customer experience", "Dedicated partner booking links planned", "Co-branded and embedded options planned"],
    Icon: icons.tag
  }
] as const;

const steps = [
  ["Share Avenseal with your client", "Direct your client to Avenseal using your partner booking link or the standard Avenseal booking experience."],
  ["Your client schedules and pays", "Avenseal manages appointment intake, scheduling, pricing, payment, preparation, confirmations, and reminders."],
  ["The client continues to BlueNotary", "Identity verification, electronic signing, and the live audio-video session take place through BlueNotary."],
  ["The commissioned notary completes the notarial act", "The commissioned remote online notary determines whether the requested notarization can proceed and performs the notarial act when appropriate."],
  ["Your team stays focused on the client relationship", "Avenseal handles the appointment experience so your team does not have to manage the notarization workflow."]
] as const;

const partnerTypes = ["Estate planning and elder-law firms", "Family-law practices", "Title and real-estate professionals", "Mortgage professionals", "Financial advisors", "CPAs and accounting firms", "Insurance professionals", "Other organizations whose clients regularly need notarization"];

export default function PartnersPage() {
  return (
    <PublicShell>
      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emeraldAction">Avenseal Professional Partner Network</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight text-navy md:text-6xl">Give Your Clients an Easier Way to Access Online Notary Services</h1>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-slateDeep">Partner with Avenseal to give your clients a professional way to schedule and pay for online notary appointments, receive clear preparation instructions, and continue securely to their live remote notarization session.</p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <ButtonLink href="#partner-interest">Become an Avenseal Partner</ButtonLink>
              <ButtonLink href="/contact" variant="secondary">Talk With Us</ButtonLink>
            </div>
          </div>
          <aside className="rounded-lg border border-silver bg-mist p-8 shadow-quiet">
            <h2 className="text-2xl font-semibold text-navy">A polished path for your clients</h2>
            <p className="mt-4 leading-7 text-slateDeep">Avenseal manages appointment intake, scheduling, payment, preparation, and customer communication. Identity verification, electronic signing, and the live audio-video session take place through BlueNotary. The commissioned remote online notary performs the notarial act.</p>
          </aside>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-navy">A better client experience, without another administrative workflow.</h2>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slateDeep">Avenseal helps professional firms give clients convenient access to online notary appointments without asking staff to coordinate scheduling, collect payment, send reminders, or explain each step of the process.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {partnerGroups.map(({ title, items, Icon }) => <section key={title} className="rounded-lg border border-silver bg-white p-7"><Icon className="text-emeraldAction" size={30} aria-hidden="true" /><h3 className="mt-5 text-xl font-semibold text-navy">{title}</h3><ul className="mt-5 space-y-3 text-sm leading-6 text-slateDeep">{items.map((item) => <li key={item} className="flex gap-3"><span className="text-emeraldAction">✓</span>{item}</li>)}</ul></section>)}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <h2 className="text-4xl font-semibold text-navy">How the Partner Network works</h2>
          <ol className="mt-10 space-y-7">
            {steps.map(([title, body], index) => <li key={title} className="grid gap-4 border-l-2 border-emeraldAction pl-6 sm:grid-cols-[2.5rem_1fr]"><span className="grid h-10 w-10 place-items-center rounded-full bg-navy text-sm font-semibold text-white">{index + 1}</span><div><h3 className="text-xl font-semibold text-navy">{title}</h3><p className="mt-2 leading-7 text-slateDeep">{body}</p></div></li>)}
          </ol>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-2 lg:px-8">
          <div><h2 className="text-4xl font-semibold text-navy">Built for professionals who care about the client experience.</h2><ul className="mt-8 grid gap-3 text-sm leading-6 text-slateDeep sm:grid-cols-2">{partnerTypes.map((type) => <li key={type} className="rounded-md border border-silver bg-white p-4">{type}</li>)}</ul></div>
          <div className="rounded-lg border border-silver bg-white p-8"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-emeraldAction">A service-first network</p><h2 className="mt-3 text-3xl font-semibold text-navy">A partnership built around service, not referral fees.</h2><p className="mt-5 leading-7 text-slateDeep">The Avenseal Professional Partner Network does not pay referral commissions. The goal is to give professional organizations a dependable online notary option they can confidently share with clients.</p><p className="mt-5 text-sm font-semibold text-navy">No commission agreements. No affiliate payouts. No pressure to meet referral quotas.</p></div>
        </div>
      </section>

      <section className="bg-white py-20"><div className="mx-auto max-w-4xl px-5 lg:px-8"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-emeraldAction">Future capability</p><h2 className="mt-3 text-4xl font-semibold text-navy">Built to grow with your client experience.</h2><p className="mt-5 text-lg leading-8 text-slateDeep">As the Avenseal platform evolves, selected partners may gain access to dedicated booking links, co-branded experiences, embedded booking options, referral analytics, and additional workflow integrations.</p><p className="mt-4 text-sm font-semibold text-slateDeep">Future features are subject to availability and partner eligibility.</p></div></section>

      <section id="partner-interest" className="bg-mist py-20"><div className="mx-auto max-w-3xl px-5 lg:px-8"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-emeraldAction">Partner interest</p><h2 className="mt-3 text-4xl font-semibold text-navy">Become an Avenseal Professional Partner</h2><p className="mt-5 text-lg leading-8 text-slateDeep">We are currently inviting a small group of professional organizations to help shape the first version of the Partner Network.</p><PartnerInterestForm /></div></section>
    </PublicShell>
  );
}
