import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Avenseal",
  description: "Avenseal's Privacy Policy.",
  alternates: { canonical: "/privacy" }
};

const effectiveDate = "August 9, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-10"><h2 className="text-2xl font-semibold tracking-tight text-navy">{title}</h2><div className="mt-4 space-y-4 leading-7 text-slateDeep">{children}</div></section>;
}

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <h1 className="text-4xl font-semibold tracking-tight text-navy sm:text-5xl">Privacy Policy</h1>
        <p className="mt-5 text-sm leading-6 text-slateDeep">Effective Date: {effectiveDate}<br />Last Updated: {effectiveDate}</p>

        <Section title="1. Introduction and Scope">
          <p>Avenseal LLC, doing business as Avenseal (&ldquo;Avenseal,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), provides customer-facing appointment, payment, preparation, communication, and customer-workspace services for Remote Online Notary appointments. This Privacy Policy explains how we collect, use, disclose, and otherwise process personal information through avenseal.com, our booking and customer interfaces, appointment communications, and related services (collectively, the &ldquo;Services&rdquo;).</p>
          <p>This Policy does not govern the independent practices of an online notarization provider, payment processor, or other third party that processes information under its own terms or privacy notice.</p>
        </Section>

        <Section title="2. Information We Collect">
          <p><strong>Information you provide.</strong> We collect information you provide when you request or schedule an appointment, contact us, make a payment, use a Client Workspace, upload appointment-related materials, or communicate with us. This may include your name, email address, telephone number, appointment preferences and information, document-related information, messages or administrative notes, consent records, and other information in submitted forms.</p>
          <p><strong>Appointment and transaction information.</strong> We maintain information needed to coordinate appointments, including requested date and time, service selection, appointment status, payment status, and communications associated with an appointment.</p>
          <p><strong>Information collected automatically.</strong> Our systems may process IP address and request information for security and rate-limiting, browser and device information made available with web requests, timestamps, access and operational logs, and use of token-protected customer features. We use this information to operate, secure, troubleshoot, and improve the Services.</p>
        </Section>

        <Section title="3. Documents and Uploaded Materials">
          <p>Where available, the Client Workspace allows customers to upload appointment-related documents or materials. We process uploaded files and related metadata to provide document-preparation and review workflows, protect our systems, and support the appointment. Our systems may use private storage and security controls such as quarantine or scanning where configured.</p>
          <p>Do not upload information that is not needed for your appointment. Avenseal&apos;s customer workspace is not a public document archive, and Avenseal does not represent that it retains completed notarized documents. We do not promise that any security measure will prevent every risk.</p>
        </Section>

        <Section title="4. Payments">
          <p>Payments may be processed through Stripe Checkout or another disclosed payment processor. Payment-card information is submitted directly to the payment processor&apos;s checkout environment; Avenseal does not represent that it stores full payment-card numbers. We receive and retain payment-related information necessary to administer the transaction, such as payment status, amount, currency, and processor references.</p>
        </Section>

        <Section title="5. Identity Verification and Remote Notarization Providers">
          <p>Avenseal does not host the identity-verification or remote audiovisual notarization environment. Identity verification, credential analysis, knowledge-based authentication where required, remote audiovisual sessions, provider-required identity information, and provider records may be processed by the independent online notarization provider and the commissioned notary under their own terms, privacy practices, and legal obligations.</p>
          <p>Avenseal does not control an independent provider&apos;s privacy practices. Your ability to complete a notarization may depend on satisfying provider, notary, document, and legal requirements.</p>
        </Section>

        <Section title="6. How We Use Information">
          <p>We use personal information to provide and improve the Services; schedule and coordinate appointments; process applicable payments; communicate with customers; provide Client Workspace and document workflows; maintain security, prevent fraud and misuse, troubleshoot issues, and enforce our agreements; comply with legal obligations; and establish, exercise, or defend legal claims.</p>
        </Section>

        <Section title="7. How We Share Information">
          <p>We may share personal information with service providers that support our Services, including hosting, database, storage, communications, payment, security, and infrastructure providers. We may share information with an online notarization provider and commissioned notary as needed to coordinate an appointment and related provider-hosted session, and with calendar providers when calendar functionality is used for an appointment.</p>
          <p>We may also disclose information to professional advisers, insurers, government authorities, regulators, law enforcement, courts, or other parties when we believe disclosure is required or appropriate by law, legal process, or to protect rights, safety, security, or the integrity of the Services. We may disclose information in connection with a merger, financing, acquisition, reorganization, sale of assets, or similar transaction, subject to applicable law.</p>
        </Section>

        <Section title="8. Cookies, Local Storage, and Analytics">
          <p>The public booking experience may use browser local storage to preserve an in-progress booking draft on the device. Necessary cookies may be used for authenticated administrative functions. We do not state that we use advertising cookies or third-party analytics services unless we identify them in an updated version of this Policy.</p>
        </Section>

        <Section title="9. Data Retention and Security">
          <p>We retain personal information for as long as reasonably necessary to provide the Services, maintain business and transaction records, comply with legal obligations, resolve disputes, enforce agreements, and protect the security and integrity of the Services. Retention may vary by the information involved, the purpose of processing, and applicable legal requirements.</p>
          <p>We use reasonable administrative, technical, and organizational safeguards designed to protect personal information. No method of transmission, storage, or processing is completely secure, and we cannot guarantee absolute security.</p>
        </Section>

        <Section title="10. Privacy Rights and Florida Residents">
          <p>Depending on where you live and applicable law, you may have rights to request access to, correction of, deletion of, or information about personal information we process. To submit a privacy request, contact us using the information below. We may need to verify your request before responding, and we will apply any rights that are legally applicable to us.</p>
          <p>Florida residents may contact us with privacy questions or requests. This Policy does not state that Avenseal is subject to every comprehensive state privacy law or threshold; we will respond as required by applicable law.</p>
        </Section>

        <Section title="11. International Users and Children's Privacy">
          <p>Avenseal is based in Florida, United States. If you use the Services from outside the United States, your information may be processed in the United States and other locations where our service providers operate, subject to applicable law.</p>
          <p>The Services are not directed to children under 18 for self-service contracting. An adult may arrange a notarization involving a minor where legally permissible. We do not knowingly collect personal information directly from a child in violation of applicable law.</p>
        </Section>

        <Section title="12. Third-Party Services and Changes to This Policy">
          <p>Third-party websites and services have their own terms and privacy practices. We encourage you to review them before providing information directly to a third party. We may update this Policy from time to time. If we do, we will post the updated Policy here and revise the Last Updated date. Changes take effect when posted unless applicable law requires otherwise.</p>
        </Section>

        <Section title="13. Contact Us">
          <p>Avenseal LLC, doing business as Avenseal<br />Website: https://avenseal.com<br />Email: appointments@avenseal.com<br />Telephone: (727) 433-8565</p>
        </Section>
      </article>
    </PublicShell>
  );
}
