import { mergeObservation, type DailyObservation } from "@ghazdo/shared";

/** Minimal subset of the Azure DevOps ExtensionDataManager used here (injectable for tests). */
export interface DocumentStore {
  getDocuments(collection: string, options: { scopeType: "User" | "Default" }): Promise<HistoryDoc[]>;
  getDocument(collection: string, id: string, options: { scopeType: "User" | "Default" }): Promise<HistoryDoc>;
  setDocument(collection: string, doc: HistoryDoc, options: { scopeType: "User" | "Default" }): Promise<HistoryDoc>;
  deleteDocument(collection: string, id: string, options: { scopeType: "User" | "Default" }): Promise<void>;
}

export interface HistoryDoc {
  id: string;
  __etag?: number;
  schema?: number;
  observations: DailyObservation[];
}

const USER = { scopeType: "User" as const };
const MAX_RETRIES = 4;

export function historyCollection(organization: string): string {
  return `user-history-${organization.toLowerCase()}`;
}

/** Merges observations into a day document, keeping the latest observation per repository. */
export function mergeDay(existing: DailyObservation[], incoming: DailyObservation[]): DailyObservation[] {
  const byRepo = new Map(existing.map((o) => [o.repositoryId, o]));
  for (const o of incoming) byRepo.set(o.repositoryId, mergeObservation(byRepo.get(o.repositoryId), o));
  return [...byRepo.values()].sort((a, b) => a.repositoryId.localeCompare(b.repositoryId));
}

function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; serverError?: { typeKey?: string }; message?: string };
  return e?.status === 404 || e?.serverError?.typeKey === "DocumentDoesNotExistException" || /does not exist|not found/i.test(e?.message ?? "");
}

function isConflict(err: unknown): boolean {
  const e = err as { status?: number; serverError?: { typeKey?: string }; message?: string };
  return e?.status === 409 || e?.status === 412 || /conflict|etag|InvalidDocumentVersion/i.test(`${e?.serverError?.typeKey ?? ""} ${e?.message ?? ""}`);
}

/**
 * Per-user history stored in Azure DevOps extension data (User scope, one document per UTC day).
 * Writes use optimistic concurrency (__etag) with merge-and-retry so multiple tabs/devices converge.
 */
export class UserHistorySync {
  constructor(
    private readonly docs: DocumentStore,
    private readonly organization: string,
  ) {}

  private get collection(): string {
    return historyCollection(this.organization);
  }

  async pushDay(day: string, observations: DailyObservation[]): Promise<void> {
    if (!observations.length) return;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let current: HistoryDoc | undefined;
      try {
        current = await this.docs.getDocument(this.collection, day, USER);
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
      const doc: HistoryDoc = {
        id: day,
        schema: 1,
        observations: mergeDay(current?.observations ?? [], observations),
        // -1 means "create only"; an existing etag means "replace only if unchanged".
        __etag: current?.__etag ?? -1,
      };
      try {
        await this.docs.setDocument(this.collection, doc, USER);
        return;
      } catch (err) {
        if (!isConflict(err) || attempt === MAX_RETRIES) throw err;
      }
    }
  }

  /** Returns all stored observations on or after `fromDay`. */
  async pull(fromDay: string): Promise<DailyObservation[]> {
    let docs: HistoryDoc[];
    try {
      docs = await this.docs.getDocuments(this.collection, USER);
    } catch (err) {
      if (isNotFound(err)) return [];
      throw err;
    }
    return docs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id) && d.id >= fromDay).flatMap((d) => d.observations ?? []);
  }

  /** Deletes day documents older than the retention cutoff. Returns the number deleted. */
  async purgeBefore(cutoffDay: string): Promise<number> {
    let docs: HistoryDoc[];
    try {
      docs = await this.docs.getDocuments(this.collection, USER);
    } catch (err) {
      if (isNotFound(err)) return 0;
      throw err;
    }
    const expired = docs.filter((d) => d.id < cutoffDay);
    for (const d of expired) await this.docs.deleteDocument(this.collection, d.id, USER);
    return expired.length;
  }
}
