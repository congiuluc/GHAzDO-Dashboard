import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import type { DashboardData } from "@ghazdo/shared";
import { BarList, Donut, Empty, fmt, Legend } from "../components/charts";
import type { WidgetKind } from "./widgetConfig";

interface Props {
  kind: WidgetKind;
  title: string;
  data?: DashboardData;
  error?: string;
  /** Opens the full dashboard with the given URL hash (filters and tab). */
  open: (hash: string) => void;
  /** Hash fragment carrying the widget's own filters. */
  baseHash: string;
}

const join = (base: string, extra: string) => [base, extra].filter(Boolean).join("&");

export function WidgetView({ kind, title, data, error, open, baseHash }: Props) {
  const go = (extra: string) => (e?: React.MouseEvent) => {
    e?.preventDefault();
    open(join(baseHash, extra));
  };
  const freshness = data?.freshness.lastCollectedAt ? `Updated ${new Date(data.freshness.lastCollectedAt).toLocaleString()}` : "Not collected yet";

  return (
    <div className="widget">
      <h3>
        <a href="#" onClick={go(kind === "secrets" ? "tab=secrets" : "")}>
          {title}
        </a>
      </h3>
      <div className="body">
        {error ? (
          <MessageCard severity={MessageCardSeverity.Error}>{error}</MessageCard>
        ) : !data ? (
          <Spinner size={SpinnerSize.medium} label="Loading…" />
        ) : (
          <Body kind={kind} data={data} go={go} />
        )}
      </div>
      {data && (
        <div className="foot">
          {freshness}
          {data.freshness.partial && " · partial data"}
        </div>
      )}
    </div>
  );
}

function Body({ kind, data, go }: { kind: WidgetKind; data: DashboardData; go: (extra: string) => (e?: React.MouseEvent) => void }) {
  if (!data.freshness.totalRepos) return <Empty>No data yet. Open the dashboard and collect.</Empty>;
  switch (kind) {
    case "kpi": {
      const k = data.kpis;
      const tiles = [
        { label: "Open alerts", value: k.open, hash: "state=active" },
        { label: "Critical + high", value: k.criticalHighOpen, hash: "state=active&severity=critical,high" },
        { label: "New (7 days)", value: k.new7d, hash: "tab=alerts&days=7" },
        { label: "Fixed (7 days)", value: k.fixed7d, hash: "tab=alerts&state=fixed&days=7" },
      ];
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {tiles.map((t) => (
            <button key={t.label} className="kpi" onClick={go(t.hash)}>
              <div className="value">{fmt(t.value)}</div>
              <div className="label">{t.label}</div>
            </button>
          ))}
        </div>
      );
    }
    case "severity":
      return data.severity.some((s) => s.count) ? (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Donut items={data.severity} size={110} onSelect={(s) => go(`state=active&severity=${s.id}`)()} />
          <Legend items={data.severity} onSelect={(s) => go(`state=active&severity=${s.id}`)()} />
        </div>
      ) : (
        <Empty>No open alerts.</Empty>
      );
    case "top-repos":
      return <BarList items={data.topRepositories} max={5} onSelect={(r) => go(`repo=${r.id}`)()} />;
    case "secrets":
      return (
        <>
          <div className="kpi" style={{ marginBottom: 6 }}>
            <div className="value">{fmt(data.secrets.exposedOver7Days)}</div>
            <div className="label">open secrets exposed for more than 7 days</div>
          </div>
          <BarList items={data.secrets.leaderboard} max={3} onSelect={(r) => go(`tab=secrets&repo=${r.id}`)()} />
        </>
      );
  }
}
