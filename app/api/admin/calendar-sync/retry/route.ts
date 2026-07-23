import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { repository } from "@/lib/server/repository";

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(getServerEnv().NEXT_PUBLIC_SITE_URL).origin;
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const context = await requireAdminOrganizationContext();
    const result = await repository.retryCalendarSyncs(context.organizationId);
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: "Calendar synchronization retry is unavailable." }, { status: 403 });
  }
}
