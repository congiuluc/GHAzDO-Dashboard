import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header, TitleSize } from "azure-devops-ui/Header";
import type { IHeaderCommandBarItem } from "azure-devops-ui/HeaderCommandBar";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { Page } from "azure-devops-ui/Page";
import { Pill, PillSize, PillVariant } from "azure-devops-ui/Pill";
import { ProgressBar } from "azure-devops-ui/ProgressBar";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import { Tab, TabBar, TabSize } from "azure-devops-ui/Tabs";
import { applyScope, filtersFingerprint, type DashboardData, type DashboardScope, type Filters } from "@ghazdo/shared";
import type { AppContext } from "../data/context";
import type { RefreshProgress } from "../data/dataSource";
import { decodeView, encodeView, onHashChange, readHash, writeHash } from "../urlState";
import { AlertTable } from "./AlertTable";
import { Breadcrumbs, FilterBar } from "./FilterBar";
import * as P from "./Panels";
import { SettingsPanel } from "./Settings";
import { tabTourKey, tabTourSteps, Tour, tourSeen } from "./Tour";
import { inHost } from "../sdk";
import { SavedViews } from "./SavedViews";
import { exportPowerPoint, PrintReport } from "./ReportExport";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "code", label: "Code scanning" },
  { id: "dependencies", label: "Dependencies" },
  { id: "secrets", label: "Secrets" },
  { id: "coverage", label: "Coverage" },
  { id: "alerts", label: "Alerts" },
  { id: "settings", label: "Settings", orgOnly: true },
] as const;

