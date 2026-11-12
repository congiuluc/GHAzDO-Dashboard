import type { NormalizedAlert, RepoSnapshot } from "@ghazdo/shared";
import { aggregate, observationFromSnapshot, pageAlerts, toSummaries, utcDay, type DailyObservation } from "@ghazdo/shared";
import type { AlertPage, AlertQuery, DashboardData, DashboardScope, Filters } from "@ghazdo/shared";
import type { DataSource } from "./dataSource";

/** Deterministic pseudo-random generator so fixture data is stable across reloads. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const PROJECTS = ["Payments", "Identity", "Mobile", "Platform"];
/** Project used by the project hub when running locally with sample data. */
export const FIXTURE_PROJECT = { id: "p1", name: PROJECTS[0]! };
const RULES = ["js/sql-injection", "cs/path-injection", "py/xss", "js/insecure-randomness", "cs/weak-crypto"];
const PACKAGES = [
  ["lodash", "4.17.15", "npm"],
  ["Newtonsoft.Json", "12.0.1", "nuget"],
  ["requests", "2.19.0", "pip"],
  ["log4j-core", "2.14.1", "maven"],
] as const;
const SECRETS = ["Azure Storage Account Key", "GitHub Personal Access Token", "Azure SQL Connection String", "Slack Token"];
const SEV = ["critical", "high", "medium", "low"] as const;
const REFS = ["refs/heads/main", "refs/heads/develop", "refs/heads/feature/checkout", undefined] as const;

/** Generates sample data. Development only; never used when running inside Azure DevOps. */
export function fixtureData(now = new Date()): { snapshots: RepoSnapshot[]; observations: DailyObservation[] } {
  const rand = rng(42);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;
  const snapshots: RepoSnapshot[] = [];
  let id = 1;
  PROJECTS.forEach((pName, pi) => {
    const projectId = `p${pi + 1}`;
    for (let ri = 0; ri < 3; ri++) {
      const repositoryId = `${projectId}-r${ri + 1}`;
      const alerts: NormalizedAlert[] = [];
      const count = 5 + Math.floor(rand() * 25);
      for (let i = 0; i < count; i++) {
        const kind = pick(["code", "code", "dependency", "dependency", "dependency", "secret"] as const);
        const severity = kind === "secret" ? "high" : pick(SEV);
        const firstSeen = new Date(now.getTime() - Math.floor(rand() * 200) * 86_400_000).toISOString();
        const state = pick(["active", "active", "active", "fixed", "dismissed"] as const);
        const pkg = pick(PACKAGES);
        const alertId = id++;
        alerts.push({
          key: `sample/${projectId}/${repositoryId}/${alertId}`,
          alertId,
          projectId,
          repositoryId,
          kind,
          rawType: kind,
          severity,
          rawSeverity: severity,
          state,
          rawState: state,
          title: kind === "code" ? `Finding ${alertId}` : kind === "dependency" ? `${pkg[0]} vulnerability` : "Exposed secret",
          ruleId: kind === "code" ? pick(RULES) : undefined,
          ruleName: kind === "code" ? pick(RULES) : undefined,
          tool: kind === "code" ? "CodeQL" : kind === "dependency" ? "Dependency Scanning" : "Secret Scanning",
          gitRef: REFS[(alertId - 1) % REFS.length],
          firstSeen,
          fixedDate: state === "fixed" ? new Date(Date.parse(firstSeen) + rand() * 30 * 86_400_000).toISOString() : undefined,
          packageName: kind === "dependency" ? pkg[0] : undefined,
          packageVersion: kind === "dependency" ? pkg[1] : undefined,
          ecosystem: kind === "dependency" ? pkg[2] : undefined,
          advisoryIds: kind === "dependency" ? [`CVE-2021-${1000 + Math.floor(rand() * 9000)}`] : undefined,
          fixedVersion: kind === "dependency" && rand() > 0.3 ? "latest" : undefined,
          secretType: kind === "secret" ? pick(SECRETS) : undefined,
          confidence: kind === "secret" ? "high" : undefined,
        });
      }
      snapshots.push({
        projectId,
        projectName: pName,
        repositoryId,
        repositoryName: `${pName.toLowerCase()}-${["api", "web", "worker"][ri]}`,
        collectedAt: now.toISOString(),
        status: pi === 3 && ri === 2 ? "disabled" : "ok",
        enablement: pi === 3 && ri === 2 ? { code: false, dependency: false, secret: false } : { code: true, dependency: true, secret: ri !== 1 },
        alerts: pi === 3 && ri === 2 ? [] : alerts,
      });
    }
  });
  const observations: DailyObservation[] = [];
  for (let d = 0; d < 90; d++) {
    const date = new Date(now.getTime() - d * 86_400_000);
    for (const s of snapshots) {
      const o = observationFromSnapshot({ ...s, collectedAt: date.toISOString() });
      if (!o) continue;
      const drift = 1 + d / 60;
      for (const k of Object.keys(o.counts) as (keyof typeof o.counts)[]) o.counts[k] = Math.round((o.counts[k] ?? 0) * drift);
      observations.push({ ...o, day: utcDay(date) });
    }
  }
  return { snapshots, observations };
}

export class FixtureSource implements DataSource {
  readonly mode = "fixture" as const;
  private data = fixtureData();

  private scoped(scope: DashboardScope) {
    const pid = scope.kind === "project" ? scope.projectId : undefined;
    return {
      snapshots: this.data.snapshots.filter((s) => !pid || s.projectId === pid),
      observations: this.data.observations.filter((o) => !pid || o.projectId === pid),
    };
  }

  async getDashboard(filters: Filters, scope: DashboardScope): Promise<DashboardData> {
    return aggregate({ organization: "sample-org", ...this.scoped(scope), filters, scope });
  }

  async getAlerts(query: AlertQuery, scope: DashboardScope): Promise<AlertPage> {
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
    const page = pageAlerts(toSummaries("sample-org", this.scoped(scope).snapshots), { ...query, scope, offset });
    return { items: page.items, total: page.total, nextCursor: page.nextOffset === undefined ? undefined : String(page.nextOffset) };
  }

  async refresh(): Promise<{ warnings: string[] }> {
    return { warnings: [] };
  }

  async isEmpty(): Promise<boolean> {
    return false;
  }
}
