import { NextRequest, NextResponse } from "next/server";
import { sendEmailIfConfigured, type EmailDeliveryResult } from "@/lib/server/email";
import { consumeDistributedRateLimit, rateLimitedResponse, requestRateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";
import { repository } from "@/lib/server/repository";
import { partnerInterestSchema, type PartnerInterestInput } from "@/lib/validation";

const successMessage = "Thank you. We’ll review your information and follow up about the Avenseal Professional Partner Network.";
const unavailableMessage = "We couldn’t submit your request right now. Please try again.";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function renderPartnerInterest(input: PartnerInterestInput) {
  const lines = [
    ["Name", `${input.firstName} ${input.lastName}`],
    ["Organization", input.organization],
    ["Work email", input.workEmail],
    ["Phone", input.phone],
    ["Industry", input.industry],
    ["Website", input.website],
    ["Message", input.message]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return `<h1>Avenseal Professional Partner Network interest</h1><dl>${lines.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
}

export type PartnerInterestHandlerDependencies = Readonly<{
  requestIdentity: (request: NextRequest) => string;
  consumeRateLimit: (policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>;
  getRecipient: () => Promise<string>;
  deliver: (input: { to: string; subject: string; html: string }) => Promise<EmailDeliveryResult>;
}>;

const productionDependencies: PartnerInterestHandlerDependencies = {
  requestIdentity: requestRateLimitIdentity,
  consumeRateLimit: consumeDistributedRateLimit,
  getRecipient: async () => (await repository.getOrganizationSettings()).business.supportEmail,
  deliver: sendEmailIfConfigured
};

export function createPartnerInterestHandler(dependencies: PartnerInterestHandlerDependencies = productionDependencies) {
  return async function handlePartnerInterest(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const parsed = partnerInterestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? unavailableMessage }, { status: 400, headers: { "Cache-Control": "no-store" } });

    try {
      const [ipRate, emailRate] = await Promise.all([
        dependencies.consumeRateLimit("partner_interest_ip", dependencies.requestIdentity(request)),
        dependencies.consumeRateLimit("partner_interest_email", parsed.data.workEmail)
      ]);
      if (!ipRate.allowed || !emailRate.allowed) return rateLimitedResponse(Math.max(ipRate.retryAfterSeconds, emailRate.retryAfterSeconds));
    } catch {
      return rateLimitedResponse(60);
    }

    try {
      const recipient = await dependencies.getRecipient();
      const delivery = await dependencies.deliver({
        to: recipient,
        subject: "Avenseal Professional Partner Network interest",
        html: renderPartnerInterest(parsed.data)
      });
      if (delivery.status !== "sent") return NextResponse.json({ error: unavailableMessage }, { status: 503, headers: { "Cache-Control": "no-store" } });
      return NextResponse.json({ message: successMessage }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: unavailableMessage }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  };
}
