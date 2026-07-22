import { NextResponse } from "next/server";
import { repository } from "@/lib/server/repository";

export async function GET() {
  const customers = await repository.listCustomers();
  return NextResponse.json({ customers });
}

