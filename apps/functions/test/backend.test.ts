import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { AdoClient, type NormalizedAlert, type RepoSnapshot } from "@ghazdo/shared";
import { authenticate, AuthError, type Caller } from "../src/auth.js";
import { collectOne, runRetention } from "../src/collector.js";
import { decodeCursor, encodeCursor } from "../src/cursor.js";
import { getAlerts, getDashboard, putConfig } from "../src/service.js";
import { loadLatestSnapshots, MemoryStore, publishResult } from "../src/store.js";

const SECRET = "extension-secret-for-tests";
const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CURSOR_KEY = "k".repeat(40);

function res(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Fake Azure DevOps where each viewer token sees a different set of projects/repositories. */
function fakeAdo(token: string, visible: Record<string, string[]>, userId: string): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== `Bearer ${token}`) return res({}, 401);
    if (url.includes("/_apis/connectionData")) return res({ authenticatedUser: { id: userId } });
    if (url.includes("/_apis/projects")) return res({ value: Object.keys(visible).map((id) => ({ id, name: id.toUpperCase() })) });
    const repoList = /dev\.azure\.com\/contoso\/([^/]+)\/_apis\/git\/repositories/.exec(url);
    if (repoList) return res({ value: (visible[repoList[1]!] ?? []).map((id) => ({ id, name: `${id}-name`, project: { id: repoList[1] } })) });
    const alerts = /advsec\.dev\.azure\.com\/contoso\/([^/]+)\/_apis\/alert\/repositories\/([^/]+)\/alerts/.exec(url);
    if (alerts) return visible[alerts[1]!]?.includes(alerts[2]!) ? res({ value: [] }) : res({}, 403);
    if (url.includes("/graph/")) return res({}, 403);
    return res({}, 404);
  }) as unknown as typeof fetch;
}

function caller(userId: string, visible: Record<string, string[]>): Caller {
  return { userId, viewer: new AdoClient({ organization: "contoso", getToken: async () => `tok-${userId}`, fetchFn: fakeAdo(`tok-${userId}`, visible, userId) }) };
}

function alert(p: string, r: string, id: number, over: Partial<NormalizedAlert> = {}): NormalizedAlert {
  return { key: `contoso/${p}/${r}/${id}`, alertId: id, projectId: p, repositoryId: r, kind: "secret", rawType: "secret", severity: "high", rawSeverity: "high", state: "active", rawState: "active", title: `T${id}`, ...over };
}

function snap(p: string, r: string, alerts: NormalizedAlert[], status: RepoSnapshot["status"] = "ok"): RepoSnapshot {
  return { projectId: p, projectName: p.toUpperCase(), repositoryId: r, repositoryName: `${r}-name`, collectedAt: new Date().toISOString(), status, alerts };
}

async function seededStore() {
  const store = new MemoryStore();
  await publishResult(store, snap("p1", "r1", [alert("p1", "r1", 1), alert("p1", "r1", 2)]), "run1");
  await publishResult(store, snap("p2", "r2", [alert("p2", "r2", 3)]), "run1");
  return store;
}

