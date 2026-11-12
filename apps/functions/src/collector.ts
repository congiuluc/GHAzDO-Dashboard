import { randomUUID } from "node:crypto";
import { collectRepository, mapLimit, retentionCutoffDay, type AdoClient } from "@ghazdo/shared";
import { publishResult, type Store } from "./store.js";

export interface CollectMessage {
  runId: string;
  projectId: string;
  projectName: string;
  repositoryId: string;
  repositoryName: string;
  isDisabled: boolean;
}

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function parseCollectMessage(input: unknown): CollectMessage | null {
  const m = (typeof input === "string" ? JSON.parse(input) : input) as Partial<CollectMessage> | null;
  if (!m || typeof m !== "object") return null;
  for (const k of ["runId", "projectId", "repositoryId"] as const) if (typeof m[k] !== "string" || !ID_RE.test(m[k])) return null;
  return {
    runId: m.runId!,
    projectId: m.projectId!,
    repositoryId: m.repositoryId!,
    projectName: typeof m.projectName === "string" ? m.projectName.slice(0, 256) : m.projectId!,
    repositoryName: typeof m.repositoryName === "string" ? m.repositoryName.slice(0, 256) : m.repositoryId!,
    isDisabled: m.isDisabled === true,
  };
}

/** Discovers every repository visible to the collector identity and produces one work item per repository. */
export async function planRun(client: AdoClient, store: Store, trigger: "timer" | "manual", now = new Date()): Promise<CollectMessage[]> {
  const runId = `${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const projects = await client.listProjects();
  const repos = (await mapLimit(projects, 4, async (p) => (await client.listRepositories(p.id)).map((r) => ({ p, r })))).flat();
  const messages = repos.map(({ p, r }) => ({ runId, projectId: p.id, projectName: p.name, repositoryId: r.id, repositoryName: r.name, isDisabled: r.isDisabled }));

  // Repositories deleted (or no longer visible) are removed from the dashboard; their blobs age out via retention.
  const live = new Set(messages.map((m) => `${m.projectId}/${m.repositoryId}`));
  for (const s of await store.listRepoStates()) {
    if (!live.has(`${s.projectId}/${s.repositoryId}`)) await store.deleteRepoState(s.projectId, s.repositoryId);
  }
  await store.putRun({ runId, startedAt: now.toISOString(), trigger, repositories: messages.length });
  return messages;
}

export async function collectOne(client: AdoClient, store: Store, msg: CollectMessage): Promise<void> {
  const snapshot = await collectRepository(
    client,
    { id: msg.projectId, name: msg.projectName },
    { id: msg.repositoryId, name: msg.repositoryName, projectId: msg.projectId, isDisabled: msg.isDisabled },
  );
  await publishResult(store, snapshot, msg.runId);
}

/** Deletes expired observations and non-current snapshots older than the configured history window. */
export async function runRetention(store: Store, now = new Date()): Promise<{ observations: number; snapshots: number }> {
  const { maxHistoryDays } = await store.getConfig();
  const cutoff = retentionCutoffDay(maxHistoryDays, now);
  const observations = await store.deleteObservationsBefore(cutoff);
  let snapshots = 0;
  for (const s of await store.listRepoStates()) {
    for (const b of await store.listSnapshotRefs(s.projectId, s.repositoryId)) {
      if (b.ref !== s.snapshotRef && b.createdAt.slice(0, 10) < cutoff) {
        await store.deleteSnapshot(b.ref);
        snapshots++;
      }
    }
  }
  return { observations, snapshots };
}