export function Dashboard({ ctx, scope }: { ctx: AppContext; scope: DashboardScope }) {
  const isProject = scope.kind === "project";
  const tabs = useMemo(() => TABS.filter((t) => !("orgOnly" in t) || !isProject), [isProject]);
  const tabIds = useMemo(() => tabs.map((t) => t.id as string), [tabs]);
  const maxDays = ctx.settings.maxHistoryDays;

  const [view, setView] = useState(() => ({ filters: applyScope(decodeView("", maxDays, tabIds).filters, scope), tab: "overview" }));
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<RefreshProgress>();
  const [warnings, setWarnings] = useState<string[]>(ctx.warnings);
  const [empty, setEmpty] = useState(false);
  const [exportingPowerPoint, setExportingPowerPoint] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const lastHash = useRef<string>("");

  // Initial URL state and host back/forward navigation.
  useEffect(() => {
    const apply = (hash: string) => {
      if (hash.replace(/^#/, "") === lastHash.current) return;
      const v = decodeView(hash, maxDays, tabIds);
      lastHash.current = hash.replace(/^#/, "");
      setView({ filters: applyScope(v.filters, scope), tab: v.tab });
    };
    void readHash().then(apply);
    void onHashChange(apply);
  }, [maxDays, tabIds, scope]);

  const update = useCallback(
    (filters: Filters, tab?: string) => {
      setView((v) => {
        const next = { filters: applyScope(filters, scope), tab: tab ?? v.tab };
        const hash = encodeView(next);
        if (hash !== lastHash.current) {
          lastHash.current = hash;
          void writeHash(hash);
        }
        return next;
      });
    },
    [scope],
  );

  const drill: P.Drill = useCallback((patch, tab) => update({ ...view.filters, ...patch }, tab), [update, view.filters]);

  const fingerprint = filtersFingerprint(view.filters);
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setEmpty(await ctx.source.isEmpty(scope));
      setData(await ctx.source.getDashboard(view.filters, scope));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.source, scope, fingerprint]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setProgress({ done: 0, total: 0 });
    try {
      const r = await ctx.source.refresh(scope, setProgress);
      setWarnings([...ctx.warnings, ...r.warnings]);
      await load();
    } catch (err) {
      setError(`Refresh failed: ${(err as Error).message}`);
    } finally {
      setProgress(undefined);
    }
  }

  const tourScope = isProject ? "project" : "org";
  const tourKey = tabTourKey(tourScope, view.tab);
  const [touring, setTouring] = useState(false);
  const tourSteps = useMemo(
    () => tabTourSteps(view.tab, { isProject, isBrowser: ctx.source.mode === "browser", canCreateTasks: inHost }),
    [view.tab, isProject, ctx.source.mode],
  );
  const startTour = useCallback(() => setTouring(true), []);

  // Offer each tab's tour once, the first time the tab is shown with its content rendered.
  const autoTourChecked = useRef(new Set<string>());
  useEffect(() => {
    const needsData = view.tab !== "alerts" && view.tab !== "settings";
    if (touring || autoTourChecked.current.has(tourKey) || (needsData && !data)) return;
    autoTourChecked.current.add(tourKey);
    if (!tourSeen(tourKey)) startTour();
  }, [data, tourKey, view.tab, touring, startTour]);

  const props = data ? { data, filters: view.filters, drill } : undefined;
  const title = isProject ? `Advanced Security · ${ctx.host.project?.name ?? "Project"}` : "Advanced Security · Organization";
  const isBrowser = ctx.source.mode === "browser";
  const commands: IHeaderCommandBarItem[] = [
    {
      id: "refresh",
      text: isBrowser ? "Collect now" : "Reload",
      isPrimary: true,
      important: true,
      disabled: !!progress || loading,
      iconProps: { iconName: isBrowser ? "CloudDownload" : "Refresh" },
      onActivate: () => void (isBrowser ? refresh() : load()),
    },
    {
      id: "tour",
      text: `Tour: ${tabs.find((t) => t.id === view.tab)?.label ?? "Overview"}`,
      iconProps: { iconName: "Lightbulb" },
      disabled: touring,
      onActivate: startTour,
    },
    {
      id: "print-report",
      text: "Print / Save PDF",
      iconProps: { iconName: "Print" },
      disabled: !data || exportingPowerPoint,
      onActivate: () => window.print(),
    },
    {
      id: "powerpoint-report",
      text: exportingPowerPoint ? "Exporting…" : "Export PowerPoint",
      iconProps: { iconName: "PowerPointLogo" },
      disabled: !data || exportingPowerPoint,
      onActivate: () => {
        if (!data) return;
        setExportError(undefined);
        setExportingPowerPoint(true);
        void exportPowerPoint(data, title, view.filters)
          .catch((err) => setExportError(`PowerPoint export failed: ${(err as Error).message}`))
          .finally(() => setExportingPowerPoint(false));
      },
    },
  ];

  return (
    <Page className="app flex-grow">
      <Header
        title={title}
        titleSize={TitleSize.Large}
        commandBarItems={commands}
        description={
          <span className="header-pills">
            <Pill size={PillSize.compact} variant={PillVariant.outlined}>
              {ctx.source.mode === "backend" ? "Shared backend" : isBrowser ? "Browser-only" : "Sample data"}
            </Pill>
            {ctx.userHistoryEnabled && (
              <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                History saved to your Azure DevOps profile
              </Pill>
            )}
          </span>
        }
      />

      {progress && (
        <div className="collect-progress" role="status" aria-live="polite">
          <ProgressBar className="flex-grow" currentValue={progress.done} maxValue={Math.max(progress.total, 1)} ariaLabel="Collection progress" />
          <span className="secondary-text">
            {progress.done}/{progress.total || "?"} repositories
          </span>
        </div>
      )}

      <div className="page-body">
        <div className="messages">
          {warnings.map((w) => (
            <MessageCard key={w} severity={MessageCardSeverity.Warning} onDismiss={() => setWarnings((ws) => ws.filter((x) => x !== w))}>
              {w}
            </MessageCard>
          ))}
          {error && (
            <MessageCard severity={MessageCardSeverity.Error} onDismiss={() => setError(undefined)}>
              {error}
            </MessageCard>
          )}
          {exportError && (
            <MessageCard severity={MessageCardSeverity.Error} onDismiss={() => setExportError(undefined)}>
              {exportError}
            </MessageCard>
          )}
          {data?.freshness.partial && <MessageCard severity={MessageCardSeverity.Warning}>Some repositories are stale, failed or could not be collected. Totals may be incomplete; see Data freshness.</MessageCard>}
          {empty && isBrowser && !progress && (
            <MessageCard severity={MessageCardSeverity.Info} buttonProps={[{ text: "Collect now", primary: true, onClick: () => void refresh() }]}>
              No data collected yet in this browser. Select Collect now to scan {isProject ? "this project" : "every project you can access"} with your own permissions.
            </MessageCard>
          )}
        </div>

        <SavedViews host={ctx.host} scope={scope} view={view} tabs={tabIds} maxDays={maxDays} onApply={update} />
        <Breadcrumbs filters={view.filters} options={data?.filterOptions} onChange={(f) => update(f)} projectLocked={isProject} rootLabel={isProject ? ctx.host.project?.name ?? "Project" : "All projects"} />
        <FilterBar filters={view.filters} options={data?.filterOptions} onChange={(f) => update(f)} projectLocked={isProject} maxDays={maxDays} />

        <TabBar className="tabbar" ariaLabel="Dashboard sections" selectedTabId={view.tab} onSelectedTabChanged={(id) => update(view.filters, id)} tabSize={TabSize.Tall} disableSticky>
          {tabs.map((t) => (
            <Tab key={t.id} id={t.id} name={t.label} />
          ))}
        </TabBar>

        {view.tab === "settings" ? (
          <SettingsPanel ctx={ctx} />
        ) : view.tab === "alerts" ? (
          <AlertTable source={ctx.source} filters={view.filters} scope={scope} onDrill={(p) => drill(p)} />
        ) : !props ? (
          <div className="empty">{loading ? <Spinner size={SpinnerSize.large} label="Loading dashboard…" /> : "No data."}</div>
        ) : (
          <div className="grid" aria-busy={loading}>
            {view.tab === "overview" && (
              <>
                <P.KpiTiles {...props} />
                <P.SeverityPanel {...props} />
                <P.KindPanel {...props} />
                <P.StatePanel {...props} />
                <P.OpenTrendPanel {...props} />
                <P.FreshnessPanel {...props} />
                {!isProject && view.filters.projectIds.length !== 1 && <P.TopProjectsPanel {...props} />}
                <P.TopReposPanel {...props} projectLocked={isProject} />
                <P.HeatmapPanel {...props} />
                <P.NewVsFixedPanel {...props} />
                <P.StateTrendPanel {...props} />
                <P.TimeToFixPanel {...props} />
                <P.TimeToFixTrendPanel {...props} />
                <P.AgePanel {...props} />
                <P.SlaPanel {...props} />
                <P.DismissalsPanel {...props} />
                <P.OldestPanel {...props} />
              </>
            )}
            {view.tab === "code" && <P.CodePanels {...props} />}
            {view.tab === "dependencies" && <P.DependencyPanels {...props} />}
            {view.tab === "secrets" && <P.SecretPanels {...props} />}
            {view.tab === "coverage" && <P.CoveragePanels {...props} />}
          </div>
        )}
      </div>

      {data && <PrintReport data={data} title={title} filters={view.filters} />}
      {touring && <Tour key={tourKey} storageKey={tourKey} steps={tourSteps} onClose={() => setTouring(false)} />}
    </Page>
  );
}
