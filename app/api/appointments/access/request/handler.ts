import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeClientWorkspaceEmail } from "@/lib/server/client-workspace-magic-links";
import { consumeDistributedRateLimit, rateLimitedResponse, requestRateLimitIdentity, type RateLimitPolicy, type RateLimitResult } from "@/lib/server/distributed-rate-limit";
import { repository } from "@/lib/server/repository";

const message = "If we found an appointment matching that email address, we sent a secure link.";
const schema = z.object({ email: z.string().trim().email().max(180) });

export type ClientAccessRequestHandlerDependencies = Readonly<{
  requestIdentity: (request: NextRequest) => string;
  consumeRateLimit: (policy: RateLimitPolicy, identity: string) => Promise<RateLimitResult>;
  requestClientWorkspaceLink: (email: string) => Promise<void>;
}>;

const productionDependencies: ClientAccessRequestHandlerDependencies = {
  requestIdentity: requestRateLimitIdentity,
  consumeRateLimit: consumeDistributedRateLimit,
  requestClientWorkspaceLink: (email) => repository.requestClientWorkspaceLink(email)
};

export function createClientAccessRequestHandler(dependencies: ClientAccessRequestHandlerDependencies = productionDependencies) {
  return async function handleClientAccessRequest(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });

    try {
      const [ipRate, emailRate] = await Promise.all([
        dependencies.consumeRateLimit("client_workspace_access_ip", dependencies.requestIdentity(request)),
        dependencies.consumeRateLimit("client_workspace_access_email", normalizeClientWorkspaceEmail(parsed.data.email))
      ]);
      if (!ipRate.allowed || !emailRate.allowed) return rateLimitedResponse(Math.max(ipRate.retryAfterSeconds, emailRate.retryAfterSeconds));
    } catch {
      return rateLimitedResponse(60);
    }

    await dependencies.requestClientWorkspaceLink(parsed.data.email).catch(() => undefined);
    return NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });
  };
}
