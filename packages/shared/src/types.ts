/** Normalized alert categories. aiCode alerts are grouped with code scanning; anything else is "other" with the raw type preserved. */
export const ALERT_KINDS = ["code", "dependency", "secret", "other"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const SEVERITIES = ["critical", "high", "medium", "low", "unknown"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const STATES = ["active", "dismissed", "fixed", "autoDismissed", "unknown"] as const;
export type AlertState = (typeof STATES)[number];

export type SecretValidity = "active" | "inactive" | "unknown" | "none";

/** Allowlisted alert metadata. Never contains secret values, snippets, or free-form tool messages. */
export interface NormalizedAlert {
  key: string;
  alertId: number;
  projectId: string;
  repositoryId: string;
  kind: AlertKind;
  rawType: string;
  severity: Severity;
  rawSeverity: string;
  state: AlertState;
  rawState: string;
  title: string;
  ruleId?: string;
  ruleName?: string;
  tool?: string;
  gitRef?: string;
  firstSeen?: string;
  lastSeen?: string;
  fixedDate?: string;
  introducedDate?: string;
  packageName?: string;
  packageVersion?: string;
  ecosystem?: string;
  advisoryIds?: string[];
  fixedVersion?: string;
  isDevDependency?: boolean;
  secretType?: string;
  validity?: SecretValidity;
  confidence?: string;
  dismissal?: {
    reason: string;
    actor?: string;
  };
}

export type RepoStatus = "ok" | "failed" | "disabled" | "denied" | "notFound";

export interface CoverageObservation {
  code: boolean | null;
  dependency: boolean | null;
  secret: boolean | null;
}

export interface Enablement {
  code: boolean | null;
  dependency: boolean | null;
  secret: boolean | null;
}

export interface RepoSnapshot {
  projectId: string;
  projectName: string;
  repositoryId: string;
  repositoryName: string;
  collectedAt: string;
  status: RepoStatus;
  /** True when this snapshot is older than the latest failed attempt (previous successful data kept). */
  stale?: boolean;
  lastAttemptAt?: string;
  error?: string;
  enablement?: Enablement;
  alerts: NormalizedAlert[];
}

/** Count key format: `${kind}|${severity}|${state}`. */
export type CountKey = `${AlertKind}|${Severity}|${AlertState}`;

/** One latest successful observation per repository per UTC day. */
export interface DailyObservation {
  day: string;
  projectId: string;
  repositoryId: string;
  observedAt: string;
  counts: Partial<Record<CountKey, number>>;
  coverage?: CoverageObservation;
}

export interface Filters {
  projectIds: string[];
  repositoryIds: string[];
  kinds: AlertKind[];
  severities: Severity[];
  states: AlertState[];
  periodDays: number;
  search: string;
}

export type DashboardScope = { kind: "organization" } | { kind: "project"; projectId: string };

export interface NamedCount {
  id: string;
  label: string;
  count: number;
  extra?: Record<string, string | number | undefined>;
}

export interface TrendPoint {
  day: string;
  values: Record<string, number>;
  /** Repositories observed that day vs. repositories in scope. */
  observed: number;
  expected: number;
}

export interface FreshnessInfo {
  lastCollectedAt?: string;
  totalRepos: number;
  okRepos: number;
  staleRepos: { projectName: string; repositoryName: string; repositoryId: string; collectedAt: string }[];
  failedRepos: { projectName: string; repositoryName: string; repositoryId: string; error?: string }[];
  disabledRepos: { projectName: string; repositoryName: string; repositoryId: string }[];
  partial: boolean;
}

export interface CoverageRow {
  projectId: string;
  projectName: string;
  repositoryId: string;
  repositoryName: string;
  code: boolean | null;
  dependency: boolean | null;
  secret: boolean | null;
}

export interface DashboardData {
  generatedAt: string;
  scope: DashboardScope;
  filterOptions: {
    projects: { id: string; name: string }[];
    repositories: { id: string; name: string; projectId: string }[];
  };
  kpis: {
    open: number;
    criticalHighOpen: number;
    new7d: number;
    fixed7d: number;
    newPrev7d: number;
    fixedPrev7d: number;
  };
  severity: NamedCount[];
  kinds: NamedCount[];
  /** State distribution; honors the state filter. */
  states: NamedCount[];
  freshness: FreshnessInfo;
  openTrend: TrendPoint[];
  stateTrend: TrendPoint[];
  newVsFixedWeekly: { weekStart: string; created: number; fixed: number }[];
  timeToFix: { group: string; averageDays: number; samples: number }[];
  timeToFixWeekly: { weekStart: string; values: Partial<Record<Severity, number>>; samples: Partial<Record<Severity, number>> }[];
  topProjects: NamedCount[];
  topRepositories: NamedCount[];
  heatmap: { rows: { id: string; label: string; counts: Record<Severity, number> }[]; level: "project" | "repository" };
  ageBuckets: NamedCount[];
  sla: {
    thresholdsDays: Partial<Record<Severity, number>>;
    overdue: number;
    eligible: number;
    unknownAge: number;
    bySeverity: { severity: Severity; thresholdDays: number; overdue: number; eligible: number }[];
  };
  dismissals: {
    total: number;
    reasons: NamedCount[];
    actors: NamedCount[];
  };
  oldestCritical: AlertSummary[];
  code: { topRules: NamedCount[]; tools: NamedCount[] };
  dependencies: {
    topPackages: NamedCount[];
    ecosystems: NamedCount[];
    advisories: NamedCount[];
    upgradeImpact: { packageName: string; ecosystem?: string; fixedVersion: string; alerts: number; repositories: number; critical: number; high: number }[];
    fixAvailability: { withFix: number; withoutFix: number };
    fieldsAvailable: { ecosystem: boolean; advisories: boolean; fixedVersion: boolean };
  };
  secrets: {
    leaderboard: NamedCount[];
    types: NamedCount[];
    ageBuckets: NamedCount[];
    exposedOver7Days: number;
    validity: NamedCount[] | null;
    weekly: { weekStart: string; created: number; fixed: number }[];
  };
  coverage: {
    rows: CoverageRow[];
    totals: { repos: number; code: number; dependency: number; secret: number; unknown: number };
    trend: { day: string; values: Record<string, number>; observed: number; expected: number }[];
  };
  /** Repositories whose viewer permission could not be verified (excluded from results). */
  unverifiedRepos?: number;
}

export interface AlertSummary extends NormalizedAlert {
  projectName: string;
  repositoryName: string;
  url: string;
}

export type SortField = "severity" | "firstSeen" | "lastSeen" | "title" | "repository" | "state" | "kind";

export interface AlertQuery {
  filters: Filters;
  sort: { field: SortField; direction: "asc" | "desc" };
  pageSize: number;
  cursor?: string;
}

export interface AlertPage {
  items: AlertSummary[];
  total: number;
  nextCursor?: string;
}

export interface DashboardSettings {
  backendUrl: string;
  maxHistoryDays: number;
  allowUserHistoryInAdo: boolean;
  slaDays: Partial<Record<Severity, number>>;
  digestRecipients: string[];
}

export const DEFAULT_SLA_DAYS: Partial<Record<Severity, number>> = { critical: 7, high: 30, medium: 90 };
export const DEFAULT_SETTINGS: DashboardSettings = {
  backendUrl: "",
  maxHistoryDays: 90,
  allowUserHistoryInAdo: false,
  slaDays: DEFAULT_SLA_DAYS,
  digestRecipients: [],
};

export const MIN_HISTORY_DAYS = 1;
export const MAX_HISTORY_DAYS = 365;
