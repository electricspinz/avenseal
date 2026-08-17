import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { parseDocumentScannerConfiguration } from "@/lib/server/document-security/scanner";
import { processDocumentScanBatch } from "@/lib/server/document-security/scan-jobs";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";

type DocumentScanWorkerAuthDiagnostic = "worker_secret_missing" | "worker_secret_mismatch" | "supabase_service_config_missing";

function authorizationDiagnostic(request: NextRequest): DocumentScanWorkerAuthDiagnostic | null {
  const env = getServerEnv();
  const secret = env.DOCUMENT_SCAN_WORKER_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret) return "worker_secret_missing";
  if (!token || !timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(token).digest())) return "worker_secret_mismatch";
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return "supabase_service_config_missing";
  return null;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  // TEMPORARY: remove after the production worker-authentication reproduction is classified.
  const diagnostic = authorizationDiagnostic(request);
  if (diagnostic || !hasSupabaseServiceConfig()) {
    console.warn("[document-scan-worker]", { category: diagnostic ?? "supabase_service_config_missing" });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    // Do not claim quarantined work when scanner configuration is disabled or invalid.
    parseDocumentScannerConfiguration();
    const batchSize = Math.min(Math.max(Number(request.nextUrl.searchParams.get("batchSize")) || getServerEnv().DOCUMENT_SCAN_WORKER_BATCH_SIZE, 1), 20);
    return NextResponse.json({ result: await processDocumentScanBatch(getSupabaseAdmin(), { batchSize }) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Document scan processing is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
