import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import {
  assertGoogleEventCreated,
  assertRequiredEnvironment,
  assertStagingEnvironment,
  buildFreeBusyRequest,
  buildTemporaryEvent,
  stagingOrganizationId
} from "./google-calendar-verification-utils.mjs";

function readLocalEnv() {
  const local = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  const parsed = Object.fromEntries(
    local
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        if (index < 0) return [line, ""];
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
      })
  );
  return { ...process.env, ...parsed };
}

function loadTypescriptModule(relativePath) {
  const require = createRequire(import.meta.url);
  const Module = require("node:module");
  const originalResolveFilename = Module._resolveFilename;
  const originalTsLoader = require.extensions[".ts"];
  const projectRoot = process.cwd();

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      return originalResolveFilename.call(this, path.join(projectRoot, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  require.extensions[".ts"] = function loadTs(module, filename) {
    const source = readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Node10
      },
      fileName: filename
    });
    module._compile(output.outputText, filename);
  };

  try {
    return require(path.join(projectRoot, relativePath));
  } finally {
    Module._resolveFilename = originalResolveFilename;
    if (originalTsLoader) {
      require.extensions[".ts"] = originalTsLoader;
    } else {
      delete require.extensions[".ts"];
    }
  }
}

async function googleJson(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });
  const json = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof json?.error?.message === "string" ? json.error.message : "Google Calendar request failed.";
    throw new Error(message);
  }
  return json;
}

async function main() {
  const env = readLocalEnv();
  assertStagingEnvironment(env);
  assertRequiredEnvironment(env);
  Object.assign(process.env, env);

  const { getSupabaseAdmin } = loadTypescriptModule("lib/supabase/server.ts");
  const { getValidGoogleAccessToken } = loadTypescriptModule("lib/server/google-oauth.ts");
  const { fetchGoogleFreeBusy } = loadTypescriptModule("lib/server/google-calendar.ts");
  const supabase = getSupabaseAdmin();

  const { data: rows, error } = await supabase
    .from("google_oauth_connections")
    .select("id,status")
    .eq("organization_id", stagingOrganizationId)
    .eq("provider", "google")
    .eq("status", "connected")
    .limit(1);
  if (error) throw error;
  if (!rows?.[0]) throw new Error("Google Calendar is not connected for the staging organization.");
  console.log("Google connection found.");

  const accessToken = await getValidGoogleAccessToken(stagingOrganizationId);
  if (!accessToken) throw new Error("Google access token was not available.");
  console.log("Access token available.");

  const freeBusyRequest = buildFreeBusyRequest();
  const busy = await fetchGoogleFreeBusy({
    accessToken,
    timeMin: freeBusyRequest.timeMin,
    timeMax: freeBusyRequest.timeMax,
    timezone: freeBusyRequest.timeZone,
    calendarId: "primary"
  });
  console.log("Free/busy request succeeded.");
  console.log(`Busy periods found: ${busy.length}`);

  let eventId = null;
  try {
    const event = await googleJson("https://www.googleapis.com/calendar/v3/calendars/primary/events", accessToken, {
      method: "POST",
      body: JSON.stringify(buildTemporaryEvent())
    });
    eventId = typeof event?.id === "string" ? event.id : null;
    assertGoogleEventCreated(event);
    console.log("Test event created.");
  } finally {
    if (eventId) {
      await googleJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, accessToken, {
        method: "DELETE"
      });
      console.log("Test event deleted.");
    }
  }

  console.log("Google Calendar staging verification passed.");
}

main().catch((error) => {
  const message = error instanceof Error
    ? error.message
    : typeof error?.message === "string"
      ? error.message
      : "Google Calendar staging verification failed.";
  console.error(message);
  process.exit(1);
});
