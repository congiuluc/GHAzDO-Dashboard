import {
  ALERT_KINDS,
  MAX_HISTORY_DAYS,
  SEVERITIES,
  STATES,
  type AlertKind,
  type AlertState,
  type DashboardScope,
  type Filters,
  type NormalizedAlert,
  type Severity,
} from "./types.js";

export const DEFAULT_FILTERS: Filters = {
  projectIds: [],
  repositoryIds: [],
  kinds: [],
  severities: [],
  states: [],
  periodDays: 30,
  search: "",
};

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function pickList<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v)))];
}

function pickIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v): v is string => typeof v === "string" && ID_RE.test(v)))].slice(0, 500);
}

/** Validates untrusted filter input (URL, request body). Invalid entries are dropped, never trusted. */
export function sanitizeFilters(input: unknown, maxDays = MAX_HISTORY_DAYS): Filters {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const period = Number(src.periodDays);
  return {
    projectIds: pickIds(src.projectIds),
    repositoryIds: pickIds(src.repositoryIds),
    kinds: pickList<AlertKind>(src.kinds, ALERT_KINDS),
    severities: pickList<Severity>(src.severities, SEVERITIES),
    states: pickList<AlertState>(src.states, STATES),
    periodDays: Number.isFinite(period) ? Math.min(Math.max(Math.round(period), 1), maxDays) : Math.min(DEFAULT_FILTERS.periodDays, maxDays),
    search: typeof src.search === "string" ? src.search.slice(0, 200) : "",
  };
}

/** Forces project scope: a project dashboard can only ever see its own project. */
export function applyScope(filters: Filters, scope: DashboardScope): Filters {
  if (scope.kind === "project") return { ...filters, projectIds: [scope.projectId] };
  return filters;
}

export function matchesLocation(a: { projectId: string; repositoryId: string }, f: Filters): boolean {
  if (f.projectIds.length && !f.projectIds.includes(a.projectId)) return false;
  if (f.repositoryIds.length && !f.repositoryIds.includes(a.repositoryId)) return false;
  return true;
}

/** Location + kind + severity filter; state is applied separately where relevant. */
export function matchesDimensions(a: NormalizedAlert, f: Filters): boolean {
  if (!matchesLocation(a, f)) return false;
  if (f.kinds.length && !f.kinds.includes(a.kind)) return false;
  if (f.severities.length && !f.severities.includes(a.severity)) return false;
  return true;
}

export function matchesSearch(a: NormalizedAlert, search: string, extra: string[] = []): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [a.title, a.ruleName, a.ruleId, a.packageName, a.secretType, a.tool, String(a.alertId), ...(a.advisoryIds ?? []), ...extra]
    .some((v) => v?.toLowerCase().includes(q));
}

export function matchesAll(a: NormalizedAlert, f: Filters, extra: string[] = []): boolean {
  return matchesDimensions(a, f) && (!f.states.length || f.states.includes(a.state)) && matchesSearch(a, f.search, extra);
}

const LIST_KEYS = ["projectIds", "repositoryIds", "kinds", "severities", "states"] as const;
const URL_NAMES: Record<(typeof LIST_KEYS)[number], string> = {
  projectIds: "project",
  repositoryIds: "repo",
  kinds: "type",
  severities: "severity",
  states: "state",
};

export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const k of LIST_KEYS) if (f[k].length) p.set(URL_NAMES[k], f[k].join(","));
  if (f.periodDays !== DEFAULT_FILTERS.periodDays) p.set("days", String(f.periodDays));
  if (f.search) p.set("q", f.search);
  return p.toString();
}

export function filtersFromQuery(query: string, maxDays = MAX_HISTORY_DAYS): Filters {
  const p = new URLSearchParams(query);
  const raw: Record<string, unknown> = {};
  for (const k of LIST_KEYS) {
    const v = p.get(URL_NAMES[k]);
    raw[k] = v ? v.split(",").filter(Boolean) : [];
  }
  raw.periodDays = p.get("days") ?? DEFAULT_FILTERS.periodDays;
  raw.search = p.get("q") ?? "";
  return sanitizeFilters(raw, maxDays);
}

/** Stable hash of filters for binding pagination cursors to a query. */
export function filtersFingerprint(f: Filters): string {
  const norm = { ...f };
  for (const k of LIST_KEYS) (norm[k] as string[]) = [...f[k]].sort();
  return JSON.stringify(norm);
}
