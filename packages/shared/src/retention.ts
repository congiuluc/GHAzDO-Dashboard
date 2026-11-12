import type { AlertKind, AlertState, CountKey, DailyObservation, RepoSnapshot, Severity } from "./types.js";

const DAY_MS = 86_400_000;

export function utcDay(date: Date | string | number): string {
  return new Date(date).toISOString().slice(0, 10);
}

/** Oldest UTC day kept: observations on days strictly before this are expired. */
export function retentionCutoffDay(maxHistoryDays: number, now: Date = new Date()): string {
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return utcDay(startOfToday - (maxHistoryDays - 1) * DAY_MS);
}

export function isExpired(day: string, maxHistoryDays: number, now: Date = new Date()): boolean {
  return day < retentionCutoffDay(maxHistoryDays, now);
}

export function countKey(kind: AlertKind, severity: Severity, state: AlertState): CountKey {
  return `${kind}|${severity}|${state}`;
}

export function parseCountKey(key: string): { kind: AlertKind; severity: Severity; state: AlertState } {
  const [kind, severity, state] = key.split("|") as [AlertKind, Severity, AlertState];
  return { kind, severity, state };
}

/** Builds the daily observation for a successful snapshot; failed snapshots never produce observations. */
export function observationFromSnapshot(s: RepoSnapshot): DailyObservation | null {
  if (s.status !== "ok" || s.stale) return null;
  const counts: Partial<Record<CountKey, number>> = {};
  for (const a of s.alerts) {
    const k = countKey(a.kind, a.severity, a.state);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return {
    day: utcDay(s.collectedAt),
    projectId: s.projectId,
    repositoryId: s.repositoryId,
    observedAt: s.collectedAt,
    counts,
    coverage: {
      code: s.enablement?.code ?? null,
      dependency: s.enablement?.dependency ?? null,
      secret: s.enablement?.secret ?? null,
    },
  };
}

/** Keeps only the latest observation per repository per UTC day. */
export function mergeObservation(existing: DailyObservation | undefined, next: DailyObservation): DailyObservation {
  if (!existing) return next;
  return next.observedAt >= existing.observedAt ? next : existing;
}

export function lastNDays(n: number, now: Date = new Date()): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: n }, (_, i) => utcDay(end - (n - 1 - i) * DAY_MS));
}
