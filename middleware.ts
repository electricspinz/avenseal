import { NextRequest, NextResponse } from "next/server";
import { hasTrustedAdminMutationOrigin } from "@/lib/server/trusted-origin";

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
  if (!await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(payload))) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { issuedAt?: unknown; expiresAt?: unknown };
    const now = Date.now();
    return Number.isSafeInteger(parsed.issuedAt) && Number.isSafeInteger(parsed.expiresAt)
      && (parsed.issuedAt as number) <= now + 5 * 60 * 1000
      && (parsed.expiresAt as number) > now
      && (parsed.expiresAt as number) > (parsed.issuedAt as number);
  } catch { return false; }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/appointments/access/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isAdminApi = pathname.startsWith("/api/admin") && pathname !== "/api/admin/login";
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  if (isAdminApi && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !hasTrustedAdminMutationOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

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
