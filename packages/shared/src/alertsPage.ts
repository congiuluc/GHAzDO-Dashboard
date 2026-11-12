import { SEVERITY_RANK } from "./aggregate.js";
import { applyScope, matchesAll } from "./filters.js";
import type { AlertSummary, DashboardScope, Filters, SortField } from "./types.js";

export const MAX_PAGE_SIZE = 200;

const SORTERS: Record<SortField, (a: AlertSummary, b: AlertSummary) => number> = {
  severity: (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  firstSeen: (a, b) => (a.firstSeen ?? "").localeCompare(b.firstSeen ?? ""),
  lastSeen: (a, b) => (a.lastSeen ?? "").localeCompare(b.lastSeen ?? ""),
  title: (a, b) => a.title.localeCompare(b.title),
  repository: (a, b) => a.projectName.localeCompare(b.projectName) || a.repositoryName.localeCompare(b.repositoryName),
  state: (a, b) => a.state.localeCompare(b.state),
  kind: (a, b) => a.kind.localeCompare(b.kind),
};

export const SORT_FIELDS = Object.keys(SORTERS) as SortField[];

export interface PageRequest {
  filters: Filters;
  scope: DashboardScope;
  sort: { field: SortField; direction: "asc" | "desc" };
  offset: number;
  pageSize: number;
}

/** Filters, searches, sorts (stable, tie-broken by key) and slices alert summaries. */
export function pageAlerts(all: AlertSummary[], req: PageRequest): { items: AlertSummary[]; total: number; nextOffset?: number } {
  const filters = applyScope(req.filters, req.scope);
  const sorter = SORTERS[req.sort.field] ?? SORTERS.severity;
  const dir = req.sort.direction === "asc" ? 1 : -1;
  const matched = all
    .filter((a) => matchesAll(a, filters, [a.projectName, a.repositoryName]))
    .sort((a, b) => dir * sorter(a, b) || a.key.localeCompare(b.key));
  const size = Math.min(Math.max(1, Math.floor(req.pageSize) || 50), MAX_PAGE_SIZE);
  const offset = Math.max(0, Math.floor(req.offset) || 0);
  const items = matched.slice(offset, offset + size);
  const next = offset + size;
  return { items, total: matched.length, nextOffset: next < matched.length ? next : undefined };
}

export function alertsToCsv(items: AlertSummary[]): string {
  const cols: (keyof AlertSummary)[] = [
    "projectName",
    "repositoryName",
    "alertId",
    "kind",
    "severity",
    "state",
    "title",
    "ruleName",
    "packageName",
    "packageVersion",
    "fixedVersion",
    "secretType",
    "gitRef",
    "firstSeen",
    "lastSeen",
    "fixedDate",
    "url",
  ];
  const esc = (v: unknown) => {
    let s = Array.isArray(v) ? v.join(" ") : v === undefined || v === null ? "" : String(v);
    // Prevent spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...items.map((a) => cols.map((c) => esc(a[c])).join(","))].join("\r\n");
}
