import * as SDK from "azure-devops-extension-sdk";
import type { IWidgetConfiguration, IWidgetConfigurationContext, WidgetSettings } from "azure-devops-extension-api/Dashboard";
import { ConfigurationEvent, WidgetConfigurationSave, WidgetStatusHelper } from "./dashboardApi";
import { ALERT_KINDS, DEFAULT_FILTERS, type AlertKind, type DashboardData } from "@ghazdo/shared";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { FormItem } from "azure-devops-ui/FormItem";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { MultiSelect, SingleSelect } from "../components/FilterBar";
import { createContext } from "../data/context";
import { contributionId, initSdk, inHost, notifyLoaded } from "../sdk";
import "../theme";
import { DEFAULT_WIDGET_CONFIG, parseWidgetConfig, type WidgetConfig } from "./widgetConfig";

const KIND_LABELS: Record<AlertKind, string> = { code: "Code scanning", dependency: "Dependencies", secret: "Secrets", other: "Other" };
const kindOptions = ALERT_KINDS.map((k) => ({ id: k, label: KIND_LABELS[k] }));
const ORG_SCOPE = { id: "organization", label: "All projects I can access" };
const PROJECT_SCOPE = { id: "project", label: "This project" };

function ConfigForm({ initial, hasProject, onChange }: { initial: WidgetConfig; hasProject: boolean; onChange: (c: WidgetConfig) => void }) {
  const [config, setConfig] = useState(initial);
  const [options, setOptions] = useState<DashboardData["filterOptions"]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void createContext()
      .then(async (ctx) => {
        const scope = config.scope === "project" && ctx.host.project ? { kind: "project" as const, projectId: ctx.host.project.id } : { kind: "organization" as const };
        setOptions((await ctx.source.getDashboard(DEFAULT_FILTERS, scope)).filterOptions);
      })
      .catch((err: Error) => setError(err.message));
  }, [config.scope]);

  const update = (patch: Partial<WidgetConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    onChange(next);
  };
  const projectName = (id: string) => options?.projects.find((p) => p.id === id)?.name ?? "";
  const scopeOptions = hasProject ? [PROJECT_SCOPE, ORG_SCOPE] : [ORG_SCOPE];

  return (
    <div className="widget-config">
      <FormItem label="Show alerts from">
        <SingleSelect
          label="Show alerts from"
          className=""
          options={scopeOptions}
          value={config.scope}
          onChange={(v) => update({ scope: v === "organization" ? "organization" : "project", repositoryIds: [] })}
        />
      </FormItem>
      <FormItem label="Repositories" message="Leave empty for all repositories.">
        <MultiSelect
          label="Repositories"
          className=""
          options={(options?.repositories ?? []).map((r) => ({ id: r.id, label: config.scope === "organization" ? `${projectName(r.projectId)} / ${r.name}` : r.name }))}
          selected={config.repositoryIds}
          onChange={(repositoryIds) => update({ repositoryIds })}
        />
      </FormItem>
      <FormItem label="Alert types" message="Ignored by the Exposed secrets widget.">
        <MultiSelect label="Alert types" className="" options={kindOptions} selected={config.kinds} onChange={(kinds) => update({ kinds: kinds as AlertKind[] })} />
      </FormItem>
      {error && <MessageCard severity={MessageCardSeverity.Error}>{error}</MessageCard>}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
let current: WidgetConfig = DEFAULT_WIDGET_CONFIG;

const configuration: IWidgetConfiguration = {
  async load(settings: WidgetSettings, context: IWidgetConfigurationContext) {
    current = parseWidgetConfig(settings.customSettings?.data);
    const hasProject = !!SDK.getWebContext().project;
    if (!hasProject) current = { ...current, scope: "organization" };
    root.render(
      <ConfigForm
        initial={current}
        hasProject={hasProject}
        onChange={(c) => {
          current = c;
          void context.notify(ConfigurationEvent.ConfigurationChange, ConfigurationEvent.Args({ data: JSON.stringify(c) }));
        }}
      />,
    );
    return WidgetStatusHelper.Success();
  },
  onSave: () => WidgetConfigurationSave.Valid({ data: JSON.stringify(current) }),
};

void initSdk().then(() => {
  if (inHost) {
    SDK.register(contributionId(), configuration);
    notifyLoaded();
  } else root.render(<ConfigForm initial={current} hasProject onChange={(c) => (current = c)} />);
});
