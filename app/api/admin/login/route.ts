import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { authenticateAdminCredentials, getAdminCookieName, signAdminSession } from "@/lib/server/admin-auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  const admin = await authenticateAdminCredentials(email, password);
  if (!admin) {
    return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAdminCookieName(), signAdminSession(admin.email, admin.userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: getServerEnv().NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
  return response;
}