describe("authenticate", () => {
  const token = (sub: string, secret = SECRET) =>
    new SignJWT({ nameid: sub }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(new TextEncoder().encode(secret));
  const headers = (h: Record<string, string>) => new Headers(h);

  it("binds the app token identity to the viewer token identity", async () => {
    const c = await authenticate(headers({ authorization: `Bearer ${await token(ALICE)}`, "x-ado-access-token": "tok-a" }), {
      organization: "contoso",
      extensionSecret: SECRET,
      fetchFn: fakeAdo("tok-a", {}, ALICE),
    });
    expect(c.userId).toBe(ALICE);
  });

  it("rejects mismatched identities, bad signatures and missing tokens", async () => {
    const opts = { organization: "contoso", extensionSecret: SECRET, fetchFn: fakeAdo("tok-b", {}, BOB) };
    await expect(authenticate(headers({ authorization: `Bearer ${await token(ALICE)}`, "x-ado-access-token": "tok-b" }), opts)).rejects.toThrow(/mismatch/);
    await expect(authenticate(headers({ authorization: `Bearer ${await token(BOB, "wrong-secret-value")}`, "x-ado-access-token": "tok-b" }), opts)).rejects.toBeInstanceOf(AuthError);
    await expect(authenticate(headers({}), opts)).rejects.toThrow(/Missing/);
  });
});

describe("cursor", () => {
  it("rejects tampering, other users, other queries and expiry", () => {
    const c = encodeCursor(CURSOR_KEY, 50, ALICE, "q", 60, 1_000_000);
    expect(decodeCursor(CURSOR_KEY, c, ALICE, "q", 1_000_000)).toBe(50);
    expect(decodeCursor(CURSOR_KEY, c, BOB, "q", 1_000_000)).toBeNull();
    expect(decodeCursor(CURSOR_KEY, c, ALICE, "other", 1_000_000)).toBeNull();
    expect(decodeCursor(CURSOR_KEY, c, ALICE, "q", 1_000_000 + 61_000)).toBeNull();
    const sig = c.split(".")[1];
    const forged = `${Buffer.from(JSON.stringify({ offset: 0, user: ALICE, query: "q", exp: 9e9 })).toString("base64url")}.${sig}`;
    expect(decodeCursor(CURSOR_KEY, forged, ALICE, "q", 1_000_000)).toBeNull();
  });
});

describe("service authorization", () => {
  it("never returns alerts from repositories the viewer cannot access", async () => {
    const store = await seededStore();
    const deps = { store, organization: "contoso", cursorKey: CURSOR_KEY };
    const alice = caller(ALICE, { p1: ["r1"] });
    const bob = caller(BOB, { p2: ["r2"] });
    const a = await getDashboard(deps, alice, {});
    const b = await getDashboard(deps, bob, {});
    expect(a.kpis.open).toBe(2);
    expect(b.kpis.open).toBe(1);
    expect(b.filterOptions.projects.map((p) => p.id)).toEqual(["p2"]);
    const page = await getAlerts(deps, bob, { filters: { projectIds: ["p1"] } });
    expect(page.total).toBe(0);
  });

  it("enforces project scope against viewer access", async () => {
    const store = await seededStore();
    const deps = { store, organization: "contoso", cursorKey: CURSOR_KEY };
    await expect(getDashboard(deps, caller(BOB, { p2: ["r2"] }), { scope: { kind: "project", projectId: "p1" } })).rejects.toMatchObject({ status: 403 });
    const d = await getDashboard(deps, caller(ALICE, { p1: ["r1"], p2: ["r2"] }), { scope: { kind: "project", projectId: "p2" } });
    expect(d.kpis.open).toBe(1);
  });

  it("paginates with signed cursors bound to the user", async () => {
    const store = await seededStore();
    const deps = { store, organization: "contoso", cursorKey: CURSOR_KEY };
    const alice = caller(ALICE, { p1: ["r1"] });
    const first = await getAlerts(deps, alice, { pageSize: 1 });
    expect(first.items).toHaveLength(1);
    const second = await getAlerts(deps, alice, { pageSize: 1, cursor: first.nextCursor });
    expect(second.items[0]!.key).not.toBe(first.items[0]!.key);
    await expect(getAlerts(deps, caller(BOB, { p1: ["r1"] }), { pageSize: 1, cursor: first.nextCursor })).rejects.toThrow(/cursor/);
  });

  it("only lets collection administrators change config", async () => {
    const deps = { store: new MemoryStore(), organization: "contoso", cursorKey: CURSOR_KEY };
    await expect(putConfig(deps, caller(ALICE, {}), { maxHistoryDays: 30 })).rejects.toMatchObject({ status: 403 });
  });
});

describe("collector", () => {
  it("keeps the previous snapshot as stale when a collection fails", async () => {
    const store = await seededStore();
    const failing = new AdoClient({ organization: "contoso", getToken: async () => "mi", fetchFn: (async () => res({}, 500)) as unknown as typeof fetch, maxRetries: 0 });
    await collectOne(failing, store, { runId: "run2", projectId: "p1", projectName: "P1", repositoryId: "r1", repositoryName: "r1-name", isDisabled: false });
    const [s] = await loadLatestSnapshots(store, [(await store.getRepoState("p1", "r1"))!]);
    expect(s).toMatchObject({ status: "ok", stale: true });
    expect(s!.alerts).toHaveLength(2);
  });

  it("purges expired observations and old non-current snapshots", async () => {
    const store = await seededStore();
    store.config.maxHistoryDays = 1;
    await store.upsertObservation({ day: "2000-01-01", projectId: "p1", repositoryId: "r1", observedAt: "2000-01-01T00:00:00Z", counts: {} });
    store.blobs.set("snapshots/p1/r1/old.json.gz", { snapshot: snap("p1", "r1", []), createdAt: "2000-01-01T00:00:00Z" });
    const result = await runRetention(store);
    expect(result).toEqual({ observations: 1, snapshots: 1 });
    expect(store.blobs.has((await store.getRepoState("p1", "r1"))!.snapshotRef!)).toBe(true);
  });
});
