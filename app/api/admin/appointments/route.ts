import { NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";

export async function GET() {
  const appointments = await repository.listAppointments();
  return NextResponse.json({ appointments });
}

