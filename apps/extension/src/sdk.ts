import * as SDK from "azure-devops-extension-sdk";

export const inHost = typeof window !== "undefined" && window.parent !== window;

let initPromise: Promise<void> | undefined;

/** Initializes the SDK once. Outside Azure DevOps (local dev) this resolves immediately. */
export function initSdk(): Promise<void> {
  // applyTheme copies the host theme (light, dark, high contrast) into CSS variables that
  // azure-devops-ui and styles.css consume; outside the host their light defaults apply.
  initPromise ??= inHost ? SDK.init({ loaded: false, applyTheme: true }).then(() => SDK.ready()) : Promise.resolve();
  return initPromise;
}

export function notifyLoaded(): void {
  if (inHost) void SDK.notifyLoadSucceeded();
}

export interface HostInfo {
  organization: string;
  user: { id: string; descriptor: string; displayName: string };
  project?: { id: string; name: string };
  extensionId: string;
}

export function hostInfo(): HostInfo {
  if (!inHost) {
    return { organization: "sample-org", user: { id: "00000000-0000-0000-0000-000000000001", descriptor: "", displayName: "Developer" }, project: undefined, extensionId: "dev.ghazdo" };
  }
  const user = SDK.getUser();
  const web = SDK.getWebContext();
  return {
    organization: SDK.getHost().name,
    user: { id: user.id, descriptor: user.descriptor, displayName: user.displayName },
    project: web.project ? { id: web.project.id, name: web.project.name } : undefined,
    extensionId: SDK.getExtensionContext().id,
  };
}

export const getAccessToken = (): Promise<string> => (inHost ? SDK.getAccessToken() : Promise.resolve(""));
export const getAppToken = (): Promise<string> => (inHost ? SDK.getAppToken() : Promise.resolve(""));

/** Dashboard object registrations use the manifest-local id, not publisher.extension.id. */
export function localContributionId(): string {
  if (!inHost) return "";
  const id = SDK.getContributionId();
  const prefix = `${SDK.getExtensionContext().id}.`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** Host service ids. The SDK exposes these as an ambient const enum, which isolatedModules cannot inline. */
export const ServiceIds = {
  ExtensionData: "ms.vss-features.extension-data-service",
  HostNavigation: "ms.vss-features.host-navigation-service",
  Location: "ms.vss-features.location-service",
} as const;
