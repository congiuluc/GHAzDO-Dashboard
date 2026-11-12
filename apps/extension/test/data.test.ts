import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { AdoHttpError, type AdoClient, type DailyObservation, type NormalizedAlert, type RepoSnapshot } from "@ghazdo/shared";
import { LocalCache } from "../src/data/localCache";
import { BrowserSource } from "../src/data/browserSource";
import { UserHistorySync, type DocumentStore, type HistoryDoc } from "../src/data/userHistory";

let dbSeq = 0;
const newCache = () => new LocalCache(`org${++dbSeq}`, "user");

function alert(projectId: string, repositoryId: string, id: number): NormalizedAlert {
  return {
    key: `${repositoryId}:${id}`,
    alertId: id,
    projectId,
    repositoryId,
    kind: "secret",
    rawType: "secret",
    severity: "high",
    rawSeverity: "high",
    state: "active",
    rawState: "active",
    title: `Alert ${id}`,
  };
}

function snap(projectId: string, repositoryId: string, status: RepoSnapshot["status"] = "ok", alerts: NormalizedAlert[] = []): RepoSnapshot {
  return { projectId, projectName: projectId, repositoryId, repositoryName: repositoryId, collectedAt: "2025-01-02T00:00:00Z", status, alerts };
}

const obs = (repositoryId: string, day: string, n: number, observedAt = `${day}T10:00:00Z`): DailyObservation => ({
  day,
  projectId: "p1",
  repositoryId,
  observedAt,
  counts: { "secret|high|active": n },
});

describe("LocalCache", () => {
  it("keeps previous good data marked stale when a later collection fails", async () => {
    const cache = newCache();
    await cache.saveCollection([snap("p1", "r1", "ok", [alert("p1", "r1", 1)])], ["p1"]);
    await cache.saveCollection([{ ...snap("p1", "r1", "failed"), error: "boom" }], ["p1"]);
    const s = (await cache.getSnapshots("p1"))[0]!;
    expect(s.status).toBe("ok");
    expect(s.stale).toBe(true);
    expect(s.error).toBe("boom");
    expect(s.alerts).toHaveLength(1);
  });

  it("keeps previous good data marked stale when Advanced Security returns not found", async () => {
    const cache = newCache();
    await cache.saveCollection([snap("p1", "r1", "ok", [alert("p1", "r1", 1)])], ["p1"]);
    await cache.saveCollection([snap("p1", "r1", "notFound")], ["p1"]);
    const s = (await cache.getSnapshots("p1"))[0]!;
    expect(s.status).toBe("ok");
    expect(s.stale).toBe(true);
    expect(s.error).toBe("notFound");
    expect(s.alerts).toHaveLength(1);
  });

  it("removes repositories that disappeared from a collected project only", async () => {
    const cache = newCache();
    await cache.saveCollection([snap("p1", "r1"), snap("p1", "r2"), snap("p2", "r3")], ["p1", "p2"]);
    await cache.saveCollection([snap("p1", "r1")], ["p1"]);
    const ids = (await cache.getSnapshots()).map((s) => s.repositoryId).sort();
    expect(ids).toEqual(["r1", "r3"]);
  });

  it("purges old observations and clears everything", async () => {
    const cache = newCache();
    await cache.putObservations([obs("r1", "2025-01-01", 1), obs("r1", "2025-03-01", 2)]);
    expect(await cache.purgeBefore("2025-02-01")).toBe(1);
    expect((await cache.getObservations("2000-01-01")).map((o) => o.day)).toEqual(["2025-03-01"]);
    await cache.saveCollection([snap("p1", "r1")], ["p1"]);
    await cache.clear();
    expect(await cache.getSnapshots()).toEqual([]);
    expect(await cache.getObservations("2000-01-01")).toEqual([]);
  });
});

class FakeStore implements DocumentStore {
  docs = new Map<string, HistoryDoc>();
  conflictsToInject = 0;
  onBeforeSet?: () => void;

