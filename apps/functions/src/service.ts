import {
  aggregate,
  pageAlerts,
  retentionCutoffDay,
  sanitizeFilters,
  SORT_FIELDS,
  toSummaries,
  validateHistoryDays,
  type AlertPage,
  type DashboardData,
  type DashboardScope,
  type SortField,
} from "@ghazdo/shared";
import { AuthError, type Caller } from "./auth.js";
import { decodeCursor, encodeCursor, queryHash } from "./cursor.js";
import { loadLatestSnapshots, type Store } from "./store.js";
import { resolveViewerAccess } from "./viewer.js";

export class BadRequestError extends Error {
  readonly status = 400;
}

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function parseScope(input: unknown): DashboardScope {
  const s = (input ?? {}) as { kind?: unknown; projectId?: unknown };
  if (s.kind === "project") {
    if (typeof s.projectId !== "string" || !ID_RE.test(s.projectId)) throw new BadRequestError("Invalid project scope.");
    return { kind: "project", projectId: s.projectId };
  }
  return { kind: "organization" };
}

export interface ServiceDeps {
  store: Store;
  organization: string;
  cursorKey: string;
  now?: () => Date;
}

async function visibleSnapshots(deps: ServiceDeps, caller: Caller, scope: DashboardScope) {
  const states = await deps.store.listRepoStates();
  const access = await resolveViewerAccess(caller.viewer, states, scope);
  const snapshots = await loadLatestSnapshots(deps.store, access.allowed);
  return { snapshots, access };
}

export async function getDashboard(deps: ServiceDeps, caller: Caller, body: unknown): Promise<DashboardData> {
  const b = (body ?? {}) as { filters?: unknown; scope?: unknown };
  const cfg = await deps.store.getConfig();
  const scope = parseScope(b.scope);
  const filters = sanitizeFilters(b.filters, cfg.maxHistoryDays);
  const now = deps.now?.() ?? new Date();
  const { snapshots, access } = await visibleSnapshots(deps, caller, scope);
  const allowedRepos = new Set(access.allowed.map((s) => s.repositoryId));
  const observations = (await deps.store.listObservations(retentionCutoffDay(cfg.maxHistoryDays, now))).filter((o) => allowedRepos.has(o.repositoryId));
  return { ...aggregate({ organization: deps.organization, snapshots, observations, filters, scope, now }), unverifiedRepos: access.unverified };
}

export async function getAlerts(deps: ServiceDeps, caller: Caller, body: unknown): Promise<AlertPage> {
  const b = (body ?? {}) as { filters?: unknown; scope?: unknown; sort?: { field?: unknown; direction?: unknown }; pageSize?: unknown; cursor?: unknown };
  const cfg = await deps.store.getConfig();
  const scope = parseScope(b.scope);
  const filters = sanitizeFilters(b.filters, cfg.maxHistoryDays);
  const field: SortField = SORT_FIELDS.includes(b.sort?.field as SortField) ? (b.sort!.field as SortField) : "severity";
  const direction = b.sort?.direction === "desc" ? "desc" : "asc";
  const pageSize = Math.min(Math.max(Number(b.pageSize) || 50, 1), 200);
  const qh = queryHash({ filters, scope, field, direction, pageSize });
  let offset = 0;
  if (typeof b.cursor === "string" && b.cursor) {
    const decoded = decodeCursor(deps.cursorKey, b.cursor, caller.userId, qh);
    if (decoded === null) throw new BadRequestError("Invalid or expired cursor.");
    offset = decoded;
  }
  const { snapshots } = await visibleSnapshots(deps, caller, scope);
  const page = pageAlerts(toSummaries(deps.organization, snapshots), { filters, scope, sort: { field, direction }, offset, pageSize });
  return {
    items: page.items,
    total: page.total,
    nextCursor: page.nextOffset !== undefined ? encodeCursor(deps.cursorKey, page.nextOffset, caller.userId, qh) : undefined,
  };
}

export async function isAdmin(caller: Caller): Promise<boolean> {
  try {
    const descriptor = await caller.viewer.getSubjectDescriptor(caller.userId);
    return await caller.viewer.isCollectionAdmin(descriptor);
  } catch {
    return false;
  }
}

export async function getConfig(deps: ServiceDeps) {
  const cfg = await deps.store.getConfig();
  return { maxHistoryDays: cfg.maxHistoryDays, updatedAt: cfg.updatedAt };
}

export async function putConfig(deps: ServiceDeps, caller: Caller, body: unknown) {
  if (!(await isAdmin(caller))) throw new AuthError(403, "Only Project Collection Administrators can change settings.");
  const days = validateHistoryDays((body as { maxHistoryDays?: unknown })?.maxHistoryDays);
  if (!days.ok) throw new BadRequestError(days.error);
  const cfg = { maxHistoryDays: days.value, updatedAt: (deps.now?.() ?? new Date()).toISOString(), updatedBy: caller.userId };
  await deps.store.setConfig(cfg);
  return { maxHistoryDays: cfg.maxHistoryDays, updatedAt: cfg.updatedAt };
}
