import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { repository } from "@/lib/server/repository";
import { normalizeClientWorkspaceEmail } from "@/lib/server/client-workspace-magic-links";
import { z } from "zod";

const message = "If we found an appointment matching that email address, we sent a secure link.";
const schema = z.object({ email: z.string().trim().email().max(180) });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  const emailKey = parsed.success ? hash(normalizeClientWorkspaceEmail(parsed.data.email)) : "invalid";
  const ipRate = checkRateLimit(`workspace-request-ip:${hash(ip)}`, { max: 10, windowMs: 15 * 60_000 });
  const emailRate = checkRateLimit(`workspace-request-email:${emailKey}`, { max: 3, windowMs: 15 * 60_000 });
  if (ipRate.allowed && emailRate.allowed && parsed.success) await repository.requestClientWorkspaceLink(parsed.data.email).catch(() => undefined);
  return NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });
}
