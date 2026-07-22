import { NextRequest, NextResponse } from "next/server";
import { getAdminCookieName, signAdminSession, verifyAdminCredentials } from "@/lib/server/admin-auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  if (!(await verifyAdminCredentials(email, password))) {
    return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAdminCookieName(), signAdminSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
  return response;
}
