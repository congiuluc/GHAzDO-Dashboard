import { DEFAULT_SETTINGS, MAX_HISTORY_DAYS, MIN_HISTORY_DAYS, type DashboardSettings } from "./types.js";

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
  const allowed = allowedOrigins.map((o) => o.trim().toLowerCase().replace(/\/+$/, "")).filter(Boolean);
  if (!allowed.includes(url.origin.toLowerCase())) {
    return { ok: false, error: `Backend origin ${url.origin} is not in this extension's allowed backend list.` };
  }
  return { ok: true, value: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
}

/** Parses stored settings defensively; anything invalid falls back to defaults. */
export function parseSettings(raw: unknown): DashboardSettings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const days = validateHistoryDays(src.maxHistoryDays);
  return {
    backendUrl: typeof src.backendUrl === "string" ? src.backendUrl.trim() : DEFAULT_SETTINGS.backendUrl,
    maxHistoryDays: days.ok ? days.value : DEFAULT_SETTINGS.maxHistoryDays,
    allowUserHistoryInAdo: src.allowUserHistoryInAdo === true,
  };
}
