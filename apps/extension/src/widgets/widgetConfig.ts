import { ALERT_KINDS, DEFAULT_FILTERS, sanitizeFilters, type AlertKind, type Filters } from "@ghazdo/shared";

export const WIDGET_KINDS = ["kpi", "severity", "top-repos", "secrets", "sla", "mttr", "age", "burn-down", "heatmap", "coverage"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

export const WIDGET_TITLES: Record<WidgetKind, string> = {
  kpi: "Advanced Security summary",
  severity: "Open alerts by severity",
  "top-repos": "Top repositories by risk",
  secrets: "Exposed secrets",
  sla: "Overdue remediation SLAs",
  mttr: "Mean time to fix",
  age: "Open alert age",
  "burn-down": "New vs fixed alerts",
  heatmap: "Advanced Security severity heatmap",
  coverage: "Advanced Security scanner coverage",
};

export interface WidgetConfig {
  /** "project": only the dashboard's project. "organization": everything the viewer can see. */
  scope: "project" | "organization";
  repositoryIds: string[];
  kinds: AlertKind[];
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = { scope: "project", repositoryIds: [], kinds: [] };

/** The contribution id ends with the widget kind, e.g. "publisher.ext.ghazdo-widget-top-repos". */
export function widgetKindFromContribution(id: string): WidgetKind {
  return WIDGET_KINDS.find((k) => id === k || id.endsWith(`ghazdo-widget-${k}`)) ?? "kpi";
}

export function parseWidgetConfig(data: string | undefined | null): WidgetConfig {
  let raw: Record<string, unknown> = {};
  try {
    raw = data ? (JSON.parse(data) as Record<string, unknown>) : {};
  } catch {
    raw = {};
  }
  const f = sanitizeFilters({ repositoryIds: raw.repositoryIds, kinds: raw.kinds });
  return { scope: raw.scope === "organization" ? "organization" : "project", repositoryIds: f.repositoryIds, kinds: f.kinds.filter((k) => (ALERT_KINDS as readonly string[]).includes(k)) };
}

export function widgetFilters(config: WidgetConfig, kind: WidgetKind): Filters {
  return { ...DEFAULT_FILTERS, repositoryIds: config.repositoryIds, kinds: kind === "secrets" ? ["secret"] : config.kinds };
}
