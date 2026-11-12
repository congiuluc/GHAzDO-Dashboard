import * as SDK from "azure-devops-extension-sdk";
import { type IHostNavigationService } from "azure-devops-extension-api";
import { filtersFromQuery, filtersToQuery, type Filters } from "@ghazdo/shared";
import { inHost, ServiceIds } from "./sdk";

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
