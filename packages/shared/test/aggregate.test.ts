import { describe, expect, it } from "vitest";
import { aggregate } from "../src/aggregate.js";
import { alertsToCsv, pageAlerts } from "../src/alertsPage.js";
import { sanitizeFilters } from "../src/filters.js";
import { observationFromSnapshot } from "../src/retention.js";
import type { NormalizedAlert, RepoSnapshot } from "../src/types.js";

const now = new Date("2024-06-15T12:00:00Z");
let id = 0;
function alert(p: string, r: string, over: Partial<NormalizedAlert>): NormalizedAlert {
  id++;
  return { key: `o/${p}/${r}/${id}`, alertId: id, projectId: p, repositoryId: r, kind: "code", rawType: "code", severity: "high", rawSeverity: "high", state: "active", rawState: "active", title: `A${id}`, ...over };
}
function snap(p: string, r: string, alerts: NormalizedAlert[], over: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return { projectId: p, projectName: p.toUpperCase(), repositoryId: r, repositoryName: `${r}-name`, collectedAt: "2024-06-15T10:00:00Z", status: "ok", alerts, enablement: { code: true, dependency: true, secret: false }, ...over };
}

const snapshots = [
  snap("p1", "r1", [
    alert("p1", "r1", { severity: "critical", firstSeen: "2024-06-14T00:00:00Z" }),
    alert("p1", "r1", { kind: "secret", secretType: "AzureKey", firstSeen: "2024-05-01T00:00:00Z" }),
    alert("p1", "r1", { state: "fixed", firstSeen: "2024-06-01T00:00:00Z", fixedDate: "2024-06-11T00:00:00Z" }),
  ]),
  snap("p1", "r2", [alert("p1", "r2", { kind: "dependency", severity: "medium", packageName: "lodash", ecosystem: "npm", fixedVersion: "4.17.21", advisoryIds: ["CVE-1"] })]),
  snap("p2", "r3", [alert("p2", "r3", { severity: "low" })]),
  snap("p2", "r4", [], { status: "failed", error: "boom" }),
];

