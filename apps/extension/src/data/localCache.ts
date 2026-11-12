import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { mergeObservation, type DailyObservation, type RepoSnapshot } from "@ghazdo/shared";

interface CacheSchema extends DBSchema {
  snapshots: { key: string; value: RepoSnapshot; indexes: { byProject: string } };
  observations: { key: [string, string]; value: DailyObservation; indexes: { byDay: string } };
  meta: { key: string; value: { key: string; value: unknown } };
}

/** Per organization + user IndexedDB cache. Never shared between users on the same browser profile. */
export class LocalCache {
  private dbPromise: Promise<IDBPDatabase<CacheSchema>>;

  constructor(organization: string, userId: string) {
    this.dbPromise = openDB<CacheSchema>(`ghazdo:${organization.toLowerCase()}:${userId.toLowerCase()}`, 1, {
      upgrade(db) {
        const snaps = db.createObjectStore("snapshots", { keyPath: "repositoryId" });
        snaps.createIndex("byProject", "projectId");
        const obs = db.createObjectStore("observations", { keyPath: ["repositoryId", "day"] });
        obs.createIndex("byDay", "day");
        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }

  async getSnapshots(projectId?: string): Promise<RepoSnapshot[]> {
    const db = await this.dbPromise;
    return projectId ? db.getAllFromIndex("snapshots", "byProject", projectId) : db.getAll("snapshots");
  }

  /**
   * Stores a collection result. Failures keep previously collected data marked stale; repositories in
   * the collected projects that no longer exist are removed.
   */
  async saveCollection(snapshots: RepoSnapshot[], collectedProjectIds: string[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(["snapshots", "observations"], "readwrite");
    const store = tx.objectStore("snapshots");
    const seen = new Set(snapshots.map((s) => s.repositoryId));
    for (const pid of collectedProjectIds) {
      for (const existing of await store.index("byProject").getAll(pid)) {
        if (!seen.has(existing.repositoryId)) await store.delete(existing.repositoryId);
      }
    }
    for (const s of snapshots) {
      const prev = await store.get(s.repositoryId);
      if ((s.status === "failed" || s.status === "denied") && prev?.status === "ok") {
        await store.put({ ...prev, stale: true, lastAttemptAt: s.collectedAt, error: s.error ?? s.status });
      } else {
        await store.put(s);
      }
    }
    await tx.done;
  }

  async putObservations(list: DailyObservation[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction("observations", "readwrite");
    for (const o of list) {
      const prev = await tx.store.get([o.repositoryId, o.day]);
      await tx.store.put(mergeObservation(prev, o));
    }
    await tx.done;
  }

  async getObservations(fromDay: string): Promise<DailyObservation[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex("observations", "byDay", IDBKeyRange.lowerBound(fromDay));
  }

  async purgeBefore(cutoffDay: string): Promise<number> {
    const db = await this.dbPromise;
    const tx = db.transaction("observations", "readwrite");
    let n = 0;
    let cursor = await tx.store.index("byDay").openCursor(IDBKeyRange.upperBound(cutoffDay, true));
    while (cursor) {
      await cursor.delete();
      n++;
      cursor = await cursor.continue();
    }
    await tx.done;
    return n;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.dbPromise;
    return (await db.get("meta", key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const db = await this.dbPromise;
    await db.put("meta", { key, value });
  }

  async clear(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(["snapshots", "observations", "meta"], "readwrite");
    await Promise.all([tx.objectStore("snapshots").clear(), tx.objectStore("observations").clear(), tx.objectStore("meta").clear(), tx.done]);
  }
}
