import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";
import { adminUpdateSchema } from "@/lib/validation";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const parsed = adminUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
  }
  const appointment = await repository.updateAppointment(id, parsed.data);
  if (!appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  return NextResponse.json({ appointment });
}

