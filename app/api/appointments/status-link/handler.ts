import { NextRequest, NextResponse } from "next/server";
import { consumeDistributedRateLimit, rateLimitedResponse, requestRateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";
import { repository } from "@/lib/server/repository";
import { statusLinkRequestSchema } from "@/lib/validation";

const genericMessage = "If we find a matching appointment, we will send a secure status link.";

type StatusLinkInput = { email: string; reference: string };

export type StatusLinkHandlerDependencies = Readonly<{
  requestIdentity: (request: NextRequest) => string;
  consumeRateLimit: (policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>;
  requestStatusLink: (input: StatusLinkInput) => Promise<void>;
}>;

const productionDependencies: StatusLinkHandlerDependencies = {
  requestIdentity: requestRateLimitIdentity,
  consumeRateLimit: consumeDistributedRateLimit,
  requestStatusLink: (input) => repository.requestCustomerStatusLink(input)
};

export function createStatusLinkHandler(dependencies: StatusLinkHandlerDependencies = productionDependencies) {
  return async function handleStatusLinkRequest(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const parsed = statusLinkRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: genericMessage }, { headers: { "Cache-Control": "no-store" } });

    try {
      const [ip, email] = await Promise.all([
        dependencies.consumeRateLimit("magic_link_ip", dependencies.requestIdentity(request)),
        dependencies.consumeRateLimit("magic_link_email", parsed.data.email)
      ]);
      if (!ip.allowed || !email.allowed) return rateLimitedResponse(Math.max(ip.retryAfterSeconds, email.retryAfterSeconds));
    } catch {
      return rateLimitedResponse(60);
    }

    try {
      await dependencies.requestStatusLink(parsed.data);
    } catch {
      return NextResponse.json({ message: genericMessage }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ message: genericMessage }, { headers: { "Cache-Control": "no-store" } });
  };
}
