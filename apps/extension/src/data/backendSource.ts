import type { AlertPage, AlertQuery, DashboardData, DashboardScope, Filters } from "@ghazdo/shared";
import { getAccessToken, getAppToken } from "../sdk";
import type { DataSource } from "./dataSource";

export class BackendError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the Azure Functions backend with the app token plus the delegated viewer token. */
export async function backendFetch<T>(baseUrl: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const [appToken, accessToken] = await Promise.all([getAppToken(), getAccessToken()]);
  const res = await fetch(`${baseUrl}/api/${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { Authorization: `Bearer ${appToken}`, "X-ADO-Access-Token": accessToken, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "omit",
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `Backend request failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep default message */
    }
    throw new BackendError(res.status, message);
  }
  return (await res.json()) as T;
}

export class BackendSource implements DataSource {
  readonly mode = "backend" as const;
  constructor(private readonly baseUrl: string) {}

  getDashboard(filters: Filters, scope: DashboardScope): Promise<DashboardData> {
    return backendFetch(this.baseUrl, "dashboard", { body: { filters, scope } });
  }

  getAlerts(query: AlertQuery, scope: DashboardScope): Promise<AlertPage> {
    return backendFetch(this.baseUrl, "alerts", { body: { ...query, scope } });
  }

  async refresh(): Promise<{ warnings: string[] }> {
    return { warnings: [] };
  }

  async isEmpty(): Promise<boolean> {
    return false;
  }
}

export async function testBackend(baseUrl: string): Promise<{ ok: boolean; message: string }> {
  try {
    const health = await fetch(`${baseUrl}/api/health`, { cache: "no-store", credentials: "omit" });
    if (!health.ok) return { ok: false, message: `Health check failed (HTTP ${health.status}).` };
    const me = await backendFetch<{ userId: string; isCollectionAdmin: boolean }>(baseUrl, "me");
    return { ok: true, message: `Connected. Authenticated as ${me.userId}${me.isCollectionAdmin ? " (collection administrator)" : ""}.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
