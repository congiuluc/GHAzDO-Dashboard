import * as SDK from "azure-devops-extension-sdk";
import { type IHostNavigationService, type ILocationService } from "azure-devops-extension-api";
import { filtersFromQuery, filtersToQuery, type DashboardScope, type Filters } from "@ghazdo/shared";
import { inHost, ServiceIds, type HostInfo } from "./sdk";

export interface ViewState {
  filters: Filters;
  tab: string;
}

export function encodeView(v: ViewState): string {
  const q = new URLSearchParams(filtersToQuery(v.filters));
  if (v.tab !== "overview") q.set("tab", v.tab);
  return q.toString();
}

export function decodeView(hash: string, maxDays: number, tabs: readonly string[]): ViewState {
  const clean = hash.replace(/^#/, "");
  const tab = new URLSearchParams(clean).get("tab") ?? "overview";
  return { filters: filtersFromQuery(clean, maxDays), tab: tabs.includes(tab) ? tab : "overview" };
}

let nav: Promise<IHostNavigationService> | undefined;
const navService = () => (nav ??= SDK.getService<IHostNavigationService>(ServiceIds.HostNavigation));

/** Reads/writes the view state in the host page URL hash so filtered views are shareable and survive reloads. */
export async function readHash(): Promise<string> {
  return inHost ? (await navService()).getHash() : window.location.hash;
}

export async function writeHash(hash: string): Promise<void> {
  if (inHost) (await navService()).setHash(hash);
  else history.replaceState(null, "", `#${hash}`);
}

export async function onHashChange(cb: (hash: string) => void): Promise<void> {
  if (inHost) (await navService()).onHashChanged(cb);
  else window.addEventListener("hashchange", () => cb(window.location.hash));
}

/** Builds the addressable hub URL used by both dashboard widgets and saved-view sharing. */
export async function dashboardUrl(host: HostInfo, scope: DashboardScope, hash: string): Promise<string> {
  const base = inHost ? await (await SDK.getService<ILocationService>(ServiceIds.Location)).getServiceLocation() : `${location.origin}/`;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const path =
    scope.kind === "project"
      ? `${encodeURIComponent(host.project?.name ?? "Project")}/_apps/hub/${host.extensionId}.ghazdo-project-hub`
      : `_apps/hub/${host.extensionId}.ghazdo-hub`;
  return `${prefix}${path}${hash ? `#${hash}` : ""}`;
}
