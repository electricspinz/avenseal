import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { repository } from "@/lib/server/repository";
import { statusLinkRequestSchema } from "@/lib/validation";

const genericMessage = "If we find a matching appointment, we will send a secure status link.";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rate = checkRateLimit(`status-link:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json({ message: genericMessage }, { status: 200 });
  }

  const body = await request.json().catch(() => null);
  const parsed = statusLinkRequestSchema.safeParse(body);
  if (parsed.success) {
    try {
      await repository.requestCustomerStatusLink(parsed.data);
    } catch {
      return NextResponse.json({ message: genericMessage });
    }
  }

  return NextResponse.json({ message: genericMessage });
}
