import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";
import { organizationSettingsSchema } from "@/lib/validation";

export async function GET() {
  const settings = await repository.getOrganizationSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const parsed = organizationSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  }
  const settings = await repository.updateOrganizationSettings(parsed.data);
  return NextResponse.json({ settings });
}
