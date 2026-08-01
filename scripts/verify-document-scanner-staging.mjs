const cleanPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export function validateStagingScannerEnvironment(env) {
  if (env.NODE_ENV === "production") throw new Error("production_refused");
  if (!["staging", "preview"].includes(env.VERCEL_ENV ?? env.APP_ENV ?? "")) throw new Error("staging_environment_required");
  if (env.DOCUMENT_SCANNER_STAGING_VERIFY !== "true") throw new Error("staging_confirmation_required");
  if (env.DOCUMENT_SCANNER_ENABLED !== "true" || env.DOCUMENT_SCANNER_PROVIDER !== "cloudmersive") throw new Error("scanner_configuration_required");
  if (!env.DOCUMENT_SCANNER_API_KEY || !env.DOCUMENT_SCANNER_BASE_URL?.startsWith("https://")) throw new Error("scanner_configuration_required");
  const timeoutMs = Number(env.DOCUMENT_SCANNER_TIMEOUT_MS ?? "45000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error("scanner_configuration_required");
  return { provider: "cloudmersive", baseUrl: env.DOCUMENT_SCANNER_BASE_URL, apiKey: env.DOCUMENT_SCANNER_API_KEY, timeoutMs };
}

async function invoke(config, bytes, filename, fetchImplementation) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const form = new FormData();
    form.append("inputFile", new Blob([bytes], { type: "application/pdf" }), filename);
    const response = await fetchImplementation(new URL("/virus/scan/file", config.baseUrl), { method: "POST", headers: { Apikey: config.apiKey }, body: form, signal: controller.signal });
    if (!response.ok) return { pass: false, category: response.status === 429 ? "provider_rate_limited" : response.status === 401 || response.status === 403 ? "authentication_failed" : "provider_unavailable" };
    const value = await response.json();
    if (!value || typeof value !== "object" || typeof value.CleanResult !== "boolean" || (value.FoundViruses !== undefined && !Array.isArray(value.FoundViruses))) return { pass: false, category: "invalid_response" };
    return { pass: true, clean: value.CleanResult === true };
  } catch (error) {
    return { pass: false, category: controller.signal.aborted || error?.name === "AbortError" ? "provider_timeout" : error instanceof TypeError ? "network_error" : "unexpected_error" };
  } finally { clearTimeout(timer); }
}

export async function runDocumentScannerStagingVerification({ env = process.env, args = [], fetchImplementation = globalThis.fetch } = {}) {
  const config = validateStagingScannerEnvironment(env);
  const dryRun = args.includes("--dry-run");
  if (dryRun) return { mode: "dry-run", provider: config.provider, configurationValid: true, cleanCheck: "not_run", infectedCheck: "not_run", workerCheck: "not_run", cleanupCheck: "not_run", overallPass: true };
  const clean = await invoke(config, cleanPdf, "document.pdf", fetchImplementation);
  const approved = env.DOCUMENT_SCANNER_EICAR_APPROVED === "true";
  const infected = approved ? await invoke(config, new TextEncoder().encode(eicar), "document.pdf", fetchImplementation) : { pass: true, skipped: true };
  return { mode: "adapter-only", provider: config.provider, configurationValid: true, cleanCheck: clean.pass && clean.clean === true ? "passed" : "failed", infectedCheck: approved ? infected.pass && infected.clean === false ? "passed" : "failed" : "approval_required", workerCheck: "not_run", cleanupCheck: "not_run", overallPass: clean.pass && clean.clean === true && infected.pass && (!approved || infected.clean === false), ...(clean.pass ? {} : { failureCategory: clean.category }), ...(infected.pass ? {} : { failureCategory: infected.category }) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDocumentScannerStagingVerification({ args: process.argv.slice(2) }).then((summary) => { console.log(JSON.stringify(summary)); process.exitCode = summary.overallPass ? 0 : 1; }).catch((error) => { console.log(JSON.stringify({ mode: "staging-verification", overallPass: false, failureCategory: error instanceof Error ? error.message : "unexpected_error" })); process.exitCode = 1; });
}
