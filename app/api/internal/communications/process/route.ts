import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { processCommunicationBatch } from "@/lib/server/communications";
import { getSupabaseAdmin, hasSupabaseServiceConfig } from "@/lib/supabase/server";

function authorized(request: NextRequest) {
  const secret = getServerEnv().COMMUNICATION_PROCESSOR_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!authorized(request) || !hasSupabaseServiceConfig()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const env = getServerEnv();
    const result = await processCommunicationBatch(getSupabaseAdmin(), {
      batchSize: env.COMMUNICATION_PROCESSOR_BATCH_SIZE,
      processingTimeoutMinutes: env.COMMUNICATION_PROCESSING_TIMEOUT_MINUTES
    });
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: "Communication processing is unavailable." }, { status: 503 });
  }
}
