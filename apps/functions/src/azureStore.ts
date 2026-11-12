import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { TableClient, odata, type TableEntity } from "@azure/data-tables";
import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";
import { DEFAULT_SETTINGS, mergeObservation, type DailyObservation, type RepoSnapshot } from "@ghazdo/shared";
import type { BackendStoreConfig, RepoState, RunManifest, Store } from "./store.js";

const gz = promisify(gzip);
const gunz = promisify(gunzip);
const CONTAINER = "snapshots";

function isNotFound(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 404;
}

/** Azure Storage implementation: Blob for immutable snapshots, Tables for pointers, observations, config and runs. */
export class AzureStore implements Store {
  private readonly container: ContainerClient;
  private readonly tables: Record<"repos" | "observations" | "config" | "runs", TableClient>;
  private ready?: Promise<void>;

  constructor(opts: { accountName?: string; connectionString?: string; credential?: TokenCredential }) {
    const names = { repos: "RepoState", observations: "DailyObservations", config: "DashboardConfig", runs: "CollectionRuns" } as const;
    if (opts.connectionString) {
      this.container = BlobServiceClient.fromConnectionString(opts.connectionString).getContainerClient(CONTAINER);
      this.tables = Object.fromEntries(
        Object.entries(names).map(([k, t]) => [k, TableClient.fromConnectionString(opts.connectionString!, t, { allowInsecureConnection: true })]),
      ) as AzureStore["tables"];
    } else {
      if (!opts.accountName) throw new Error("STORAGE_ACCOUNT_NAME or STORAGE_CONNECTION_STRING is required.");
      const credential = opts.credential ?? new DefaultAzureCredential();
      this.container = new BlobServiceClient(`https://${opts.accountName}.blob.core.windows.net`, credential).getContainerClient(CONTAINER);
      this.tables = Object.fromEntries(
        Object.entries(names).map(([k, t]) => [k, new TableClient(`https://${opts.accountName}.table.core.windows.net`, t, credential)]),
      ) as AzureStore["tables"];
    }
  }

  private init(): Promise<void> {
    this.ready ??= (async () => {
      await this.container.createIfNotExists();
      await Promise.all(Object.values(this.tables).map((t) => t.createTable()));
    })();
    return this.ready;
  }

  async getConfig(): Promise<BackendStoreConfig> {
    await this.init();
    try {
      const e = await this.tables.config.getEntity<{ maxHistoryDays: number; updatedAt?: string; updatedBy?: string }>("config", "settings");
      return { maxHistoryDays: e.maxHistoryDays, updatedAt: e.updatedAt, updatedBy: e.updatedBy };
    } catch (err) {
      if (isNotFound(err)) return { maxHistoryDays: DEFAULT_SETTINGS.maxHistoryDays };
      throw err;
    }
  }

  async setConfig(cfg: BackendStoreConfig): Promise<void> {
    await this.init();
    await this.tables.config.upsertEntity({ partitionKey: "config", rowKey: "settings", ...cfg }, "Replace");
  }

  private toState(e: Record<string, unknown> & { partitionKey?: string; rowKey?: string }): RepoState {
    return {
      projectId: String(e.partitionKey ?? ""),
      repositoryId: String(e.rowKey ?? ""),
      projectName: String(e.projectName ?? ""),
      repositoryName: String(e.repositoryName ?? ""),
      snapshotRef: (e.snapshotRef as string) || undefined,
      snapshotAt: (e.snapshotAt as string) || undefined,
      lastAttemptAt: (e.lastAttemptAt as string) || undefined,
      lastStatus: (e.lastStatus as RepoState["lastStatus"]) || undefined,
      lastError: (e.lastError as string) || undefined,
    };
  }

  async listRepoStates(): Promise<RepoState[]> {
    await this.init();
    const out: RepoState[] = [];
    for await (const e of this.tables.repos.listEntities<Record<string, unknown>>()) out.push(this.toState(e));
    return out;
  }

