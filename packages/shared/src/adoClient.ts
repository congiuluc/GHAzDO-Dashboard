import { dedupeAlerts, normalizeAlert, type RawAlert } from "./normalize.js";
import type { Enablement, NormalizedAlert, RepoSnapshot } from "./types.js";

export class AdoHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdoHttpError";
  }
}

const ORG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const MAX_PAGES = 2000;

export function assertOrganization(org: string): string {
  if (!ORG_RE.test(org)) throw new Error("Invalid Azure DevOps organization name.");
  return org;
}

function assertId(id: string, what: string): string {
  if (!ID_RE.test(id)) throw new Error(`Invalid ${what} identifier.`);
  return encodeURIComponent(id);
}

export interface AdoClientOptions {
  organization: string;
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Authorization scheme; Azure DevOps accepts Bearer for both extension and Entra tokens. */
  scheme?: "Bearer";
}

export interface AdoProject {
  id: string;
  name: string;
}

export interface AdoRepository {
  id: string;
  name: string;
  projectId: string;
  isDisabled: boolean;
}

/** Read-only client pinned to the configured organization and the fixed Azure DevOps hosts. */
export class AdoClient {
  readonly organization: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: AdoClientOptions) {
    this.organization = assertOrganization(options.organization);
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
    this.maxRetries = options.maxRetries ?? 4;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private get org(): string {
    return encodeURIComponent(this.organization);
  }

  /** Performs a GET with capped retries honoring Retry-After for throttling and transient failures. */
  async request(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.options.getToken();
      let res: Response;
      try {
        res = await this.fetchFn(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      } catch (err) {
        if (attempt >= this.maxRetries) throw new AdoHttpError(0, `Network error: ${(err as Error).message}`);
        await this.sleep(this.backoff(attempt));
        continue;
      }
      if (res.ok) return res;
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= this.maxRetries) {
        throw new AdoHttpError(res.status, `Azure DevOps request failed with HTTP ${res.status}.`);
      }
      const retryAfter = Number(res.headers.get("Retry-After"));
      await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : this.backoff(attempt));
    }
  }

  private backoff(attempt: number): number {
    return Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
  }

  private async json<T>(url: string): Promise<{ body: T; continuation: string | null }> {
    const res = await this.request(url);
    const body = (await res.json()) as T;
    return { body, continuation: res.headers.get("x-ms-continuationtoken") };
  }

  /** Follows continuation tokens until exhausted; guards against loops. */
  private async paged<T>(buildUrl: (continuation?: string) => string): Promise<T[]> {
    const items: T[] = [];
    const seen = new Set<string>();
    let continuation: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { body, continuation: next } = await this.json<{ value?: T[] } | T[]>(buildUrl(continuation));
      const value = Array.isArray(body) ? body : (body.value ?? []);
      items.push(...value);
      if (!next) return items;
      if (seen.has(next)) throw new AdoHttpError(0, "Pagination loop detected.");
      seen.add(next);
      continuation = next;
    }
    throw new AdoHttpError(0, "Too many pages.");
  }

  async listProjects(): Promise<AdoProject[]> {
    const raw = await this.paged<{ id: string; name: string; state?: string }>(
      (c) =>
        `https://dev.azure.com/${this.org}/_apis/projects?api-version=7.1&$top=500&stateFilter=wellFormed${c ? `&continuationToken=${encodeURIComponent(c)}` : ""}`,
    );
    return raw.filter((p) => p && ID_RE.test(p.id)).map((p) => ({ id: p.id, name: p.name }));
  }

  async listRepositories(projectId: string): Promise<AdoRepository[]> {
    const { body } = await this.json<{ value?: { id: string; name: string; isDisabled?: boolean; project?: { id: string } }[] }>(
      `https://dev.azure.com/${this.org}/${assertId(projectId, "project")}/_apis/git/repositories?api-version=7.1`,
    );
    return (body.value ?? [])
      .filter((r) => r && ID_RE.test(r.id))
      .map((r) => ({ id: r.id, name: r.name, projectId: r.project?.id ?? projectId, isDisabled: r.isDisabled === true }));
  }

  /** Read-only enablement probe (vso.advsec). Returns null when it can't be determined. */
  async getEnablement(projectId: string, repositoryId: string): Promise<Enablement | null> {
    try {
      const { body } = await this.json<{
        codeSecurityFeatures?: { codeSecurityEnabled?: boolean; dependencyScanningInjectionEnabled?: boolean };
        secretProtectionFeatures?: { secretProtectionEnabled?: boolean };
      }>(
        `https://advsec.dev.azure.com/${this.org}/${assertId(projectId, "project")}/_apis/management/repositories/${assertId(repositoryId, "repository")}/enablement?api-version=7.2-preview.3`,
      );
      const code = typeof body.codeSecurityFeatures?.codeSecurityEnabled === "boolean" ? body.codeSecurityFeatures.codeSecurityEnabled : null;
      const secret =
        typeof body.secretProtectionFeatures?.secretProtectionEnabled === "boolean" ? body.secretProtectionFeatures.secretProtectionEnabled : null;
      // Dependency scanning is part of Code Security.
      return { code, dependency: code, secret };
    } catch (err) {
      if (err instanceof AdoHttpError && (err.status === 401 || err.status === 403 || err.status === 404)) return null;
      throw err;
    }
  }

  alertsUrl(projectId: string, repositoryId: string, extra: string, continuation?: string): string {
    return (
      `https://advsec.dev.azure.com/${this.org}/${assertId(projectId, "project")}/_apis/alert/repositories/${assertId(repositoryId, "repository")}/alerts` +
      `?api-version=7.2-preview.1${extra}${continuation ? `&continuationToken=${encodeURIComponent(continuation)}` : ""}`
    );
  }

  /** All alert types and states on all branches, including non-high-confidence secrets. */
  async listAlerts(projectId: string, repositoryId: string): Promise<RawAlert[]> {
    const allBranches = await this.paged<RawAlert>((c) =>
      this.alertsUrl(projectId, repositoryId, "&top=500&criteria.onlyDefaultBranch=false", c),
    );
    let alerts = allBranches.filter((a) => a.alertType?.toLowerCase() !== "secret");
    // Combined confidence levels can return no alerts. Query secrets separately, without branch filters.
    for (const confidence of ["high", "other"]) {
      const extra = `&top=500&criteria.alertType=secret&criteria.confidenceLevels=${confidence}`;
      alerts = alerts.concat(await this.paged<RawAlert>((c) => this.alertsUrl(projectId, repositoryId, extra, c)));
    }
    return alerts;
  }

  /** Probes whether the token's identity may view alerts for a repository. */
  async canViewAlerts(projectId: string, repositoryId: string): Promise<"allowed" | "denied" | "unknown"> {
    try {
      await this.request(this.alertsUrl(projectId, repositoryId, "&top=1"));
      return "allowed";
    } catch (err) {
      if (err instanceof AdoHttpError && [401, 403, 404].includes(err.status)) return "denied";
      return "unknown";
    }
  }

  async getConnectionData(): Promise<{ id: string; descriptor?: string }> {
    const { body } = await this.json<{ authenticatedUser?: { id?: string; descriptor?: string } }>(
      `https://dev.azure.com/${this.org}/_apis/connectionData`,
    );
    const id = body.authenticatedUser?.id;
    if (!id || !ID_RE.test(id)) throw new AdoHttpError(401, "Could not resolve the authenticated user.");
    return { id, descriptor: body.authenticatedUser?.descriptor };
  }

  /** Subject descriptor for a user storage key (identity id). */
  async getSubjectDescriptor(userId: string): Promise<string> {
    const { body } = await this.json<{ value?: string }>(
      `https://vssps.dev.azure.com/${this.org}/_apis/graph/descriptors/${assertId(userId, "user")}?api-version=7.1-preview.1`,
    );
    if (!body.value) throw new AdoHttpError(404, "Descriptor not found.");
    return body.value;
  }

  /**
   * True when the user is (transitively) a member of Project Collection Administrators.
   * Uses read-only Graph APIs (vso.graph). Fails closed on any error.
   */
  async isCollectionAdmin(subjectDescriptor: string): Promise<boolean> {
    try {
      const target = `[${this.organization}]\\project collection administrators`.toLowerCase();
      const groups = await this.paged<{ descriptor: string; principalName?: string }>(
        (c) =>
          `https://vssps.dev.azure.com/${this.org}/_apis/graph/groups?api-version=7.1-preview.1${c ? `&continuationToken=${encodeURIComponent(c)}` : ""}`,
      );
      const pca = groups.find((g) => g.principalName?.toLowerCase() === target)?.descriptor;
      if (!pca) return false;
      const visited = new Set<string>();
      let frontier = [subjectDescriptor];
      for (let depth = 0; depth < 5 && frontier.length && visited.size < 200; depth++) {
        const next: string[] = [];
        for (const d of frontier) {
          if (visited.has(d)) continue;
          visited.add(d);
          const { body } = await this.json<{ value?: { containerDescriptor: string }[] }>(
            `https://vssps.dev.azure.com/${this.org}/_apis/graph/memberships/${encodeURIComponent(d)}?direction=up&api-version=7.1-preview.1`,
          );
          for (const m of body.value ?? []) {
            if (m.containerDescriptor === pca) return true;
            next.push(m.containerDescriptor);
          }
        }
        frontier = next;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Collects one repository snapshot. Failures are recorded truthfully, never as zero alerts. */
export async function collectRepository(
  client: AdoClient,
  project: AdoProject,
  repo: AdoRepository,
  now: () => Date = () => new Date(),
): Promise<RepoSnapshot> {
  const base = {
    projectId: project.id,
    projectName: project.name,
    repositoryId: repo.id,
    repositoryName: repo.name,
    collectedAt: now().toISOString(),
    alerts: [] as NormalizedAlert[],
  };
  if (repo.isDisabled) return { ...base, status: "disabled" };
  let enablement: Enablement | null = null;
  try {
    enablement = await client.getEnablement(project.id, repo.id);
  } catch {
    enablement = null;
  }
  if (enablement && enablement.code === false && enablement.secret === false) {
    return { ...base, status: "disabled", enablement };
  }
  try {
    const raw = await client.listAlerts(project.id, repo.id);
    const alerts = dedupeAlerts(
      raw.map((a) => normalizeAlert(a, project.id, repo.id, client.organization)).filter((a): a is NormalizedAlert => a !== null),
    );
    return { ...base, collectedAt: now().toISOString(), status: "ok", enablement: enablement ?? undefined, alerts };
  } catch (err) {
    const status = err instanceof AdoHttpError ? err.status : 0;
    if (status === 401 || status === 403) return { ...base, status: "denied", enablement: enablement ?? undefined };
    if (status === 404) return { ...base, status: "notFound", enablement: enablement ?? undefined };
    return { ...base, status: "failed", error: (err as Error).message.slice(0, 200), enablement: enablement ?? undefined };
  }
}

export interface CollectProgress {
  done: number;
  total: number;
}

/** Discovers projects/repositories visible to the token and collects every repository. */
export async function collectAll(
  client: AdoClient,
  options: { projectIds?: string[]; concurrency?: number; onProgress?: (p: CollectProgress) => void } = {},
): Promise<{ snapshots: RepoSnapshot[]; projects: AdoProject[]; errors: string[] }> {
  const errors: string[] = [];
  let projects = await client.listProjects();
  if (options.projectIds?.length) projects = projects.filter((p) => options.projectIds!.includes(p.id));
  const repoLists = await mapLimit(projects, 4, async (p) => {
    try {
      return (await client.listRepositories(p.id)).map((r) => ({ project: p, repo: r }));
    } catch (err) {
      errors.push(`Could not list repositories for project ${p.name}: ${(err as Error).message}`);
      return [];
    }
  });
  const work = repoLists.flat();
  let done = 0;
  options.onProgress?.({ done, total: work.length });
  const snapshots = await mapLimit(work, options.concurrency ?? 6, async ({ project, repo }) => {
    const s = await collectRepository(client, project, repo);
    options.onProgress?.({ done: ++done, total: work.length });
    return s;
  });
  return { snapshots, projects, errors };
}
