import type { AlertPage, AlertQuery, DashboardData, DashboardScope, Filters } from "@ghazdo/shared";

export type DataMode = "backend" | "browser" | "fixture";

export interface RefreshProgress {
  done: number;
  total: number;
}

export interface DataSource {
  readonly mode: DataMode;
  getDashboard(filters: Filters, scope: DashboardScope): Promise<DashboardData>;
  getAlerts(query: AlertQuery, scope: DashboardScope): Promise<AlertPage>;
  /** Browser mode: collects fresh data with the viewer token. Backend mode: reloads published data. */
  refresh(scope: DashboardScope, onProgress?: (p: RefreshProgress) => void): Promise<{ warnings: string[] }>;
  /** True when no collected data exists yet for this scope. */
  isEmpty(scope: DashboardScope): Promise<boolean>;
}
