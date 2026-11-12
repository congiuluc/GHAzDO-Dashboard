import * as SDK from "azure-devops-extension-sdk";
import { type IHostNavigationService, type ILocationService } from "azure-devops-extension-api";
import type { IConfigurableWidget, WidgetSettings } from "azure-devops-extension-api/Dashboard";
import { WidgetStatusHelper } from "./dashboardApi";
import { filtersToQuery, type DashboardScope } from "@ghazdo/shared";
import { createRoot } from "react-dom/client";
import { createContext, type AppContext } from "../data/context";
import { localContributionId, initSdk, inHost, notifyLoaded, ServiceIds } from "../sdk";
import "../theme";
import { parseWidgetConfig, widgetFilters, widgetKindFromContribution, WIDGET_TITLES, type WidgetConfig } from "./widgetConfig";
import { WidgetView } from "./WidgetView";

export const ORG_HUB_ID = "ghazdo-hub";
export const PROJECT_HUB_ID = "ghazdo-project-hub";

const root = createRoot(document.getElementById("root")!);
let kind = widgetKindFromContribution(new URLSearchParams(location.search).get("kind") ?? "");
let ctxPromise: Promise<AppContext> | undefined;

async function hubUrl(ctx: AppContext, scope: DashboardScope, hash: string): Promise<string> {
  const base = inHost ? await (await SDK.getService<ILocationService>(ServiceIds.Location)).getServiceLocation() : `${location.origin}/`;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const path = scope.kind === "project" ? `${encodeURIComponent(ctx.host.project!.name)}/_apps/hub/${ctx.host.extensionId}.${PROJECT_HUB_ID}` : `_apps/hub/${ctx.host.extensionId}.${ORG_HUB_ID}`;
  return `${prefix}${path}${hash ? `#${hash}` : ""}`;
}

async function render(settings: WidgetSettings | undefined, config: WidgetConfig) {
  const title = settings?.name || WIDGET_TITLES[kind];
  const ctx = await (ctxPromise ??= createContext());
  const scope: DashboardScope = config.scope === "project" && ctx.host.project ? { kind: "project", projectId: ctx.host.project.id } : { kind: "organization" };
  const filters = widgetFilters(config, kind);
  const baseHash = filtersToQuery({ ...filters, kinds: kind === "secrets" ? [] : filters.kinds });
  const open = (hash: string) =>
    void hubUrl(ctx, scope, hash).then(async (url) => {
      if (inHost) (await SDK.getService<IHostNavigationService>(ServiceIds.HostNavigation)).navigate(url);
      else window.open(url, "_blank", "noopener");
    });
  root.render(<WidgetView kind={kind} title={title} open={open} baseHash={baseHash} />);
  try {
    // Widgets only read already-collected data; collection runs from the hub or the backend.
    const data = await ctx.source.getDashboard(filters, scope);
    root.render(<WidgetView kind={kind} title={title} data={data} open={open} baseHash={baseHash} />);
  } catch (err) {
    root.render(<WidgetView kind={kind} title={title} error={(err as Error).message} open={open} baseHash={baseHash} />);
    throw err;
  }
}

async function show(settings: WidgetSettings) {
  try {
    await render(settings, parseWidgetConfig(settings.customSettings?.data));
    return WidgetStatusHelper.Success();
  } catch (err) {
    return WidgetStatusHelper.Failure((err as Error).message);
  }
}

const widget: IConfigurableWidget = {
  preload: async () => WidgetStatusHelper.Success(),
  load: show,
  reload: show,
};

void initSdk().then(() => {
  if (inHost) {
    const id = localContributionId();
    kind = widgetKindFromContribution(id);
    SDK.register(id, widget);
    notifyLoaded();
  } else void render(undefined, parseWidgetConfig(new URLSearchParams(location.search).get("config")));
});
