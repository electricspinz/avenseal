import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { parseDocumentScannerConfiguration } from "@/lib/server/document-security/scanner";
import { processDocumentScanBatch } from "@/lib/server/document-security/scan-jobs";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";

function authorized(request: NextRequest) {
  const secret = getServerEnv().DOCUMENT_SCAN_WORKER_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !token) return false;
  return timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(token).digest());
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (!authorized(request) || !hasSupabaseServiceConfig()) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    // Do not claim quarantined work when scanner configuration is disabled or invalid.
    parseDocumentScannerConfiguration();
    const batchSize = Math.min(Math.max(Number(request.nextUrl.searchParams.get("batchSize")) || getServerEnv().DOCUMENT_SCAN_WORKER_BATCH_SIZE, 1), 20);
    return NextResponse.json({ result: await processDocumentScanBatch(getSupabaseAdmin(), { batchSize }) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Document scan processing is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
