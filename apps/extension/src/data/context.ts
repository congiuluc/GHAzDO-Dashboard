import * as SDK from "azure-devops-extension-sdk";
import { type IExtensionDataManager, type IExtensionDataService } from "azure-devops-extension-api";
import { AdoClient, DEFAULT_SETTINGS, parseSettings, validateBackendUrl, type DashboardSettings } from "@ghazdo/shared";
import { getAccessToken, hostInfo, inHost, ServiceIds, type HostInfo } from "../sdk";
import { backendFetch, BackendSource } from "./backendSource";
import { BrowserSource } from "./browserSource";
import type { DataSource } from "./dataSource";
import { FixtureSource } from "./fixtureSource";
import { LocalCache } from "./localCache";
import { UserHistorySync, type DocumentStore } from "./userHistory";

const SETTINGS_KEY = "dashboard-settings";
const OPT_IN_KEY = "user-history-opt-in";

/** Backend origins allowed at build time (comma-separated). Prevents tokens being sent to arbitrary hosts. */
export const BACKEND_ALLOWLIST: string[] = (import.meta.env.VITE_BACKEND_ALLOWLIST ?? "")
  .split(",")
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);

let managerPromise: Promise<IExtensionDataManager> | undefined;
export function dataManager(): Promise<IExtensionDataManager> {
  managerPromise ??= (async () => {
    const service = await SDK.getService<IExtensionDataService>(ServiceIds.ExtensionData);
    return service.getExtensionDataManager(SDK.getExtensionContext().id, await getAccessToken());
  })();
  return managerPromise;
}

export async function loadSettings(): Promise<DashboardSettings> {
  if (!inHost) return { ...DEFAULT_SETTINGS };
  const raw = await (await dataManager()).getValue<unknown>(SETTINGS_KEY, { scopeType: "Default", defaultValue: null });
  return { ...parseSettings(raw), digestRecipients: [] };
}

export async function saveSettings(settings: DashboardSettings): Promise<void> {
  const manager = await dataManager();
  const previous = parseSettings(await manager.getValue<unknown>(SETTINGS_KEY, { scopeType: "Default", defaultValue: null }));
  const url = validateBackendUrl(settings.backendUrl, BACKEND_ALLOWLIST);
  if (url.ok && url.value) {
    await backendFetch(url.value, "config", {
      method: "PUT",
      body: {
        maxHistoryDays: settings.maxHistoryDays,
        slaDays: settings.slaDays,
        ...(previous.backendUrl === settings.backendUrl ? { digestRecipients: settings.digestRecipients } : {}),
      },
    });
  } else if (settings.digestRecipients.length) {
    throw new Error("Weekly digest recipients can only be saved when a shared backend is configured.");
  }
  await manager.setValue(SETTINGS_KEY, { ...settings, digestRecipients: [] }, { scopeType: "Default" });
}

export async function getUserOptIn(): Promise<boolean> {
  if (!inHost) return false;
  return (await (await dataManager()).getValue<boolean>(OPT_IN_KEY, { scopeType: "User", defaultValue: false })) === true;
}

export async function setUserOptIn(value: boolean): Promise<void> {
  await (await dataManager()).setValue(OPT_IN_KEY, value, { scopeType: "User" });
}

export function adoClient(organization: string): AdoClient {
  return new AdoClient({ organization, getToken: getAccessToken });
}

/** Checks Project Collection Administrator membership with the viewer's own token. Fails closed. */
export async function isCollectionAdmin(host: HostInfo): Promise<boolean> {
  if (!inHost) return true;
  try {
    const client = adoClient(host.organization);
    const descriptor = host.user.descriptor || (await client.getSubjectDescriptor(host.user.id));
    return await client.isCollectionAdmin(descriptor);
  } catch {
    return false;
  }
}

export interface AppContext {
  host: HostInfo;
  settings: DashboardSettings;
  source: DataSource;
  backendUrl?: string;
  warnings: string[];
  userHistoryEnabled: boolean;
  cache?: LocalCache;
}

export async function createContext(): Promise<AppContext> {
  const host = hostInfo();
  if (!inHost) {
    return { host, settings: { ...DEFAULT_SETTINGS }, source: new FixtureSource(), warnings: ["Running outside Azure DevOps with sample data."], userHistoryEnabled: false };
  }
  const warnings: string[] = [];
  let settings = { ...DEFAULT_SETTINGS };
  try {
    settings = await loadSettings();
  } catch (err) {
    warnings.push(`Could not load dashboard settings; using defaults. ${(err as Error).message}`);
  }
  const url = validateBackendUrl(settings.backendUrl, BACKEND_ALLOWLIST);
  if (url.ok && url.value) {
    return { host, settings, source: new BackendSource(url.value), backendUrl: url.value, warnings, userHistoryEnabled: false };
  }
  if (!url.ok) warnings.push(`The configured backend URL was rejected (${url.error}). Falling back to browser-only mode.`);
  const cache = new LocalCache(host.organization, host.user.id);
  let userHistory: UserHistorySync | undefined;
  if (settings.allowUserHistoryInAdo && (await getUserOptIn().catch(() => false))) {
    userHistory = new UserHistorySync((await dataManager()) as unknown as DocumentStore, host.organization);
  }
  const source = new BrowserSource({
    organization: host.organization,
    cache,
    client: adoClient(host.organization),
    maxHistoryDays: settings.maxHistoryDays,
    slaDays: settings.slaDays,
    userHistory,
  });
  return { host, settings, source, warnings, userHistoryEnabled: !!userHistory, cache };
}
