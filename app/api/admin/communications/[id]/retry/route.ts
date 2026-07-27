import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { requireAdminOrganizationContext } from "@/lib/server/admin-context";
import { repository } from "@/lib/server/repository";

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(getServerEnv().NEXT_PUBLIC_SITE_URL).origin;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { id } = await params;
    const context = await requireAdminOrganizationContext();
    await repository.retryFailedCommunication(id, context.organizationId);
    return NextResponse.redirect(new URL("/admin/communications", getServerEnv().NEXT_PUBLIC_SITE_URL), 303);
  } catch {
    return NextResponse.json({ error: "Communication retry is unavailable." }, { status: 403 });
  }
}
