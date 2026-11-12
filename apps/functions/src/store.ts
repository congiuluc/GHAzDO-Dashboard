import {
  DEFAULT_SETTINGS,
  mergeObservation,
  observationFromSnapshot,
  type DailyObservation,
  type RepoSnapshot,
  type Severity,
} from "@ghazdo/shared";

export interface RepoState {
  projectId: string;
  projectName: string;
  repositoryId: string;
  repositoryName: string;
  /** Pointer to the latest published snapshot (blob name); absent until the first publish. */
  snapshotRef?: string;
  snapshotAt?: string;
  lastAttemptAt?: string;
  lastStatus?: RepoSnapshot["status"];
  lastError?: string;
}

export interface RunManifest {
  runId: string;
  startedAt: string;
  trigger: "timer" | "manual";
  repositories: number;
}

export interface BackendStoreConfig {
  maxHistoryDays: number;
  slaDays?: Partial<Record<Severity, number>>;
  digestRecipients?: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface Store {
  getConfig(): Promise<BackendStoreConfig>;
  setConfig(cfg: BackendStoreConfig): Promise<void>;
  listRepoStates(): Promise<RepoState[]>;
  getRepoState(projectId: string, repositoryId: string): Promise<RepoState | undefined>;
  upsertRepoState(state: RepoState): Promise<void>;
  deleteRepoState(projectId: string, repositoryId: string): Promise<void>;
  writeSnapshot(ref: string, snapshot: RepoSnapshot): Promise<void>;
  readSnapshot(ref: string): Promise<RepoSnapshot | undefined>;
  listSnapshotRefs(projectId: string, repositoryId: string): Promise<{ ref: string; createdAt: string }[]>;
  deleteSnapshot(ref: string): Promise<void>;
  upsertObservation(o: DailyObservation): Promise<void>;
  listObservations(fromDay: string): Promise<DailyObservation[]>;
  deleteObservationsBefore(cutoffDay: string): Promise<number>;
  putRun(run: RunManifest): Promise<void>;
}

export function snapshotRef(projectId: string, repositoryId: string, runId: string): string {
  return `snapshots/${projectId}/${repositoryId}/${runId}.json.gz`;
}

/**
 * Publishes a collection result. Successful results are written to an immutable blob first and only then
 * become visible by moving the repository pointer, so readers never observe partial data.
 * Failed results keep the previous pointer, which readers then report as stale.
 */
export async function publishResult(store: Store, snapshot: RepoSnapshot, runId: string): Promise<void> {
  const prev = await store.getRepoState(snapshot.projectId, snapshot.repositoryId);
  const base: RepoState = {
    projectId: snapshot.projectId,
    projectName: snapshot.projectName,
    repositoryId: snapshot.repositoryId,
    repositoryName: snapshot.repositoryName,
    snapshotRef: prev?.snapshotRef,
    snapshotAt: prev?.snapshotAt,
    lastAttemptAt: snapshot.collectedAt,
    lastStatus: snapshot.status,
    lastError: snapshot.error,
  };
  if (snapshot.status === "ok" || snapshot.status === "disabled") {
    const ref = snapshotRef(snapshot.projectId, snapshot.repositoryId, runId);
    await store.writeSnapshot(ref, snapshot);
    await store.upsertRepoState({ ...base, snapshotRef: ref, snapshotAt: snapshot.collectedAt, lastError: undefined });
    const obs = observationFromSnapshot(snapshot);
    if (obs) await store.upsertObservation(obs);
    return;
  }
  await store.upsertRepoState(base);
}

const snapshotCache = new Map<string, RepoSnapshot>();
const CACHE_LIMIT = 5000;

/** Loads the latest snapshot per repository, flagging stale data and reporting failures truthfully. */
export async function loadLatestSnapshots(store: Store, states: RepoState[]): Promise<RepoSnapshot[]> {
  const out: RepoSnapshot[] = [];
  await Promise.all(
    states.map(async (st) => {
      let snap: RepoSnapshot | undefined;
      if (st.snapshotRef) {
        snap = snapshotCache.get(st.snapshotRef);
        if (!snap) {
          snap = await store.readSnapshot(st.snapshotRef);
          if (snap) {
            if (snapshotCache.size >= CACHE_LIMIT) snapshotCache.clear();
            snapshotCache.set(st.snapshotRef, snap);
          }
        }
      }
      const failedSince = st.lastStatus && st.lastStatus !== "ok" && st.lastStatus !== "disabled";
      if (snap) {
        out.push(
          failedSince
            ? { ...snap, projectName: st.projectName, repositoryName: st.repositoryName, stale: true, lastAttemptAt: st.lastAttemptAt, error: st.lastError ?? st.lastStatus }
            : { ...snap, projectName: st.projectName, repositoryName: st.repositoryName },
        );
      } else {
        out.push({
          projectId: st.projectId,
          projectName: st.projectName,
          repositoryId: st.repositoryId,
          repositoryName: st.repositoryName,
          collectedAt: st.lastAttemptAt ?? new Date(0).toISOString(),
          status: st.lastStatus && st.lastStatus !== "ok" ? st.lastStatus : "failed",
          error: st.lastError ?? (st.lastAttemptAt ? undefined : "Not collected yet"),
          alerts: [],
        });
      }
    }),
  );
  return out;
}

export class MemoryStore implements Store {
  config: BackendStoreConfig = {
    maxHistoryDays: DEFAULT_SETTINGS.maxHistoryDays,
    slaDays: { ...DEFAULT_SETTINGS.slaDays },
    digestRecipients: [],
  };
  states = new Map<string, RepoState>();
  blobs = new Map<string, { snapshot: RepoSnapshot; createdAt: string }>();
  observations = new Map<string, DailyObservation>();
  runs: RunManifest[] = [];

