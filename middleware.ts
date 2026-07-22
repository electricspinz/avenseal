import { NextRequest, NextResponse } from "next/server";

const cookieName = "avenseal_admin_session";

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function verifyAdminSession(token?: string) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const configuredSecret = process.env.ADMIN_SESSION_SECRET;
  if ((!configuredSecret || configuredSecret.length < 32) && process.env.NODE_ENV === "production") {
    throw new Error("Invalid environment configuration: ADMIN_SESSION_SECRET must be set to a strong server-side secret in production.");
  }
  const secret = configuredSecret ?? "development-only-admin-session-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(payload));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isAdminApi = pathname.startsWith("/api/admin") && pathname !== "/api/admin/login";
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  const isAuthed = await verifyAdminSession(request.cookies.get(cookieName)?.value);
  if (isAuthed) return NextResponse.next();

  if (isAdminApi) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
