import { applyScope, matchesDimensions, matchesLocation, matchesSearch } from "./filters.js";
import { lastNDays, parseCountKey, utcDay } from "./retention.js";
import {
  ALERT_KINDS,
  SEVERITIES,
  STATES,
  type AlertSummary,
  type CoverageRow,
  type DailyObservation,
  type DashboardData,
  type DashboardScope,
  type Filters,
  type FreshnessInfo,
  type NamedCount,
  type NormalizedAlert,
  type RepoSnapshot,
  type Severity,
} from "./types.js";
import { DEFAULT_SLA_DAYS } from "./types.js";

const DAY_MS = 86_400_000;
export const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 10, high: 5, medium: 2, low: 1, unknown: 1 };
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
const TOP_N = 10;

export interface AggregateInput {
  organization: string;
  snapshots: RepoSnapshot[];
  observations: DailyObservation[];
  filters: Filters;
  scope: DashboardScope;
  slaDays?: Partial<Record<Severity, number>>;
  now?: Date;
}

export function alertUrl(organization: string, projectId: string, repositoryId: string, alertId: number): string {
  return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(projectId)}/_git/${encodeURIComponent(repositoryId)}/alerts/${alertId}`;
}

/** Snapshots that contribute alert data: successful ones (including stale-but-kept data). */
function hasData(s: RepoSnapshot): boolean {
  return s.status === "ok";
}

export function toSummaries(organization: string, snapshots: RepoSnapshot[]): AlertSummary[] {
  const out: AlertSummary[] = [];
  for (const s of snapshots) {
    if (!hasData(s)) continue;
    for (const a of s.alerts) {
      out.push({ ...a, projectName: s.projectName, repositoryName: s.repositoryName, url: alertUrl(organization, s.projectId, s.repositoryId, a.alertId) });
    }
  }
  return out;
}

function countBy<T>(items: T[], key: (t: T) => string | undefined, label?: (id: string, sample: T) => string): NamedCount[] {
  const map = new Map<string, { count: number; sample: T }>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    const e = map.get(k);
    if (e) e.count++;
    else map.set(k, { count: 1, sample: it });
  }
  return [...map.entries()]
    .map(([id, { count, sample }]) => ({ id, label: label ? label(id, sample) : id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function daysBetween(fromIso: string | undefined, to: Date): number | undefined {
  if (!fromIso) return undefined;
  return Math.floor((to.getTime() - Date.parse(fromIso)) / DAY_MS);
}

const AGE_BUCKETS = [
  { id: "0-7", label: "0–7 days", max: 7 },
  { id: "8-30", label: "8–30 days", max: 30 },
  { id: "31-90", label: "31–90 days", max: 90 },
  { id: "90+", label: "Over 90 days", max: Infinity },
];

function ageBuckets(alerts: NormalizedAlert[], now: Date): NamedCount[] {
  const counts = AGE_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: 0 }));
  for (const a of alerts) {
    const age = daysBetween(a.firstSeen, now);
    if (age === undefined) continue;
    const idx = AGE_BUCKETS.findIndex((b) => age <= b.max);
    counts[idx === -1 ? counts.length - 1 : idx]!.count++;
  }
  return counts;
}

/** Monday (UTC) of the week containing the date. */
export function weekStart(date: Date | string): string {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7;
  return utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY_MS);
}

function weekly(alerts: NormalizedAlert[], periodDays: number, now: Date): { weekStart: string; created: number; fixed: number }[] {
  const firstWeek = weekStart(new Date(now.getTime() - (periodDays - 1) * DAY_MS));
  const lastWeek = weekStart(now);
  const weeks: { weekStart: string; created: number; fixed: number }[] = [];
  for (let t = Date.parse(firstWeek); t <= Date.parse(lastWeek); t += 7 * DAY_MS) weeks.push({ weekStart: utcDay(t), created: 0, fixed: 0 });
  const index = new Map(weeks.map((w, i) => [w.weekStart, i]));
  for (const a of alerts) {
    if (a.firstSeen) {
      const i = index.get(weekStart(a.firstSeen));
      if (i !== undefined) weeks[i]!.created++;
    }
    if (a.fixedDate && a.state === "fixed") {
      const i = index.get(weekStart(a.fixedDate));
      if (i !== undefined) weeks[i]!.fixed++;
    }
  }
  return weeks;
}

function inWindow(iso: string | undefined, now: Date, fromDaysAgo: number, toDaysAgo: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t > now.getTime() - fromDaysAgo * DAY_MS && t <= now.getTime() - toDaysAgo * DAY_MS;
}

function score(alerts: NormalizedAlert[]): number {
  return alerts.reduce((s, a) => s + SEVERITY_WEIGHT[a.severity], 0);
}

function emptySeverityCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
}

export function aggregate(input: AggregateInput): DashboardData {
  const now = input.now ?? new Date();
  const filters = applyScope(input.filters, input.scope);
  const scope = input.scope;
  const scopedSnapshots = scope.kind === "project" ? input.snapshots.filter((s) => s.projectId === scope.projectId) : input.snapshots;

  const projectNames = new Map<string, string>();
  const repoInfo = new Map<string, { name: string; projectId: string }>();
  for (const s of scopedSnapshots) {
    projectNames.set(s.projectId, s.projectName);
    repoInfo.set(s.repositoryId, { name: s.repositoryName, projectId: s.projectId });
  }
  const filterOptions = {
    projects: [...projectNames].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    repositories: [...repoInfo]
      .filter(([, r]) => !filters.projectIds.length || filters.projectIds.includes(r.projectId))
      .map(([id, r]) => ({ id, name: r.name, projectId: r.projectId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  const inScope = scopedSnapshots.filter((s) => matchesLocation(s, filters));
  const extraSearch = (a: NormalizedAlert) => [projectNames.get(a.projectId) ?? "", repoInfo.get(a.repositoryId)?.name ?? ""];
  const all = inScope.filter(hasData).flatMap((s) => s.alerts).filter((a) => matchesDimensions(a, filters) && matchesSearch(a, filters.search, extraSearch(a)));
  const open = all.filter((a) => a.state === "active");
  const stateFiltered = filters.states.length ? all.filter((a) => filters.states.includes(a.state)) : all;

  const projectLabel = (id: string) => projectNames.get(id) ?? id;
  const repoLabel = (id: string) => repoInfo.get(id)?.name ?? id;

  // Freshness
  const freshness: FreshnessInfo = { totalRepos: inScope.length, okRepos: 0, staleRepos: [], failedRepos: [], disabledRepos: [], partial: false };
  for (const s of inScope) {
    if (s.status === "ok") {
      freshness.okRepos++;
      if (!freshness.lastCollectedAt || s.collectedAt > freshness.lastCollectedAt) freshness.lastCollectedAt = s.collectedAt;
      if (s.stale) freshness.staleRepos.push({ projectName: s.projectName, repositoryName: s.repositoryName, repositoryId: s.repositoryId, collectedAt: s.collectedAt });
    } else if (s.status === "disabled") {
      freshness.disabledRepos.push({ projectName: s.projectName, repositoryName: s.repositoryName, repositoryId: s.repositoryId });
    } else {
      freshness.failedRepos.push({ projectName: s.projectName, repositoryName: s.repositoryName, repositoryId: s.repositoryId, error: s.error ?? s.status });
    }
  }
  freshness.partial = freshness.failedRepos.length > 0 || freshness.staleRepos.length > 0;

  // Trends from daily observations (kind/severity/location filters apply; gaps are kept explicit).
  const days = lastNDays(filters.periodDays, now);
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const expected = inScope.filter((s) => s.status === "ok").length;
  const openTrend = days.map((day) => ({ day, values: {} as Record<string, number>, observed: 0, expected }));
  const stateTrend = days.map((day) => ({ day, values: {} as Record<string, number>, observed: 0, expected }));
  const inScopeRepoIds = new Set(inScope.map((s) => s.repositoryId));
  for (const o of input.observations) {
    const i = dayIndex.get(o.day);
    if (i === undefined || !inScopeRepoIds.has(o.repositoryId)) continue;
    openTrend[i]!.observed++;
    stateTrend[i]!.observed++;
    for (const [k, n] of Object.entries(o.counts)) {
      if (!n) continue;
      const { kind, severity, state } = parseCountKey(k);
      if (filters.kinds.length && !filters.kinds.includes(kind)) continue;
      if (filters.severities.length && !filters.severities.includes(severity)) continue;
      if (state === "active") openTrend[i]!.values[severity] = (openTrend[i]!.values[severity] ?? 0) + n;
      if (!filters.states.length || filters.states.includes(state)) stateTrend[i]!.values[state] = (stateTrend[i]!.values[state] ?? 0) + n;
    }
  }

  // Time to fix (fixed in period), grouped by kind and severity.
  const fixedInPeriod = all.filter((a) => a.state === "fixed" && a.fixedDate && a.firstSeen && inWindow(a.fixedDate, now, filters.periodDays, 0));
  const ttf = new Map<string, { total: number; n: number }>();
  const firstWeek = weekStart(new Date(now.getTime() - (filters.periodDays - 1) * DAY_MS));
  const lastWeek = weekStart(now);
  const fixWeeks: { weekStart: string; totals: Partial<Record<Severity, number>>; samples: Partial<Record<Severity, number>> }[] = [];
  for (let t = Date.parse(firstWeek); t <= Date.parse(lastWeek); t += 7 * DAY_MS) {
    fixWeeks.push({ weekStart: utcDay(t), totals: {}, samples: {} });
  }
  const fixWeekIndex = new Map(fixWeeks.map((w, i) => [w.weekStart, i]));
  for (const a of fixedInPeriod) {
    const d = Math.max(0, (Date.parse(a.fixedDate!) - Date.parse(a.firstSeen!)) / DAY_MS);
    for (const g of [`kind:${a.kind}`, `severity:${a.severity}`]) {
      const e = ttf.get(g) ?? { total: 0, n: 0 };
      e.total += d;
      e.n++;
      ttf.set(g, e);
    }
    const week = fixWeekIndex.get(weekStart(a.fixedDate!));
    if (week !== undefined) {
      const point = fixWeeks[week]!;
      point.totals[a.severity] = (point.totals[a.severity] ?? 0) + d;
      point.samples[a.severity] = (point.samples[a.severity] ?? 0) + 1;
    }
  }
  const timeToFix = [...ttf].map(([group, e]) => ({ group, averageDays: Math.round((e.total / e.n) * 10) / 10, samples: e.n }));
  const timeToFixWeekly = fixWeeks.map((w) => ({
    weekStart: w.weekStart,
    values: Object.fromEntries(Object.entries(w.totals).map(([severity, total]) => [
      severity,
      Math.round((total! / (w.samples[severity as Severity] ?? 1)) * 10) / 10,
    ])) as Partial<Record<Severity, number>>,
    samples: w.samples,
  }));

  const thresholdsDays = input.slaDays ?? DEFAULT_SLA_DAYS;
  const slaBySeverity = SEVERITIES.flatMap((severity) => {
    const thresholdDays = thresholdsDays[severity];
    if (!thresholdDays || thresholdDays < 1) return [];
    const severityOpen = open.filter((a) => a.severity === severity);
    const knownAge = severityOpen.filter((a) => a.firstSeen && daysBetween(a.firstSeen, now) !== undefined);
    return [{
      severity,
      thresholdDays,
      overdue: knownAge.filter((a) => (daysBetween(a.firstSeen, now) ?? 0) > thresholdDays).length,
      eligible: knownAge.length,
    }];
  });
  const dismissed = all.filter((a) => a.state === "dismissed");
  const dismissalReasonLabels: Record<string, string> = {
    fixed: "Fixed",
    acceptedrisk: "Accepted risk",
    falsepositive: "False positive",
    agreedtoguidance: "Agreed to guidance",
    toolupgrade: "Tool upgraded",
    notdistributed: "Not distributed",
    unknown: "Not reported",
  };
  const dismissalReasons = countBy(dismissed, (a) => a.dismissal?.reason ?? "unknown", (id) => dismissalReasonLabels[id] ?? "Not reported");
  const dismissalActors = countBy(dismissed, (a) => a.dismissal?.actor ?? "unknown", (id) => id === "unknown" ? "Not reported" : id);

  // Leaderboards
  const groupScore = (key: (a: NormalizedAlert) => string, label: (id: string) => string, extra?: (id: string) => Record<string, string>) => {
    const groups = new Map<string, NormalizedAlert[]>();
    for (const a of open) groups.set(key(a), [...(groups.get(key(a)) ?? []), a]);
    return [...groups]
      .map(([id, list]) => {
        const sev = emptySeverityCounts();
        list.forEach((a) => sev[a.severity]++);
        return { id, label: label(id), count: list.length, extra: { score: score(list), ...sev, ...(extra?.(id) ?? {}) } };
      })
      .sort((a, b) => b.extra.score - a.extra.score || b.count - a.count || a.label.localeCompare(b.label));
  };
  const topProjects = groupScore((a) => a.projectId, projectLabel).slice(0, TOP_N);
  const topRepositories = groupScore((a) => a.repositoryId, repoLabel, (id) => ({
    projectId: repoInfo.get(id)?.projectId ?? "",
    projectName: projectLabel(repoInfo.get(id)?.projectId ?? ""),
  })).slice(0, TOP_N);

  // Heatmap: projects at organization level, repositories once a single project is selected.
  const level: "project" | "repository" = filters.projectIds.length === 1 ? "repository" : "project";
  const heatRows = new Map<string, Record<Severity, number>>();
  const heatSource = level === "project" ? inScope.map((s) => s.projectId) : inScope.map((s) => s.repositoryId);
  heatSource.forEach((id) => heatRows.set(id, heatRows.get(id) ?? emptySeverityCounts()));
  for (const a of open) heatRows.get(level === "project" ? a.projectId : a.repositoryId)![a.severity]++;
  const heatmap = {
    level,
    rows: [...heatRows]
      .map(([id, counts]) => ({ id, label: level === "project" ? projectLabel(id) : repoLabel(id), counts }))
      .sort((a, b) => SEVERITIES.reduce((s, k) => s + b.counts[k] * SEVERITY_WEIGHT[k], 0) - SEVERITIES.reduce((s, k) => s + a.counts[k] * SEVERITY_WEIGHT[k], 0) || a.label.localeCompare(b.label)),
  };

  const summaries = (list: NormalizedAlert[]): AlertSummary[] =>
    list.map((a) => ({
      ...a,
      projectName: projectLabel(a.projectId),
      repositoryName: repoLabel(a.repositoryId),
      url: alertUrl(input.organization, a.projectId, a.repositoryId, a.alertId),
    }));
  const oldestCritical = summaries(
    open
      .filter((a) => a.severity === "critical" || a.severity === "high")
      .sort((a, b) => (a.firstSeen ?? "9999").localeCompare(b.firstSeen ?? "9999") || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
      .slice(0, TOP_N),
  );

  const openCode = open.filter((a) => a.kind === "code");
  const openDeps = open.filter((a) => a.kind === "dependency");
  const openSecrets = open.filter((a) => a.kind === "secret");
  const allSecrets = all.filter((a) => a.kind === "secret");
  const upgradeGroups = new Map<string, { packageName: string; ecosystem?: string; fixedVersion: string; alerts: NormalizedAlert[] }>();
  for (const a of openDeps) {
    if (!a.packageName || !a.fixedVersion) continue;
    const key = `${a.ecosystem ?? ""}\u0000${a.packageName}\u0000${a.fixedVersion}`;
    const group = upgradeGroups.get(key) ?? { packageName: a.packageName, ecosystem: a.ecosystem, fixedVersion: a.fixedVersion, alerts: [] };
    group.alerts.push(a);
    upgradeGroups.set(key, group);
  }
  const upgradeImpact = [...upgradeGroups.values()]
    .map((group) => ({
      packageName: group.packageName,
      ecosystem: group.ecosystem,
      fixedVersion: group.fixedVersion,
      alerts: group.alerts.length,
      repositories: new Set(group.alerts.map((a) => a.repositoryId)).size,
      critical: group.alerts.filter((a) => a.severity === "critical").length,
      high: group.alerts.filter((a) => a.severity === "high").length,
    }))
    .sort((a, b) => b.repositories - a.repositories || b.alerts - a.alerts || a.packageName.localeCompare(b.packageName))
    .slice(0, TOP_N);
  const hasValidity = openSecrets.some((a) => a.validity && a.validity !== "none");

  const coverageRows: CoverageRow[] = inScope.map((s) => ({
    projectId: s.projectId,
    projectName: s.projectName,
    repositoryId: s.repositoryId,
    repositoryName: s.repositoryName,
    code: s.enablement?.code ?? null,
    dependency: s.enablement?.dependency ?? null,
    secret: s.enablement?.secret ?? null,
  }));
  const coverageTrend = days.map((day) => ({ day, values: {} as Record<string, number>, observed: 0, expected: inScope.length }));
  for (const observation of input.observations) {
    const idx = dayIndex.get(observation.day);
    if (idx === undefined || !inScopeRepoIds.has(observation.repositoryId) || !observation.coverage) continue;
    const point = coverageTrend[idx]!;
    point.observed++;
    for (const scanner of ["code", "dependency", "secret"] as const) {
      if (observation.coverage[scanner] === true) point.values[scanner] = (point.values[scanner] ?? 0) + 1;
    }
  }

  return {
    generatedAt: now.toISOString(),
    scope: input.scope,
    filterOptions,
    kpis: {
      open: open.length,
      criticalHighOpen: open.filter((a) => a.severity === "critical" || a.severity === "high").length,
      new7d: all.filter((a) => inWindow(a.firstSeen, now, 7, 0)).length,
      fixed7d: all.filter((a) => a.state === "fixed" && inWindow(a.fixedDate, now, 7, 0)).length,
      newPrev7d: all.filter((a) => inWindow(a.firstSeen, now, 14, 7)).length,
      fixedPrev7d: all.filter((a) => a.state === "fixed" && inWindow(a.fixedDate, now, 14, 7)).length,
    },
    severity: SEVERITIES.map((s) => ({ id: s, label: s, count: open.filter((a) => a.severity === s).length })),
    kinds: ALERT_KINDS.map((k) => ({ id: k, label: k, count: open.filter((a) => a.kind === k).length })),
    states: STATES.map((s) => ({ id: s, label: s, count: stateFiltered.filter((a) => a.state === s).length })),
    freshness,
    openTrend,
    stateTrend,
    newVsFixedWeekly: weekly(all, filters.periodDays, now),
    timeToFix,
    timeToFixWeekly,
    topProjects,
    topRepositories,
    heatmap,
    ageBuckets: ageBuckets(open, now),
    sla: {
      thresholdsDays,
      overdue: slaBySeverity.reduce((sum, s) => sum + s.overdue, 0),
      eligible: slaBySeverity.reduce((sum, s) => sum + s.eligible, 0),
      unknownAge: open.filter((a) => thresholdsDays[a.severity] && !a.firstSeen).length,
      bySeverity: slaBySeverity,
    },
    dismissals: { total: dismissed.length, reasons: dismissalReasons, actors: dismissalActors },
    oldestCritical,
    code: {
      topRules: countBy(openCode, (a) => a.ruleId ?? a.ruleName ?? a.title, (_id, a) => a.ruleName ?? a.ruleId ?? a.title).slice(0, TOP_N),
      tools: countBy(openCode, (a) => a.tool ?? "Unknown tool"),
    },
    dependencies: {
      topPackages: countBy(openDeps, (a) => a.packageName ?? "Unknown package", (id, a) => (a.ecosystem ? `${id} (${a.ecosystem})` : id))
        .slice(0, TOP_N)
        .map((p) => {
          const list = openDeps.filter((a) => (a.packageName ?? "Unknown package") === p.id);
          return {
            ...p,
            extra: {
              repositories: new Set(list.map((a) => a.repositoryId)).size,
              critical: list.filter((a) => a.severity === "critical").length,
              high: list.filter((a) => a.severity === "high").length,
              withFix: list.filter((a) => a.fixedVersion).length,
            },
          };
        }),
      ecosystems: countBy(openDeps, (a) => a.ecosystem ?? "unknown"),
      advisories: countBy(openDeps.flatMap((a) => (a.advisoryIds ?? []).map((id) => ({ id, a }))), (x) => x.id).slice(0, TOP_N),
      upgradeImpact,
      fixAvailability: { withFix: openDeps.filter((a) => a.fixedVersion).length, withoutFix: openDeps.filter((a) => !a.fixedVersion).length },
      fieldsAvailable: {
        ecosystem: openDeps.some((a) => a.ecosystem),
        advisories: openDeps.some((a) => a.advisoryIds?.length),
        fixedVersion: openDeps.some((a) => a.fixedVersion),
      },
    },
    secrets: {
      leaderboard: groupScore((a) => a.repositoryId, repoLabel)
        .map((r) => ({ ...r, count: openSecrets.filter((a) => a.repositoryId === r.id).length }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, TOP_N),
      types: countBy(openSecrets, (a) => a.secretType ?? "Unknown secret type").slice(0, TOP_N),
      ageBuckets: ageBuckets(openSecrets, now),
      exposedOver7Days: openSecrets.filter((a) => (daysBetween(a.firstSeen, now) ?? 0) > 7).length,
      validity: hasValidity ? countBy(openSecrets, (a) => a.validity ?? "unknown") : null,
      weekly: weekly(allSecrets, filters.periodDays, now),
    },
    coverage: {
      rows: coverageRows.sort((a, b) => a.projectName.localeCompare(b.projectName) || a.repositoryName.localeCompare(b.repositoryName)),
      totals: {
        repos: coverageRows.length,
        code: coverageRows.filter((r) => r.code === true).length,
        dependency: coverageRows.filter((r) => r.dependency === true).length,
        secret: coverageRows.filter((r) => r.secret === true).length,
        unknown: coverageRows.filter((r) => r.code === null && r.dependency === null && r.secret === null).length,
      },
      trend: coverageTrend,
    },
  };
}