  async getDocuments(): Promise<HistoryDoc[]> {
    return [...this.docs.values()].map((d) => structuredClone(d));
  }
  async getDocument(_c: string, id: string): Promise<HistoryDoc> {
    const d = this.docs.get(id);
    if (!d) throw Object.assign(new Error("Document does not exist"), { status: 404 });
    return structuredClone(d);
  }
  async setDocument(_c: string, doc: HistoryDoc): Promise<HistoryDoc> {
    this.onBeforeSet?.();
    this.onBeforeSet = undefined;
    const cur = this.docs.get(doc.id);
    const ok = doc.__etag === -1 ? !cur : cur?.__etag === doc.__etag;
    if (!ok) throw Object.assign(new Error("InvalidDocumentVersionException"), { status: 400 });
    const saved = { ...structuredClone(doc), __etag: (cur?.__etag ?? 0) + 1 };
    this.docs.set(doc.id, saved);
    return saved;
  }
  async deleteDocument(_c: string, id: string): Promise<void> {
    this.docs.delete(id);
  }
}

describe("UserHistorySync", () => {
  it("merges with a concurrent writer and retries on etag conflict", async () => {
    const store = new FakeStore();
    const sync = new UserHistorySync(store, "Contoso");
    await sync.pushDay("2025-01-02", [obs("r1", "2025-01-02", 1)]);
    // Another tab writes r2 between our read and our write.
    store.onBeforeSet = () => {
      const cur = store.docs.get("2025-01-02")!;
      store.docs.set("2025-01-02", { ...cur, __etag: cur.__etag! + 1, observations: [...cur.observations, obs("r2", "2025-01-02", 5)] });
    };
    await sync.pushDay("2025-01-02", [obs("r1", "2025-01-02", 3, "2025-01-02T12:00:00Z")]);
    const saved = store.docs.get("2025-01-02")!;
    expect(saved.observations.map((o) => [o.repositoryId, o.counts["secret|high|active"]])).toEqual([
      ["r1", 3],
      ["r2", 5],
    ]);
  });

  it("pulls only recent days and purges older ones", async () => {
    const store = new FakeStore();
    const sync = new UserHistorySync(store, "Contoso");
    await sync.pushDay("2025-01-01", [obs("r1", "2025-01-01", 1)]);
    await sync.pushDay("2025-02-01", [obs("r1", "2025-02-01", 2)]);
    expect((await sync.pull("2025-01-15")).map((o) => o.day)).toEqual(["2025-02-01"]);
    expect(await sync.purgeBefore("2025-01-15")).toBe(1);
    expect([...store.docs.keys()]).toEqual(["2025-02-01"]);
  });
});

describe("BrowserSource", () => {
  it("warns when Advanced Security cannot find or access discovered repositories", async () => {
    const cache = newCache();
    const client = {
      listProjects: async () => [{ id: "p1", name: "Project" }],
      listRepositories: async () => [{ id: "r1", name: "Repo", projectId: "p1", isDisabled: false }],
      getEnablement: async () => null,
      listAlerts: async () => {
        throw new AdoHttpError(404, "not found");
      },
    } as unknown as AdoClient;
    const source = new BrowserSource({ organization: "contoso", cache, client, maxHistoryDays: 90 });
    const result = await source.refresh({ kind: "organization" });
    expect(result.warnings).toContain(
      "1 repositories could not be found or accessed by Advanced Security; verify repository access and that Advanced Security is available.",
    );
    const s = (await cache.getSnapshots("p1"))[0]!;
    expect(s.status).toBe("notFound");
  });

  it("never returns other projects' alerts in project scope", async () => {
    const cache = newCache();
    await cache.saveCollection(
      [snap("p1", "r1", "ok", [alert("p1", "r1", 1)]), snap("p2", "r2", "ok", [alert("p2", "r2", 2), alert("p2", "r2", 3)])],
      ["p1", "p2"],
    );
    const source = new BrowserSource({ organization: "contoso", cache, client: {} as AdoClient, maxHistoryDays: 90 });
    const filters = { projectIds: ["p2"], repositoryIds: [], kinds: [], severities: [], states: [], periodDays: 30, search: "" };
    const page = await source.getAlerts({ filters, pageSize: 50, sort: { field: "severity", direction: "desc" } } as never, { kind: "project", projectId: "p1" });
    expect(page.items.every((a) => a.projectId === "p1")).toBe(true);
    const org = await source.getAlerts({ filters: { ...filters, projectIds: [] }, pageSize: 50, sort: { field: "severity", direction: "desc" } } as never, { kind: "organization" });
    expect(org.total).toBe(3);
    expect(await source.isEmpty({ kind: "project", projectId: "p3" })).toBe(true);
  });
});
