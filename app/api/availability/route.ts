import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Valid date is required." }, { status: 400 });
  }

  const availability = await repository.getAvailableSlots(date);
  return NextResponse.json(availability);
}