  async getRepoState(projectId: string, repositoryId: string): Promise<RepoState | undefined> {
    await this.init();
    try {
      return this.toState(await this.tables.repos.getEntity<Record<string, unknown>>(projectId, repositoryId));
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
  }

  async upsertRepoState(s: RepoState): Promise<void> {
    await this.init();
    const { projectId, repositoryId, ...rest } = s;
    const entity: Record<string, unknown> = { partitionKey: projectId, rowKey: repositoryId };
    for (const [k, v] of Object.entries(rest)) entity[k] = v ?? "";
    await this.tables.repos.upsertEntity(entity as TableEntity, "Replace");
  }

  async deleteRepoState(projectId: string, repositoryId: string): Promise<void> {
    await this.init();
    await this.tables.repos.deleteEntity(projectId, repositoryId).catch((err) => {
      if (!isNotFound(err)) throw err;
    });
  }

  async writeSnapshot(ref: string, snapshot: RepoSnapshot): Promise<void> {
    await this.init();
    const body = await gz(Buffer.from(JSON.stringify(snapshot)));
    await this.container.getBlockBlobClient(ref).uploadData(body, {
      blobHTTPHeaders: { blobContentType: "application/json", blobContentEncoding: "gzip" },
      conditions: { ifNoneMatch: "*" },
    });
  }

  async readSnapshot(ref: string): Promise<RepoSnapshot | undefined> {
    await this.init();
    try {
      const buf = await this.container.getBlockBlobClient(ref).downloadToBuffer();
      return JSON.parse((await gunz(buf)).toString("utf8")) as RepoSnapshot;
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
  }

  async listSnapshotRefs(projectId: string, repositoryId: string): Promise<{ ref: string; createdAt: string }[]> {
    await this.init();
    const out: { ref: string; createdAt: string }[] = [];
    for await (const b of this.container.listBlobsFlat({ prefix: `snapshots/${projectId}/${repositoryId}/` })) {
      out.push({ ref: b.name, createdAt: (b.properties.createdOn ?? b.properties.lastModified).toISOString() });
    }
    return out;
  }

  async deleteSnapshot(ref: string): Promise<void> {
    await this.init();
    await this.container.getBlockBlobClient(ref).deleteIfExists();
  }

  async upsertObservation(o: DailyObservation): Promise<void> {
    await this.init();
    let existing: DailyObservation | undefined;
    try {
      const e = await this.tables.observations.getEntity<{ data: string }>(o.repositoryId, o.day);
      existing = JSON.parse(e.data) as DailyObservation;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    const merged = mergeObservation(existing, o);
    await this.tables.observations.upsertEntity({ partitionKey: o.repositoryId, rowKey: o.day, day: o.day, data: JSON.stringify(merged) }, "Replace");
  }

  async listObservations(fromDay: string): Promise<DailyObservation[]> {
    await this.init();
    const out: DailyObservation[] = [];
    const iter = this.tables.observations.listEntities<{ data: string }>({ queryOptions: { filter: odata`RowKey ge ${fromDay}` } });
    for await (const e of iter) out.push(JSON.parse(e.data) as DailyObservation);
    return out;
  }

  async deleteObservationsBefore(cutoffDay: string): Promise<number> {
    await this.init();
    let n = 0;
    const iter = this.tables.observations.listEntities({ queryOptions: { filter: odata`RowKey lt ${cutoffDay}`, select: ["PartitionKey", "RowKey"] } });
    for await (const e of iter) {
      await this.tables.observations.deleteEntity(String(e.partitionKey), String(e.rowKey));
      n++;
    }
    return n;
  }

  async putRun(run: RunManifest): Promise<void> {
    await this.init();
    await this.tables.runs.upsertEntity({ partitionKey: run.startedAt.slice(0, 10), rowKey: run.runId, ...run }, "Replace");
  }
}
