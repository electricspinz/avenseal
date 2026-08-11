const PARTNER_CODE_STORAGE_KEY = "avenseal-partner-code";
const partnerCodePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maximumPartnerCodeLength = 64;

/**
 * Partner codes are anonymous campaign labels, never credentials or trusted
 * configuration. Keep their format deliberately small so they are safe to
 * attach to anonymous analytics events.
 */
export function normalizePartnerCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > maximumPartnerCodeLength || !partnerCodePattern.test(normalized)) return null;
  return normalized;
}

export function rememberPartnerCode(value: unknown) {
  const partnerCode = normalizePartnerCode(value);
  if (typeof window === "undefined") return partnerCode;
  if (partnerCode) window.sessionStorage.setItem(PARTNER_CODE_STORAGE_KEY, partnerCode);
  else if (typeof value === "string") window.sessionStorage.removeItem(PARTNER_CODE_STORAGE_KEY);
  return partnerCode;
}

export function currentPartnerCode() {
  if (typeof window === "undefined") return null;
  return normalizePartnerCode(window.sessionStorage.getItem(PARTNER_CODE_STORAGE_KEY));
}