  async getConfig() {
    return { ...this.config };
  }
  async setConfig(cfg: BackendStoreConfig) {
    this.config = { ...cfg };
  }
  async listRepoStates() {
    return [...this.states.values()].map((s) => ({ ...s }));
  }
  async getRepoState(p: string, r: string) {
    const s = this.states.get(`${p}/${r}`);
    return s ? { ...s } : undefined;
  }
  async upsertRepoState(s: RepoState) {
    this.states.set(`${s.projectId}/${s.repositoryId}`, { ...s });
  }
  async deleteRepoState(p: string, r: string) {
    this.states.delete(`${p}/${r}`);
  }
  async writeSnapshot(ref: string, snapshot: RepoSnapshot) {
    this.blobs.set(ref, { snapshot: structuredClone(snapshot), createdAt: snapshot.collectedAt });
  }
  async readSnapshot(ref: string) {
    const b = this.blobs.get(ref);
    return b ? structuredClone(b.snapshot) : undefined;
  }
  async listSnapshotRefs(p: string, r: string) {
    const prefix = `snapshots/${p}/${r}/`;
    return [...this.blobs].filter(([k]) => k.startsWith(prefix)).map(([ref, b]) => ({ ref, createdAt: b.createdAt }));
  }
  async deleteSnapshot(ref: string) {
    this.blobs.delete(ref);
  }
  async upsertObservation(o: DailyObservation) {
    const k = `${o.repositoryId}/${o.day}`;
    this.observations.set(k, mergeObservation(this.observations.get(k), o));
  }
  async listObservations(fromDay: string) {
    return [...this.observations.values()].filter((o) => o.day >= fromDay);
  }
  async deleteObservationsBefore(cutoffDay: string) {
    let n = 0;
    for (const [k, o] of this.observations) if (o.day < cutoffDay && this.observations.delete(k)) n++;
    return n;
  }
  async putRun(run: RunManifest) {
    this.runs.push(run);
  }
}
