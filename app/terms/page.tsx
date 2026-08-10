import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "Terms of Service | Avenseal",
  description: "Avenseal's Terms of Service.",
  alternates: { canonical: "/terms" }
};

const effectiveDate = "August 9, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-10"><h2 className="text-2xl font-semibold tracking-tight text-navy">{title}</h2><div className="mt-4 space-y-4 leading-7 text-slateDeep">{children}</div></section>;
}

export default function TermsPage() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <h1 className="text-4xl font-semibold tracking-tight text-navy sm:text-5xl">Terms of Service</h1>
        <p className="mt-5 text-sm leading-6 text-slateDeep">Effective Date: {effectiveDate}<br />Last Updated: {effectiveDate}</p>

        <Section title="1. Agreement to These Terms">
          <p>These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between you and Avenseal LLC, doing business as Avenseal (&ldquo;Avenseal,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). They govern your use of avenseal.com, our booking and customer interfaces, appointment communications, and related services (collectively, the &ldquo;Services&rdquo;). By using the Services, requesting an appointment, or indicating acceptance during booking, you agree to these Terms and our <a className="focus-ring rounded underline" href="/privacy">Privacy Policy</a>.</p>
          <p>If you do not agree, do not use the Services or submit an appointment request.</p>
        </Section>

        <Section title="2. Eligibility">
          <p>You must be at least 18 years old and legally capable of entering into this agreement to use the Services as a self-service customer. An adult may arrange a notarization involving a minor where legally permissible. The commissioned notary retains authority to determine participation, identity, and legal requirements for any notarial act.</p>
        </Section>

        <Section title="3. Avenseal's Role">
          <p>Avenseal provides the customer-facing experience for discovering services, requesting or scheduling appointments, providing appointment-related information, making applicable payments, receiving appointment communications, and accessing applicable customer-facing workflow features.</p>
          <p>Avenseal is not a law firm, does not provide legal advice, and does not host the identity-verification or remote video notarization environment. A commissioned notary performs the notarial act. An independent online notarization provider may perform identity verification and host the remote session. No attorney-client relationship is created through the Services.</p>
        </Section>

        <Section title="4. Notarial Independence and Document Eligibility">
          <p>The commissioned notary exercises independent legal and professional judgment. Avenseal cannot require a notary to perform an unlawful, improper, or incomplete notarization. A notary may refuse, postpone, or discontinue a transaction when required by law, professional obligations, provider requirements, or the circumstances presented.</p>
          <p>Not every document can be notarized remotely, and requirements may vary by document, jurisdiction, receiving institution, and transaction. You are responsible for determining whether your document is appropriate for notarization and, where appropriate, whether the intended recipient will accept a remote or electronic notarization. Notarization does not guarantee a document&apos;s validity, enforceability, legal effect, recording, or acceptance by a government office, financial institution, or other recipient. Consult a qualified attorney for legal advice.</p>
        </Section>

        <Section title="5. Appointment Requests, Responsibilities, and Preparation">
          <p>A request for an appointment is not a guarantee of availability or confirmation. Appointment status, payment requirements, and next steps are communicated through the Services and applicable appointment communications.</p>
          <p>You must provide accurate, complete, and current information; have any identification, technology, internet connection, and environment required for the appointment; follow lawful instructions from the provider and commissioned notary; and ensure you are authorized to present materials and arrange the requested service. You must not impersonate another person, provide materially false information, improperly alter a document, interfere with the Services, or attempt to circumvent identity-verification, payment, access, or security controls.</p>
        </Section>

        <Section title="6. Identity Verification, Remote Sessions, and Third Parties">
          <p>Completion of a notarization may require identity verification and participation in a provider-hosted remote audiovisual session. If you cannot satisfy applicable identity, credential, technology, provider, notary, document, or legal requirements, the notarization may not proceed.</p>
          <p>Third-party services, including payment processors, online notarization providers, communications providers, hosting and infrastructure providers, and calendar services when used, may be governed by separate terms and privacy practices. Avenseal is not responsible for an independent third party&apos;s acts, omissions, availability, policies, or content, except to the extent responsibility cannot be disclaimed under applicable law.</p>
        </Section>

        <Section title="7. Electronic Communications, Signatures, and Records">
          <p>You agree that Avenseal may provide appointment-related communications electronically, including by email and through token-protected customer features. You are responsible for maintaining an email address and device capable of receiving those communications. Electronic signatures, records, and communications may be used to the extent permitted by applicable law and the requirements of the commissioned notary or online notarization provider.</p>
        </Section>

        <Section title="8. Fees, Payment, Taxes, Cancellation, and Refunds">
          <p>Prices and applicable fees are presented during booking or checkout. Payments may be processed by a third-party payment processor. You authorize us and the processor to charge the disclosed amount using your selected payment method. You are responsible for taxes, if any, that are legally applicable and disclosed in connection with your transaction.</p>
          <ul className="list-disc space-y-2 pl-6">
            <li><strong>Cancellation at least 24 hours before a confirmed appointment:</strong> full refund.</li>
            <li><strong>Cancellation within 24 hours:</strong> one courtesy reschedule; no cash refund.</li>
            <li><strong>No-show:</strong> nonrefundable.</li>
            <li><strong>Identity-verification failure before notarization:</strong> one reschedule or refund at Avenseal&apos;s discretion, depending on third-party or provider fees incurred.</li>
            <li><strong>Technical failure attributable to Avenseal, the notary, or the provider that prevents completion:</strong> reschedule or full refund.</li>
            <li><strong>Notary refusal:</strong> refund of the notarization fee unless the inability to proceed resulted from materially inaccurate customer information, prohibited conduct, or failure to satisfy disclosed requirements.</li>
            <li><strong>Completed notarization:</strong> nonrefundable except for a billing error.</li>
          </ul>
          <p>Approved refunds are returned to the original payment method and initiated promptly. Posting or settlement time depends on the payment processor and financial institution and is outside Avenseal&apos;s control.</p>
        </Section>

        <Section title="9. Acceptable Use and Customer Materials">
          <p>You may use the Services only for lawful purposes. You must not engage in fraud, unlawful conduct, impersonation, false identity information, infringement, malicious code, unauthorized access, abusive conduct, or attempts to interfere with or bypass the Services or their security controls.</p>
          <p>You retain ownership of your materials. You grant Avenseal a limited, non-exclusive right to process, store, transmit, and use materials you provide solely to deliver, secure, support, and improve the Services; comply with law; and resolve disputes. You represent that you have the necessary rights and permissions to provide those materials.</p>
        </Section>

        <Section title="10. Intellectual Property">
          <p>The Services, including Avenseal&apos;s name, branding, website, software, designs, text, and other proprietary materials, are owned by Avenseal or its licensors and are protected by applicable law. Except for the limited right to use the Services under these Terms, no rights are granted to you.</p>
        </Section>

        <Section title="11. Availability, Changes, Suspension, and Termination">
          <p>We may modify, maintain, suspend, or discontinue all or part of the Services, including for maintenance, security, provider interruption, legal requirements, or circumstances outside our reasonable control. We may suspend or terminate access when reasonably necessary to address fraud, abuse, illegal activity, security threats, or a material violation of these Terms, subject to applicable law.</p>
          <p>We will not intentionally use a service change to avoid obligations for a paid or confirmed transaction where applicable law requires a different result.</p>
        </Section>

        <Section title="12. Disclaimers">
          <p>THE SERVICES ARE PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS. TO THE FULLEST EXTENT PERMITTED BY LAW, AVENSEAL DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. We do not warrant uninterrupted, error-free, secure, or available Services; a successful notarization; or acceptance of any document. This section does not limit any warranty that cannot lawfully be excluded.</p>
        </Section>

        <Section title="13. Limitation of Liability">
          <p>TO THE EXTENT PERMITTED BY LAW, AVENSEAL LLC&apos;S AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THE SERVICES OR THESE TERMS WILL NOT EXCEED THE GREATER OF: (A) THE AMOUNT YOU PAID TO AVENSEAL FOR THE TRANSACTION GIVING RISE TO THE CLAIM; OR (B) $100.</p>
          <p>TO THE EXTENT PERMITTED BY LAW, AVENSEAL WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS INTERRUPTION, EVEN IF ADVISED OF THE POSSIBILITY. These limitations apply only to the extent permitted by applicable law and do not exclude liability that cannot legally be limited or excluded.</p>
        </Section>

        <Section title="14. Indemnification">
          <p>To the extent permitted by law, you will defend, indemnify, and hold harmless Avenseal and its officers, directors, employees, and agents from third-party claims, damages, liabilities, costs, and reasonable expenses arising from your fraud, unlawful conduct, materially false information, infringement of another&apos;s rights, misuse of the Services, or material violation of these Terms. This obligation applies only to the extent the claim results from those matters.</p>
        </Section>

        <Section title="15. Governing Law and Disputes">
          <p>Florida law governs these Terms and any dispute arising from them, without regard to conflict-of-law principles. Before filing a legal claim, the parties will make a good-faith effort to resolve the dispute informally by contacting appointments@avenseal.com with a description of the issue. Nothing in this section requires arbitration or waives any right that cannot lawfully be waived. Any legal proceeding may be brought only in a court with jurisdiction, subject to applicable law.</p>
        </Section>

        <Section title="16. General Terms">
          <p>If any provision of these Terms is unenforceable, the remaining provisions remain in effect. A waiver is effective only if in writing and does not waive later rights. You may not assign these Terms without our written consent; we may assign them in connection with a merger, financing, acquisition, reorganization, or sale of assets, subject to applicable law. These Terms and the Privacy Policy are the entire agreement between you and Avenseal regarding the Services.</p>
          <p>We may update these Terms from time to time by posting the revised version and updating the Last Updated date. Changes apply when posted unless applicable law requires otherwise.</p>
        </Section>

        <Section title="17. Contact Us">
          <p>Avenseal LLC, doing business as Avenseal<br />Website: https://avenseal.com<br />Email: appointments@avenseal.com<br />Telephone: (727) 433-8565</p>
        </Section>
      </article>
    </PublicShell>
  );
}
