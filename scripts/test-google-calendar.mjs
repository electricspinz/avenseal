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
  buildStagingAppointmentSchedule,
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

async function main() {
  const env = readLocalEnv();
  assertStagingEnvironment(env);
  assertRequiredEnvironment(env);
  Object.assign(process.env, env);

  const { getSupabaseAdmin } = loadTypescriptModule("lib/supabase/server.ts");
  const { getValidGoogleAccessToken } = loadTypescriptModule("lib/server/google-oauth.ts");
  const {
    deleteGoogleCalendarEvent,
    fetchGoogleCalendarEvent,
    fetchGoogleFreeBusy
  } = loadTypescriptModule("lib/server/google-calendar.ts");
  const { synchronizeAppointmentCalendar } = loadTypescriptModule("lib/server/google-calendar-sync.ts");
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

  const marker = `LIVE_GOOGLE_CALENDAR_SYNC_${Date.now()}`;
  const schedule = buildStagingAppointmentSchedule();
  let customerId = null;
  let appointmentId = null;
  let eventId = null;
  let eventCalendarId = "primary";
  let eventDeleted = false;
  try {
    const { data: services, error: serviceError } = await supabase
      .from("organization_services")
      .select("id")
      .eq("organization_id", stagingOrganizationId)
      .eq("is_active", true)
      .eq("delivery_type", "remote")
      .order("display_order")
      .limit(1);
    if (serviceError) throw serviceError;
    if (!services?.[0]) throw new Error("The staging organization has no active remote service.");

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        organization_id: stagingOrganizationId,
        full_name: marker,
        email: `${marker.toLowerCase()}@example.invalid`,
        mobile_phone: "000-000-0000"
      })
      .select("id")
      .single();
    if (customerError) throw customerError;
    customerId = customer.id;

    const { data: appointment, error: appointmentError } = await supabase
      .from("appointment_requests")
      .insert({
        organization_id: stagingOrganizationId,
        customer_id: customerId,
        service_id: services[0].id,
        status: "confirmed",
        document_category: "business_document",
        document_count: 1,
        signer_count: 1,
        estimated_notarizations: 1,
        notarizations_not_sure: false,
        has_witness_lines: false,
        witnesses_available: false,
        signer_location: "Florida",
        all_signers_have_government_id: true,
        preferred_date: schedule.date,
        preferred_time: schedule.initialTime,
        urgency: "not_urgent",
        administrative_notes: marker
      })
      .select("id")
      .single();
    if (appointmentError) throw appointmentError;
    appointmentId = appointment.id;
    console.log("Synthetic appointment created.");

    const created = await synchronizeAppointmentCalendar({
      organizationId: stagingOrganizationId,
      appointmentId
    });
    if (!["created", "updated"].includes(created.status) || !created.mapping?.providerEventId) {
      throw new Error("Appointment event creation did not complete.");
    }
    eventId = created.mapping.providerEventId;
    eventCalendarId = created.mapping.calendarId;
    const { data: persistedMapping, error: mappingError } = await supabase
      .from("calendar_event_mappings")
      .select("provider_event_id,status,meet_url")
      .eq("organization_id", stagingOrganizationId)
      .eq("appointment_request_id", appointmentId)
      .single();
    if (mappingError) throw mappingError;
    if (
      persistedMapping.provider_event_id !== eventId ||
      !["created", "updated"].includes(persistedMapping.status) ||
      typeof persistedMapping.meet_url !== "string" ||
      persistedMapping.meet_url.length === 0
    ) {
      throw new Error("The persisted Calendar mapping is incomplete.");
    }
    console.log("Calendar mapping and Meet URL stored.");
    const googleEvent = await fetchGoogleCalendarEvent({
      accessToken,
      calendarId: eventCalendarId,
      eventId
    });
    assertGoogleEventCreated(googleEvent);
    console.log("Appointment event created and verified.");

    const { error: updateError } = await supabase
      .from("appointment_requests")
      .update({ preferred_time: schedule.updatedTime })
      .eq("organization_id", stagingOrganizationId)
      .eq("id", appointmentId);
    if (updateError) throw updateError;
    const updated = await synchronizeAppointmentCalendar({
      organizationId: stagingOrganizationId,
      appointmentId
    });
    if (updated.status !== "updated") throw new Error("Appointment event update did not complete.");
    const updatedEvent = await fetchGoogleCalendarEvent({
      accessToken,
      calendarId: updated.mapping?.calendarId ?? "primary",
      eventId
    });
    assertGoogleEventCreated(updatedEvent);
    if (
      !updatedEvent?.startAt ||
      !updated.mapping?.startsAt ||
      Date.parse(updatedEvent.startAt) !== Date.parse(updated.mapping.startsAt)
    ) {
      throw new Error("Google Calendar event time did not update.");
    }
    console.log("Appointment event updated and verified.");

    const { error: cancelError } = await supabase
      .from("appointment_requests")
      .update({ status: "cancelled" })
      .eq("organization_id", stagingOrganizationId)
      .eq("id", appointmentId);
    if (cancelError) throw cancelError;
    const cancelled = await synchronizeAppointmentCalendar({
      organizationId: stagingOrganizationId,
      appointmentId
    });
    if (cancelled.status !== "cancelled") throw new Error("Appointment event cancellation did not complete.");
    const deletedEvent = await fetchGoogleCalendarEvent({
      accessToken,
      calendarId: cancelled.mapping?.calendarId ?? "primary",
      eventId
    });
    if (deletedEvent !== null && deletedEvent.status !== "cancelled") {
      throw new Error("Cancelled Google Calendar event still exists.");
    }
    eventDeleted = true;
    console.log("Appointment event deleted and verified.");
  } finally {
    const cleanupErrors = [];
    if (eventId && !eventDeleted) {
      try {
        await deleteGoogleCalendarEvent({
          accessToken,
          calendarId: eventCalendarId,
          eventId
        });
        console.log("Google Calendar event cleanup completed.");
      } catch {
        cleanupErrors.push("calendar event");
      }
    }
    if (appointmentId) {
      const { error: appointmentCleanupError } = await supabase
        .from("appointment_requests")
        .delete()
        .eq("id", appointmentId);
      if (appointmentCleanupError) cleanupErrors.push("appointment");
    }
    if (customerId) {
      const { error: customerCleanupError } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerId);
      if (customerCleanupError) cleanupErrors.push("customer");
    }
    if (cleanupErrors.length > 0) {
      throw new Error("One or more synthetic staging fixtures could not be removed.");
    }
    console.log("Synthetic appointment fixtures removed.");
  }

  console.log("Google Calendar appointment synchronization verification passed.");
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
