import { DEFAULT_SETTINGS, MAX_HISTORY_DAYS, MIN_HISTORY_DAYS, SEVERITIES, type DashboardSettings, type Severity } from "./types.js";

/** Removes trailing "/" characters in linear time (avoids a backtracking regex on untrusted input). */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
  return value.slice(0, end);
}

/** Linear-time check for a simple "local@domain.tld" address without whitespace. */
export function isEmailAddress(value: string): boolean {
  if (value.length > 254 || /\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

export type HistoryDaysResult = { ok: true; value: number } | { ok: false; error: string };

export function validateHistoryDays(input: unknown): HistoryDaysResult {
  const n = typeof input === "string" && input.trim() !== "" ? Number(input) : input;
  if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: "Max history days must be a whole number." };
  if (n < MIN_HISTORY_DAYS || n > MAX_HISTORY_DAYS) {
    return { ok: false, error: `Max history days must be between ${MIN_HISTORY_DAYS} and ${MAX_HISTORY_DAYS}.` };
  }
  return { ok: true, value: n };
}

export type BackendUrlResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Validates a backend URL. Only HTTPS origins in the build-time allowlist are accepted so a tampered shared
 * setting can never redirect viewer tokens to an arbitrary host. An empty value means "no backend".
 */
export function validateBackendUrl(input: unknown, allowedOrigins: readonly string[]): BackendUrlResult {
  if (typeof input !== "string") return { ok: false, error: "Backend URL must be text." };
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: "" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Backend URL is not a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Backend URL must use HTTPS." };
  if (url.username || url.password) return { ok: false, error: "Backend URL must not contain credentials." };
  if (url.search || url.hash) return { ok: false, error: "Backend URL must not contain a query string or fragment." };
  const allowed = allowedOrigins.map((o) => trimTrailingSlashes(o.trim().toLowerCase())).filter(Boolean);
  if (!allowed.includes(url.origin.toLowerCase())) {
    return { ok: false, error: `Backend origin ${url.origin} is not in this extension's allowed backend list.` };
  }
  return { ok: true, value: `${url.origin}${trimTrailingSlashes(url.pathname)}` };
}

/** Parses stored settings defensively; anything invalid falls back to defaults. */
export function parseSettings(raw: unknown): DashboardSettings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const days = validateHistoryDays(src.maxHistoryDays);
  const slaInput = src.slaDays && typeof src.slaDays === "object" ? (src.slaDays as Record<string, unknown>) : {};
  const slaDays: DashboardSettings["slaDays"] = { ...DEFAULT_SETTINGS.slaDays };
  for (const severity of SEVERITIES) {
    const value = slaInput[severity];
    if (value === 0 || value === null) {
      delete slaDays[severity];
      continue;
    }
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 365) slaDays[severity] = value;
  }
  const digestRecipients = Array.isArray(src.digestRecipients)
    ? src.digestRecipients.filter((v): v is string => typeof v === "string" && isEmailAddress(v)).slice(0, 20)
    : [];
  return {
    backendUrl: typeof src.backendUrl === "string" ? src.backendUrl.trim() : DEFAULT_SETTINGS.backendUrl,
    maxHistoryDays: days.ok ? days.value : DEFAULT_SETTINGS.maxHistoryDays,
    allowUserHistoryInAdo: src.allowUserHistoryInAdo === true,
    slaDays,
    digestRecipients,
  };
}

export type SlaDaysResult = { ok: true; value: Partial<Record<Severity, number>> } | { ok: false; error: string };

export function validateSlaDays(input: unknown): SlaDaysResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "SLA thresholds must be an object." };
  const source = input as Record<string, unknown>;
  const value: Partial<Record<Severity, number>> = {};
  for (const severity of SEVERITIES) {
    const days = source[severity];
    if (days === undefined || days === null || days === 0) continue;
    if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 365) {
      return { ok: false, error: `SLA for ${severity} must be 1–365 days, or 0 to disable.` };
    }
    value[severity] = days;
  }
  return { ok: true, value };
}

export type DigestRecipientsResult = { ok: true; value: string[] } | { ok: false; error: string };

export function validateDigestRecipients(input: unknown): DigestRecipientsResult {
  if (!Array.isArray(input) || input.length > 20) return { ok: false, error: "Enter no more than 20 digest recipients." };
  const recipients = input.map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""));
  if (recipients.some((v) => !isEmailAddress(v))) {
    return { ok: false, error: "Every digest recipient must be a valid email address." };
  }
  return { ok: true, value: [...new Set(recipients)] };
}
