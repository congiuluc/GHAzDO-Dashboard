import type { DashboardData, Filters, NamedCount, Severity, AlertKind, AlertState } from "@ghazdo/shared";
import { SEVERITIES } from "@ghazdo/shared";
import { Pill, PillSize, PillVariant } from "azure-devops-ui/Pill";
import { BarList, Card, Donut, Empty, fmt, GroupedBars, LineChart, SeverityDot, SEVERITY_COLOR, Tile } from "./charts";

export type Drill = (patch: Partial<Filters>, tab?: string) => void;

interface PanelProps {
  data: DashboardData;
  filters: Filters;
  drill: Drill;
}

const repoProject = (data: DashboardData, repoId: string) => data.filterOptions.repositories.find((r) => r.id === repoId)?.projectId;
const drillRepo = (data: DashboardData, drill: Drill, repoId: string, tab?: string) => {
  const projectId = repoProject(data, repoId);
  drill({ projectIds: projectId ? [projectId] : [], repositoryIds: [repoId] }, tab);
};

function Delta({ now, prev, goodWhenUp }: { now: number; prev: number; goodWhenUp?: boolean }) {
  const diff = now - prev;
  if (!diff) return <span className="delta">no change vs prior 7 days</span>;
  const cls = (diff > 0) === !!goodWhenUp ? "down" : "up";
  return <span className={`delta ${cls}`}>{`${diff > 0 ? "+" : ""}${diff} vs prior 7 days`}</span>;
}

/** 1. KPI tiles */
export function KpiTiles({ data, drill }: PanelProps) {
  const k = data.kpis;
  const tiles = [
    { label: "Open alerts", value: k.open, onClick: () => drill({ states: ["active"] }, "alerts") },
    { label: "Critical + high open", value: k.criticalHighOpen, onClick: () => drill({ states: ["active"], severities: ["critical", "high"] }, "alerts") },
    { label: "New (7 days)", value: k.new7d, delta: <Delta now={k.new7d} prev={k.newPrev7d} />, onClick: () => drill({}, "alerts") },
    { label: "Fixed (7 days)", value: k.fixed7d, delta: <Delta now={k.fixed7d} prev={k.fixedPrev7d} goodWhenUp />, onClick: () => drill({ states: ["fixed"] }, "alerts") },
  ];
  return (
    <>
      {tiles.map((t) => (
        <Tile key={t.label} label={t.label}>
          <button className="kpi" onClick={t.onClick}>
            <div className="label">{t.label}</div>
            <div className="value">{fmt(t.value)}</div>
            {t.delta}
          </button>
        </Tile>
      ))}
    </>
  );
}

/** 2. Severity distribution */
export function SeverityPanel({ data, drill }: PanelProps) {
  return (
    <Card title="Open alerts by severity" className="span-4">
      <Donut items={data.severity.filter((s) => s.count)} onSelect={(i) => drill({ severities: [i.id as Severity], states: ["active"] }, "alerts")} />
    </Card>
  );
}

/** 3. Alert type split */
export function KindPanel({ data, drill }: PanelProps) {
  const tab: Record<string, string> = { code: "code", dependency: "dependencies", secret: "secrets" };
  return (
    <Card title="Open alerts by type" hint="code · dependencies · secrets" className="span-4">
      <Donut items={data.kinds.filter((s) => s.count)} onSelect={(i) => drill({ kinds: [i.id as AlertKind] }, tab[i.id] ?? "alerts")} />
    </Card>
  );
}

/** 4. State distribution */
export function StatePanel({ data, drill }: PanelProps) {
  return (
    <Card title="Alerts by state" className="span-4">
      <Donut items={data.states.filter((s) => s.count)} onSelect={(i) => drill({ states: [i.id as AlertState] }, "alerts")} />
    </Card>
  );
}

/** 5. Open alerts trend by severity */
export function OpenTrendPanel({ data, filters }: PanelProps) {
  const series = SEVERITIES.filter((s) => data.openTrend.some((p) => p.values[s])).map((s) => ({ id: s, label: s }));
  return (
    <Card title="Open alerts trend" hint={`last ${filters.periodDays} days · shaded = partial data`} className="span-8">
      <LineChart points={data.openTrend} series={series} />
    </Card>
  );
}

