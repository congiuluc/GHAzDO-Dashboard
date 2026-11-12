import {
  AdoClient,
  aggregate,
  collectAll,
  observationFromSnapshot,
  pageAlerts,
  retentionCutoffDay,
  toSummaries,
  utcDay,
  type AlertPage,
  type AlertQuery,
  type DashboardData,
  type DashboardScope,
  type Filters,
} from "@ghazdo/shared";
import type { DataSource, RefreshProgress } from "./dataSource";
import type { LocalCache } from "./localCache";
import type { UserHistorySync } from "./userHistory";

export interface BrowserSourceOptions {
  organization: string;
  cache: LocalCache;
  client: AdoClient;
  maxHistoryDays: number;
  /** Present only when admins allow per-user history in Azure DevOps and the user opted in. */
  userHistory?: UserHistorySync;
}

/**
 * Browser-only mode: collects alerts with the signed-in user's own token, so results are always limited
 * to what that user may see. IndexedDB is the cache; optional per-user history is synced to Azure DevOps.
 */
export class BrowserSource implements DataSource {
  readonly mode = "browser" as const;
  private hydrated = false;

  constructor(private readonly opts: BrowserSourceOptions) {}

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    const { cache, userHistory, maxHistoryDays } = this.opts;
    const cutoff = retentionCutoffDay(maxHistoryDays);
    await cache.purgeBefore(cutoff);
    if (userHistory) {
      try {
        await cache.putObservations(await userHistory.pull(cutoff));
        void userHistory.purgeBefore(cutoff).catch(() => undefined);
      } catch {
        /* history sync is best effort; the local cache still works */
      }
    }
  }

  private async load(scope: DashboardScope) {
    await this.hydrate();
    const projectId = scope.kind === "project" ? scope.projectId : undefined;
    const snapshots = await this.opts.cache.getSnapshots(projectId);
    const observations = (await this.opts.cache.getObservations(retentionCutoffDay(this.opts.maxHistoryDays))).filter(
      (o) => !projectId || o.projectId === projectId,
    );
    return { snapshots, observations };
  }

  async getDashboard(filters: Filters, scope: DashboardScope): Promise<DashboardData> {
    const { snapshots, observations } = await this.load(scope);
    return aggregate({ organization: this.opts.organization, snapshots, observations, filters, scope });
  }

  async getAlerts(query: AlertQuery, scope: DashboardScope): Promise<AlertPage> {
    const { snapshots } = await this.load(scope);
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
    const page = pageAlerts(toSummaries(this.opts.organization, snapshots), {
      filters: query.filters,
      scope,
      sort: query.sort,
      offset,
      pageSize: query.pageSize,
    });
    return { items: page.items, total: page.total, nextCursor: page.nextOffset === undefined ? undefined : String(page.nextOffset) };
  }

  async refresh(scope: DashboardScope, onProgress?: (p: RefreshProgress) => void): Promise<{ warnings: string[] }> {
    await this.hydrate();
    const projectIds = scope.kind === "project" ? [scope.projectId] : undefined;
    const { snapshots, projects, errors } = await collectAll(this.opts.client, { projectIds, concurrency: 6, onProgress });
    await this.opts.cache.saveCollection(snapshots, projects.map((p) => p.id));
    const observations = snapshots.map(observationFromSnapshot).filter((o) => o !== null);
    await this.opts.cache.putObservations(observations);
    await this.opts.cache.setMeta(`lastRefresh:${scope.kind === "project" ? scope.projectId : "org"}`, new Date().toISOString());
    const warnings = [...errors];
    const denied = snapshots.filter((s) => s.status === "denied").length;
    const failed = snapshots.filter((s) => s.status === "failed").length;
    if (denied) warnings.push(`${denied} repositories were skipped because you do not have Advanced Security read permission.`);
    if (failed) warnings.push(`${failed} repositories could not be collected; previous data is shown as stale where available.`);
    if (this.opts.userHistory) {
      try {
        await this.opts.userHistory.pushDay(utcDay(new Date()), observations);
      } catch (err) {
        warnings.push(`Saving your history to Azure DevOps failed: ${(err as Error).message}`);
      }
    }
    return { warnings };
  }

  async isEmpty(scope: DashboardScope): Promise<boolean> {
    return (await this.opts.cache.getSnapshots(scope.kind === "project" ? scope.projectId : undefined)).length === 0;
  }
}
