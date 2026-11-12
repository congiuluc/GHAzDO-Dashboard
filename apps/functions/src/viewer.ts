import { mapLimit, type AdoClient, type DashboardScope } from "@ghazdo/shared";
import { AuthError } from "./auth.js";
import type { RepoState } from "./store.js";

export interface ViewerAccess {
  allowed: RepoState[];
  unverified: number;
}

/**
 * Determines, per request, which collected repositories the caller may see. Visibility is derived from the
 * caller's own delegated token: the project and repository must be listable, and the Advanced Security alerts
 * endpoint must answer for that repository. Nothing is cached across requests.
 */
export async function resolveViewerAccess(viewer: AdoClient, states: RepoState[], scope: DashboardScope, concurrency = 8): Promise<ViewerAccess> {
  const projects = await viewer.listProjects();
  const visibleProjects = new Set(projects.map((p) => p.id));
  if (scope.kind === "project" && !visibleProjects.has(scope.projectId)) throw new AuthError(403, "No access to this project.");
  const candidateProjects = scope.kind === "project" ? [scope.projectId] : [...visibleProjects];
  const collected = new Map(states.map((s) => [`${s.projectId}/${s.repositoryId}`, s]));
  const relevant = candidateProjects.filter((p) => states.some((s) => s.projectId === p));

  let unverified = 0;
  const repoLists = await mapLimit(relevant, 4, async (projectId) => {
    try {
      return await viewer.listRepositories(projectId);
    } catch {
      unverified += states.filter((s) => s.projectId === projectId).length;
      return [];
    }
  });
  const candidates = repoLists.flat().flatMap((r) => {
    const st = collected.get(`${r.projectId}/${r.id}`);
    return st ? [st] : [];
  });
  const decisions = await mapLimit(candidates, concurrency, (st) => viewer.canViewAlerts(st.projectId, st.repositoryId));
  const allowed: RepoState[] = [];
  decisions.forEach((d, i) => {
    if (d === "allowed") allowed.push(candidates[i]!);
    else if (d === "unknown") unverified++;
  });
  return { allowed, unverified };
}