/** 6. Freshness and collection health */
export function FreshnessPanel({ data, drill }: PanelProps) {
  const f = data.freshness;
  return (
    <Card title="Data freshness" className="span-4">
      <p style={{ margin: "0 0 8px" }}>
        Last collected: <strong>{f.lastCollectedAt ? new Date(f.lastCollectedAt).toLocaleString() : "never"}</strong>
      </p>
      <p style={{ margin: "0 0 8px" }}>
        {f.okRepos} of {f.totalRepos} repositories current
        {f.partial && <Pill className="margin-left-8" size={PillSize.compact} variant={PillVariant.outlined}>partial</Pill>}
      </p>
      {data.unverifiedRepos ? <p className="delta">{data.unverifiedRepos} repositories hidden because your access could not be verified.</p> : null}
      {[
        { label: "Stale", list: f.staleRepos },
        { label: "Failed", list: f.failedRepos },
        { label: "Advanced Security disabled", list: f.disabledRepos },
      ].map((g) =>
        g.list.length ? (
          <details key={g.label}>
            <summary>
              {g.label}: {g.list.length}
            </summary>
            <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
              {g.list.slice(0, 20).map((r) => (
                <li key={r.repositoryId}>
                  <button className="link-btn" onClick={() => drillRepo(data, drill, r.repositoryId)}>
                    {r.projectName} / {r.repositoryName}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null,
      )}
    </Card>
  );
}

/** 7. Top projects (organization scope) / 8. Top repositories */
export function TopProjectsPanel({ data, drill }: PanelProps) {
  return (
    <Card title="Riskiest projects" hint="weighted score" className="span-6">
      <BarList items={data.topProjects} onSelect={(i) => drill({ projectIds: [i.id], repositoryIds: [] })} valueLabel={(i) => `${fmt(i.count)} · score ${i.extra?.score}`} />
    </Card>
  );
}

export function TopReposPanel({ data, drill, projectLocked }: PanelProps & { projectLocked?: boolean }) {
  const items = data.topRepositories.map((r) => ({ ...r, label: projectLocked || data.filterOptions.projects.length === 1 ? r.label : `${r.extra?.projectName} / ${r.label}` }));
  return (
    <Card title="Riskiest repositories" hint="weighted score" className="span-6">
      <BarList items={items} onSelect={(i) => drillRepo(data, drill, i.id)} valueLabel={(i) => `${fmt(i.count)} · score ${i.extra?.score}`} />
    </Card>
  );
}

/** 9. Severity heatmap */
export function HeatmapPanel({ data, drill }: PanelProps) {
  const rows = data.heatmap.rows.slice(0, 25);
  const max = Math.max(1, ...rows.flatMap((r) => SEVERITIES.map((s) => r.counts[s])));
  const select = (id: string, severity?: Severity) => {
    const patch: Partial<Filters> = severity ? { severities: [severity], states: ["active"] } : {};
    if (data.heatmap.level === "project") drill({ ...patch, projectIds: [id], repositoryIds: [] }, severity ? "alerts" : undefined);
    else drillRepo(data, (p, t) => drill({ ...p, ...patch }, t), id, severity ? "alerts" : undefined);
  };
  return (
    <Card title={`Severity heatmap by ${data.heatmap.level}`} hint={data.heatmap.rows.length > 25 ? `top 25 of ${data.heatmap.rows.length}` : undefined} className="span-12">
      {!rows.length ? (
        <Empty />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data heat">
            <thead>
              <tr>
                <th>{data.heatmap.level === "project" ? "Project" : "Repository"}</th>
                {SEVERITIES.map((s) => (
                  <th key={s} style={{ textAlign: "center" }}>
                    <SeverityDot severity={s} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button className="link-btn" onClick={() => select(r.id)}>
                      {r.label}
                    </button>
                  </td>
                  {SEVERITIES.map((s) => {
                    const v = r.counts[s];
                    return (
                      <td
                        key={s}
                        className="cell"
                        onClick={() => v && select(r.id, s)}
                        title={`${r.label} · ${s}: ${v}`}
                        style={{ background: v ? `color-mix(in srgb, ${SEVERITY_COLOR[s]} ${Math.round(15 + (v / max) * 70)}%, transparent)` : undefined }}
                      >
                        {v || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const NEW_FIXED_LEGEND = (
  <span className="legend">
    <span>
      <span className="swatch" style={{ background: "var(--ga-danger)" }} /> New
    </span>
    <span>
      <span className="swatch" style={{ background: "var(--ga-success)" }} /> Fixed
    </span>
  </span>
);

/** 10. New vs fixed per week */
export function NewVsFixedPanel({ data }: PanelProps) {
  return (
    <Card title="New vs fixed per week" hint={NEW_FIXED_LEGEND} className="span-6">
      <GroupedBars data={data.newVsFixedWeekly.map((w) => ({ label: w.weekStart, a: w.created, b: w.fixed }))} />
    </Card>
  );
}

/** 11. Mean time to fix */
export function TimeToFixPanel({ data }: PanelProps) {
  const items: NamedCount[] = data.timeToFix.map((t) => ({ id: t.group, label: t.group.replace(/^(kind|severity):/, ""), count: t.averageDays, extra: { samples: t.samples } }));
  return (
    <Card title="Mean time to fix" hint="days, fixed alerts in scope" className="span-6">
      <BarList items={items} valueLabel={(i) => `${i.count} d (n=${i.extra?.samples})`} max={12} />
    </Card>
  );
}

/** 12. Alert age */
export function AgePanel({ data, title = "Open alert age" }: PanelProps & { title?: string }) {
  return (
    <Card title={title} className="span-6">
      <BarList items={data.ageBuckets} />
    </Card>
  );
}

/** 13. Oldest critical/high open alerts */
export function OldestPanel({ data, drill }: PanelProps) {
  return (
    <Card title="Oldest critical and high alerts" className="span-6">
      {!data.oldestCritical.length ? (
        <Empty>No open critical or high alerts.</Empty>
      ) : (
        <table className="data">
          <tbody>
            {data.oldestCritical.map((a) => (
              <tr key={a.key}>
                <td>
                  <SeverityDot severity={a.severity} />
                </td>
                <td>
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    {a.title}
                  </a>
                  <div className="delta">
                    <button className="link-btn" onClick={() => drillRepo(data, drill, a.repositoryId)}>
                      {a.projectName} / {a.repositoryName}
                    </button>
                  </div>
                </td>
                <td>{a.firstSeen?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** 14. Code scanning detail */
export function CodePanels({ data, drill }: PanelProps) {
  return (
    <>
      <Card title="Top code scanning rules" className="span-8">
        <BarList items={data.code.topRules} onSelect={(i) => drill({ kinds: ["code"], states: ["active"], search: i.label }, "alerts")} />
      </Card>
      <Card title="Code scanning tools" className="span-4">
        <Donut items={data.code.tools} onSelect={(i) => drill({ kinds: ["code"], states: ["active"], search: i.id }, "alerts")} />
      </Card>
    </>
  );
}

/** 15. Dependency scanning detail */
export function DependencyPanels({ data, drill }: PanelProps) {
  const d = data.dependencies;
  return (
    <>
      <Card title="Most vulnerable packages" hint="open dependency alerts" className="span-8">
        {!d.topPackages.length ? (
          <Empty />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Package</th>
                <th>Alerts</th>
                <th>Critical</th>
                <th>High</th>
                <th>Repositories</th>
                <th>Fix available</th>
              </tr>
            </thead>
            <tbody>
              {d.topPackages.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button className="link-btn" onClick={() => drill({ kinds: ["dependency"], states: ["active"], search: p.id }, "alerts")}>
                      {p.label}
                    </button>
                  </td>
                  <td>{p.count}</td>
                  <td>{p.extra?.critical}</td>
                  <td>{p.extra?.high}</td>
                  <td>{p.extra?.repositories}</td>
                  <td>{d.fieldsAvailable.fixedVersion ? `${p.extra?.withFix}/${p.count}` : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Fix availability" className="span-4">
        {d.fieldsAvailable.fixedVersion ? (
          <Donut
            items={[
              { id: "low", label: "Fix available", count: d.fixAvailability.withFix },
              { id: "unknown", label: "No fix yet", count: d.fixAvailability.withoutFix },
            ].filter((x) => x.count)}
          />
        ) : (
          <Empty>The alerts API did not return fixed-version data for these alerts.</Empty>
        )}
      </Card>
      <Card title="Ecosystems" className="span-6">
        {d.fieldsAvailable.ecosystem ? <BarList items={d.ecosystems} onSelect={(i) => drill({ kinds: ["dependency"], states: ["active"], search: i.id }, "alerts")} /> : <Empty>Ecosystem not reported.</Empty>}
      </Card>
      <Card title="Top advisories (CVE / GHSA)" className="span-6">
        {d.fieldsAvailable.advisories ? <BarList items={d.advisories} onSelect={(i) => drill({ kinds: ["dependency"], states: ["active"], search: i.id }, "alerts")} /> : <Empty>Advisory IDs not reported.</Empty>}
      </Card>
    </>
  );
}

/** 16. Secret scanning detail */
export function SecretPanels({ data, drill }: PanelProps) {
  const s = data.secrets;
  return (
    <>
      <Tile className="span-4" label="Secrets exposed for more than 7 days">
        <button className="kpi" onClick={() => drill({ kinds: ["secret"], states: ["active"] }, "alerts")}>
          <div className="label">Secrets exposed for more than 7 days</div>
          <div className="value" style={{ color: s.exposedOver7Days ? "var(--ga-danger)" : undefined }}>
            {fmt(s.exposedOver7Days)}
          </div>
          <span className="delta">Rotate the credential, then close the alert.</span>
        </button>
      </Tile>
      <Card title="Secret validity" className="span-4">
        {s.validity ? <Donut items={s.validity} size={110} /> : <Empty>Validity checks are not reported for these secrets.</Empty>}
      </Card>
      <Card title="Open secret age" className="span-4">
        <BarList items={s.ageBuckets} />
      </Card>
      <Card title="Repositories with exposed secrets" className="span-6">
        <BarList items={s.leaderboard} onSelect={(i) => drillRepo(data, (p) => drill({ ...p, kinds: ["secret"], states: ["active"] }, "alerts"), i.id)} />
      </Card>
      <Card title="Secret types" className="span-6">
        <BarList items={s.types} onSelect={(i) => drill({ kinds: ["secret"], states: ["active"], search: i.id }, "alerts")} />
      </Card>
      <Card title="Secrets detected vs closed per week" hint={NEW_FIXED_LEGEND} className="span-12">
        <GroupedBars data={s.weekly.map((w) => ({ label: w.weekStart, a: w.created, b: w.fixed }))} />
      </Card>
    </>
  );
}

/** Coverage: Advanced Security enablement per repository. */
export function CoveragePanels({ data, drill }: PanelProps) {
  const t = data.coverage.totals;
  const pct = (n: number) => (t.repos ? `${Math.round((n / t.repos) * 100)}%` : "—");
  const cell = (v: boolean | null) => (v === null ? <span className="unk">unknown</span> : v ? <span className="yes">on</span> : <span className="no">off</span>);
  return (
    <>
      {[
        { label: "Code scanning enabled", n: t.code },
        { label: "Dependency scanning enabled", n: t.dependency },
        { label: "Secret protection enabled", n: t.secret },
        { label: "Enablement unknown", n: t.unknown },
      ].map((k) => (
        <Tile key={k.label} label={k.label}>
          <div className="kpi">
            <div className="label">{k.label}</div>
            <div className="value">{pct(k.n)}</div>
            <span className="delta">
              {k.n} of {t.repos} repositories
            </span>
          </div>
        </Tile>
      ))}
      <Card title="Repository coverage" className="span-12">
        {!data.coverage.rows.length ? (
          <Empty />
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 520 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Repository</th>
                  <th>Code scanning</th>
                  <th>Dependency scanning</th>
                  <th>Secret protection</th>
                </tr>
              </thead>
              <tbody>
                {data.coverage.rows.map((r) => (
                  <tr key={r.repositoryId}>
                    <td>
                      <button className="link-btn" onClick={() => drill({ projectIds: [r.projectId], repositoryIds: [] })}>
                        {r.projectName}
                      </button>
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => drill({ projectIds: [r.projectId], repositoryIds: [r.repositoryId] })}>
                        {r.repositoryName}
                      </button>
                    </td>
                    <td>{cell(r.code)}</td>
                    <td>{cell(r.dependency)}</td>
                    <td>{cell(r.secret)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export function StateTrendPanel({ data, filters }: PanelProps) {
  const series = ["active", "fixed", "dismissed", "autoDismissed"].filter((s) => data.stateTrend.some((p) => p.values[s])).map((s) => ({ id: s, label: s }));
  return (
    <Card title="Alerts by state over time" hint={`last ${filters.periodDays} days`} className="span-6">
      <LineChart points={data.stateTrend} series={series} height={170} />
    </Card>
  );
}