describe("aggregate", () => {
  it("computes KPIs, kinds and secret/dependency details", () => {
    const d = aggregate({ organization: "o", snapshots, observations: [], filters: sanitizeFilters({}), scope: { kind: "organization" }, now });
    expect(d.kpis).toMatchObject({ open: 4, criticalHighOpen: 2, new7d: 1, fixed7d: 1 });
    expect(d.kinds.find((k) => k.id === "secret")!.count).toBe(1);
    expect(d.secrets.types[0]).toMatchObject({ id: "AzureKey", count: 1 });
    expect(d.secrets.exposedOver7Days).toBe(1);
    expect(d.dependencies.topPackages[0]).toMatchObject({ id: "lodash", extra: { withFix: 1 } });
    expect(d.dependencies.advisories[0]!.id).toBe("CVE-1");
    expect(d.freshness.failedRepos).toHaveLength(1);
    expect(d.freshness.partial).toBe(true);
    expect(d.heatmap.level).toBe("project");
    expect(d.timeToFix.find((t) => t.group === "kind:code")).toMatchObject({ averageDays: 10, samples: 1 });
  });

  it("drills down by project and repository and scopes project dashboards", () => {
    const byProject = aggregate({ organization: "o", snapshots, observations: [], filters: sanitizeFilters({ projectIds: ["p1"] }), scope: { kind: "organization" }, now });
    expect(byProject.kpis.open).toBe(3);
    expect(byProject.heatmap.level).toBe("repository");
    expect(byProject.filterOptions.repositories.map((r) => r.id)).toEqual(["r1", "r2"]);
    const byRepo = aggregate({ organization: "o", snapshots, observations: [], filters: sanitizeFilters({ repositoryIds: ["r2"] }), scope: { kind: "organization" }, now });
    expect(byRepo.kpis.open).toBe(1);
    const scoped = aggregate({ organization: "o", snapshots, observations: [], filters: sanitizeFilters({ projectIds: ["p1"] }), scope: { kind: "project", projectId: "p2" }, now });
    expect(scoped.kpis.open).toBe(1);
    expect(scoped.filterOptions.projects.map((p) => p.id)).toEqual(["p2"]);
  });

  it("builds trends from observations with explicit gaps", () => {
    const obs = snapshots.map(observationFromSnapshot).filter((o) => o !== null);
    const d = aggregate({ organization: "o", snapshots, observations: obs, filters: sanitizeFilters({ periodDays: 3 }), scope: { kind: "organization" }, now });
    expect(d.openTrend.map((t) => t.day)).toEqual(["2024-06-13", "2024-06-14", "2024-06-15"]);
    expect(d.openTrend[0]!.observed).toBe(0);
    expect(d.openTrend[2]).toMatchObject({ observed: 3, expected: 3, values: { critical: 1, high: 1, medium: 1, low: 1 } });
  });

  it("calculates SLA, dismissal, upgrade impact and scanner coverage without counting partial coverage as unknown", () => {
    const observed = snap("p3", "r5", [
      alert("p3", "r5", { severity: "critical", firstSeen: "2024-06-01T00:00:00Z" }),
      alert("p3", "r5", { severity: "critical" }),
      alert("p3", "r5", { state: "dismissed", dismissal: { reason: "falsepositive", actor: "Security Owner" } }),
      alert("p3", "r5", { kind: "dependency", packageName: "lodash", ecosystem: "npm", fixedVersion: "4.17.21" }),
    ], { enablement: { code: true, dependency: false, secret: true } });
    const missingCoverage = snap("p3", "r6", [], { enablement: undefined });
    const observation = observationFromSnapshot(observed)!;
    const data = aggregate({
      organization: "o",
      snapshots: [observed, missingCoverage],
      observations: [observation],
      filters: sanitizeFilters({ periodDays: 3 }),
      scope: { kind: "organization" },
      slaDays: { critical: 7 },
      now,
    });

    expect(data.sla).toMatchObject({ overdue: 1, eligible: 1, unknownAge: 1 });
    expect(data.dismissals).toMatchObject({ total: 1, reasons: [{ id: "falsepositive", count: 1 }], actors: [{ id: "Security Owner", count: 1 }] });
    expect(data.dependencies.upgradeImpact[0]).toMatchObject({ packageName: "lodash", fixedVersion: "4.17.21", alerts: 1, repositories: 1 });
    expect(data.coverage.totals).toMatchObject({ repos: 2, code: 1, dependency: 0, secret: 1, unknown: 1 });
    expect(data.coverage.trend.at(-1)).toMatchObject({ observed: 1, values: { code: 1, secret: 1 } });
  });
});

describe("pageAlerts", () => {
  it("filters, sorts, pages and enforces project scope", () => {
    const all = snapshots.flatMap((s) => s.alerts.map((a) => ({ ...a, projectName: s.projectName, repositoryName: s.repositoryName, url: "u" })));
    const page = pageAlerts(all, { filters: sanitizeFilters({ states: ["active"] }), scope: { kind: "organization" }, sort: { field: "severity", direction: "asc" }, offset: 0, pageSize: 2 });
    expect(page.total).toBe(4);
    expect(page.items[0]!.severity).toBe("critical");
    expect(page.nextOffset).toBe(2);
    const scoped = pageAlerts(all, { filters: sanitizeFilters({}), scope: { kind: "project", projectId: "p2" }, sort: { field: "title", direction: "asc" }, offset: 0, pageSize: 50 });
    expect(scoped.items.every((a) => a.projectId === "p2")).toBe(true);
    expect(pageAlerts(all, { filters: sanitizeFilters({ search: "r2-name" }), scope: { kind: "organization" }, sort: { field: "title", direction: "asc" }, offset: 0, pageSize: 50 }).total).toBe(1);
  });

  it("escapes CSV formula injection", () => {
    const csv = alertsToCsv([{ ...alert("p", "r", { title: "=cmd()" }), projectName: "P", repositoryName: "R", url: "u" }]);
    expect(csv).toContain("'=cmd()");
  });
});
