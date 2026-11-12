import PptxGenJS from "pptxgenjs";
import type { DashboardData, Filters } from "@ghazdo/shared";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "9B1C1C",
  high: "D64545",
  medium: "D27A22",
  low: "1976A5",
  unknown: "687782",
};

function filterSummary(filters: Filters): string {
  const parts: string[] = [`Last ${filters.periodDays} days`];
  if (filters.projectIds.length) parts.push(`${filters.projectIds.length} project filter${filters.projectIds.length === 1 ? "" : "s"}`);
  if (filters.repositoryIds.length) parts.push(`${filters.repositoryIds.length} repository filter${filters.repositoryIds.length === 1 ? "" : "s"}`);
  if (filters.severities.length) parts.push(`Severity: ${filters.severities.join(", ")}`);
  if (filters.kinds.length) parts.push(`Type: ${filters.kinds.join(", ")}`);
  if (filters.states.length) parts.push(`State: ${filters.states.join(", ")}`);
  if (filters.search) parts.push(`Search: ${filters.search}`);
  return parts.length ? parts.join(" · ") : "All alerts";
}

function ReportMetric({ value, label }: { value: number | string; label: string }) {
  return <div className="report-metric"><strong>{value}</strong><span>{label}</span></div>;
}

export function PrintReport({ data, title, filters }: { data: DashboardData; title: string; filters: Filters }) {
  return (
    <section className="print-report" aria-label="Printable Advanced Security report">
      <header className="print-report-header">
        <p className="report-kicker">GITHUB ADVANCED SECURITY</p>
        <h1>{title} posture report</h1>
        <p>{filterSummary(filters)} · Generated {new Date(data.generatedAt).toLocaleString()}</p>
      </header>
      <div className="report-metrics">
        <ReportMetric value={data.kpis.open} label="Open alerts" />
        <ReportMetric value={data.kpis.criticalHighOpen} label="Critical / high" />
        <ReportMetric value={data.sla.overdue} label="Overdue by SLA" />
        <ReportMetric value={data.kpis.fixed7d} label="Fixed in 7 days" />
      </div>
      <div className="print-report-grid">
        <section>
          <h2>Severity</h2>
          <table><tbody>{data.severity.map((item) => <tr key={item.id}><th>{item.label}</th><td>{item.count}</td></tr>)}</tbody></table>
        </section>
        <section>
          <h2>Recent weekly activity</h2>
          <table>
            <thead><tr><th>Week</th><th>New</th><th>Fixed</th></tr></thead>
            <tbody>{data.newVsFixedWeekly.slice(-8).map((item) => <tr key={item.weekStart}><th>{item.weekStart}</th><td>{item.created}</td><td>{item.fixed}</td></tr>)}</tbody>
          </table>
        </section>
        <section>
          <h2>Remediation SLA</h2>
          <p>{data.sla.overdue} overdue of {data.sla.eligible} alerts with known age; {data.sla.unknownAge} lack age data.</p>
          <table><thead><tr><th>Severity</th><th>Threshold</th><th>Overdue</th><th>Eligible</th></tr></thead>
            <tbody>{data.sla.bySeverity.map((item) => <tr key={item.severity}><th>{item.severity}</th><td>{item.thresholdDays} days</td><td>{item.overdue}</td><td>{item.eligible}</td></tr>)}</tbody>
          </table>
        </section>
        <section>
          <h2>Oldest alerts</h2>
          <ol>{data.oldestCritical.slice(0, 8).map((alert) => <li key={alert.key}>{alert.title} — {alert.projectName} / {alert.repositoryName}</li>)}</ol>
        </section>
        <section>
          <h2>Dependency upgrade impact</h2>
          <table><thead><tr><th>Package</th><th>Fixed version</th><th>Alerts</th><th>Repos</th></tr></thead>
            <tbody>{data.dependencies.upgradeImpact.slice(0, 8).map((item) => <tr key={`${item.ecosystem}:${item.packageName}:${item.fixedVersion}`}><th>{item.packageName}</th><td>{item.fixedVersion}</td><td>{item.alerts}</td><td>{item.repositories}</td></tr>)}</tbody>
          </table>
        </section>
        <section>
          <h2>Coverage</h2>
          <p>{data.coverage.totals.repos} repositories · {data.coverage.totals.unknown} unknown status</p>
          <table><tbody>
            <tr><th>Code scanning enabled</th><td>{data.coverage.totals.code}</td></tr>
            <tr><th>Dependency scanning enabled</th><td>{data.coverage.totals.dependency}</td></tr>
            <tr><th>Secret scanning enabled</th><td>{data.coverage.totals.secret}</td></tr>
          </tbody></table>
        </section>
      </div>
      <footer>Data reflects repositories and alerts visible to the current Azure DevOps identity.</footer>
    </section>
  );
}

function addSlideTitle(slide: PptxGenJS.Slide, title: string, subtitle: string) {
  slide.addText(title, { x: 0.55, y: 0.32, w: 12.2, h: 0.48, fontFace: "Aptos Display", fontSize: 24, bold: true, color: "182A3A", margin: 0 });
  slide.addText(subtitle, { x: 0.55, y: 0.85, w: 12.2, h: 0.3, fontFace: "Aptos", fontSize: 10, color: "647482", margin: 0, fit: "shrink" });
}

function addBarRows(slide: PptxGenJS.Slide, rows: { label: string; value: number; color: string }[], x: number, y: number, w: number, rowHeight: number) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  rows.forEach((row, index) => {
    const top = y + index * rowHeight;
    slide.addText(row.label, { x, y: top, w: w * 0.28, h: 0.22, fontFace: "Aptos", fontSize: 10, color: "263746", margin: 0, breakLine: false, fit: "shrink" });
    slide.addShape("rect", { x: x + w * 0.3, y: top + 0.02, w: w * 0.58, h: 0.16, fill: { color: "E6ECEF" }, line: { color: "E6ECEF", transparency: 100 } });
    const barWidth = row.value ? Math.max(0.03, (w * 0.58 - 0.03) * row.value / max) : 0;
    if (barWidth) slide.addShape("rect", { x: x + w * 0.3, y: top + 0.02, w: barWidth, h: 0.16, fill: { color: row.color }, line: { color: row.color, transparency: 100 } });
    slide.addText(String(row.value), { x: x + w * 0.9, y: top - 0.01, w: w * 0.1, h: 0.22, fontFace: "Aptos", fontSize: 10, color: "263746", align: "right", margin: 0 });
  });
}

function addPanel(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, title: string) {
  slide.addShape("rect", { x, y, w, h, fill: { color: "FFFFFF" }, line: { color: "D8E0E5", width: 0.8 } });
  slide.addText(title, { x: x + 0.22, y: y + 0.18, w: w - 0.44, h: 0.28, fontFace: "Aptos Display", fontSize: 14, bold: true, color: "203546", margin: 0 });
}

function formatStamp(stamp: string): string {
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? stamp : parsed.toLocaleString();
}

export async function exportPowerPoint(data: DashboardData, title: string, filters: Filters): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "GHAzDO Dashboard";
  pptx.subject = "GitHub Advanced Security posture";
  pptx.title = title;
  pptx.company = "GHAzDO Dashboard";
  const heading = `${title} posture`;

  const cover = pptx.addSlide();
  cover.background = { color: "112536" };
  cover.addShape("rect", { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: "23A69A" }, line: { color: "23A69A", transparency: 100 } });
  cover.addText("GITHUB ADVANCED SECURITY", { x: 0.72, y: 0.78, w: 8.5, h: 0.32, fontFace: "Aptos", fontSize: 12, bold: true, charSpacing: 2, color: "80D5C9", margin: 0 });
  cover.addText(heading, { x: 0.72, y: 1.28, w: 11.6, h: 0.85, fontFace: "Aptos Display", fontSize: 34, bold: true, color: "FFFFFF", margin: 0 });
  cover.addText(`${filterSummary(filters)}  |  Generated ${formatStamp(data.generatedAt)}`, { x: 0.72, y: 2.22, w: 11.6, h: 0.36, fontFace: "Aptos", fontSize: 11, color: "C3D0D9", margin: 0, fit: "shrink" });
  const coverStats = [
    { label: "OPEN ALERTS", value: data.kpis.open, color: "1D4457" },
    { label: "CRITICAL / HIGH", value: data.kpis.criticalHighOpen, color: "542F39" },
    { label: "SLA OVERDUE", value: data.sla.overdue, color: "614027" },
    { label: "FIXED IN 7 DAYS", value: data.kpis.fixed7d, color: "20534C" },
  ];
  coverStats.forEach((stat, index) => {
    const x = 0.72 + index * 3.08;
    cover.addShape("rect", { x, y: 3.12, w: 2.78, h: 1.35, fill: { color: stat.color }, line: { color: stat.color, transparency: 100 } });
    cover.addText(String(stat.value), { x: x + 0.2, y: 3.34, w: 2.38, h: 0.54, fontFace: "Aptos Display", fontSize: 29, bold: true, color: "FFFFFF", margin: 0 });
    cover.addText(stat.label, { x: x + 0.2, y: 4.03, w: 2.38, h: 0.2, fontFace: "Aptos", fontSize: 9, bold: true, charSpacing: 1, color: "D9E5EB", margin: 0 });
  });
  cover.addText("Visibility follows the permissions of the Azure DevOps identity that collected or queried this data.", {
    x: 0.72, y: 6.72, w: 11.4, h: 0.25, fontFace: "Aptos", fontSize: 10, color: "AFC0CA", margin: 0,
  });

  const activity = pptx.addSlide();
  activity.background = { color: "F3F6F7" };
  addSlideTitle(activity, "Alert volume and remediation activity", `${data.kpis.new7d} new and ${data.kpis.fixed7d} fixed in the last 7 days`);
  addPanel(activity, 0.55, 1.35, 5.95, 5.55, "Open alerts by severity");
  addBarRows(activity, data.severity.map((item) => ({ label: item.label, value: item.count, color: SEVERITY_COLORS[item.id] ?? SEVERITY_COLORS.unknown! })), 0.82, 1.98, 5.4, 0.55);
  addPanel(activity, 6.82, 1.35, 5.95, 5.55, "Weekly new versus fixed");
  const weeks = data.newVsFixedWeekly.slice(-7);
  const maxWeekly = Math.max(1, ...weeks.flatMap((week) => [week.created, week.fixed]));
  weeks.forEach((week, index) => {
    const x = 7.1 + index * 0.79;
    const chartBottom = 5.7;
    const barMaxHeight = 3.0;
    const createdHeight = barMaxHeight * week.created / maxWeekly;
    const fixedHeight = barMaxHeight * week.fixed / maxWeekly;
    activity.addShape("rect", { x, y: chartBottom - createdHeight, w: 0.24, h: Math.max(0.025, createdHeight), fill: { color: "D27A22" }, line: { color: "D27A22", transparency: 100 } });
    activity.addShape("rect", { x: x + 0.28, y: chartBottom - fixedHeight, w: 0.24, h: Math.max(0.025, fixedHeight), fill: { color: "168A80" }, line: { color: "168A80", transparency: 100 } });
    activity.addText(String(week.created), { x, y: chartBottom - createdHeight - 0.2, w: 0.24, h: 0.16, fontFace: "Aptos", fontSize: 7, color: "526574", align: "center", margin: 0, fit: "shrink" });
    activity.addText(String(week.fixed), { x: x + 0.28, y: chartBottom - fixedHeight - 0.2, w: 0.24, h: 0.16, fontFace: "Aptos", fontSize: 7, color: "526574", align: "center", margin: 0, fit: "shrink" });
    activity.addText(week.weekStart.slice(5), { x: x - 0.08, y: 5.85, w: 0.72, h: 0.22, fontFace: "Aptos", fontSize: 8, color: "526574", align: "center", margin: 0 });
  });
  activity.addShape("rect", { x: 7.2, y: 6.35, w: 0.14, h: 0.14, fill: { color: "D27A22" }, line: { color: "D27A22", transparency: 100 } });
  activity.addText("New", { x: 7.4, y: 6.31, w: 0.6, h: 0.2, fontFace: "Aptos", fontSize: 9, color: "526574", margin: 0 });
  activity.addShape("rect", { x: 8.25, y: 6.35, w: 0.14, h: 0.14, fill: { color: "168A80" }, line: { color: "168A80", transparency: 100 } });
  activity.addText("Fixed", { x: 8.45, y: 6.31, w: 0.7, h: 0.2, fontFace: "Aptos", fontSize: 9, color: "526574", margin: 0 });

  const remediation = pptx.addSlide();
  remediation.background = { color: "F3F6F7" };
  addSlideTitle(remediation, "Remediation priorities", `${data.sla.overdue} overdue of ${data.sla.eligible} alerts with known age; ${data.sla.unknownAge} missing age data`);
  addPanel(remediation, 0.55, 1.35, 5.95, 5.55, "SLA exposure by severity");
  addBarRows(remediation, data.sla.bySeverity.map((item) => ({ label: `${item.severity} (${item.thresholdDays}d)`, value: item.overdue, color: SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS.unknown! })), 0.82, 1.98, 5.4, 0.55);
  addPanel(remediation, 6.82, 1.35, 5.95, 5.55, "Highest-impact package upgrades");
  const upgrades = data.dependencies.upgradeImpact.slice(0, 7);
  if (!upgrades.length) remediation.addText("No fixed-version upgrade data is available for this view.", { x: 7.1, y: 2, w: 5.35, h: 0.42, fontFace: "Aptos", fontSize: 11, color: "647482", margin: 0 });
  upgrades.forEach((item, index) => {
    const y = 1.95 + index * 0.62;
    remediation.addText(item.packageName, { x: 7.1, y, w: 3.1, h: 0.22, fontFace: "Aptos", fontSize: 10, bold: true, color: "263746", margin: 0, breakLine: false, fit: "shrink" });
    remediation.addText(`${item.alerts} alerts · ${item.repositories} repos`, { x: 10.1, y, w: 2.35, h: 0.2, fontFace: "Aptos", fontSize: 9, color: "526574", align: "right", margin: 0 });
    remediation.addText(`Upgrade to ${item.fixedVersion}`, { x: 7.1, y: y + 0.25, w: 5.3, h: 0.2, fontFace: "Aptos", fontSize: 9, color: "168A80", margin: 0 });
  });

  const coverage = pptx.addSlide();
  coverage.background = { color: "F3F6F7" };
  addSlideTitle(coverage, "Coverage and response", `${data.coverage.totals.repos} repositories in scope · ${data.coverage.totals.unknown} with unknown scanner status`);
  addPanel(coverage, 0.55, 1.35, 5.95, 5.55, "Scanner enablement");
  addBarRows(coverage, [
    { label: "Code scanning", value: data.coverage.totals.code, color: "1976A5" },
    { label: "Dependency scanning", value: data.coverage.totals.dependency, color: "168A80" },
    { label: "Secret scanning", value: data.coverage.totals.secret, color: "D27A22" },
    { label: "Unknown status", value: data.coverage.totals.unknown, color: "687782" },
  ], 0.82, 2.02, 5.4, 0.62);
  addPanel(coverage, 6.82, 1.35, 5.95, 5.55, "Repositories with most open alerts");
  const repositories = data.topRepositories.slice(0, 8);
  addBarRows(coverage, repositories.map((item) => ({ label: item.label, value: item.count, color: "1976A5" })), 7.1, 1.98, 5.4, 0.48);
  coverage.addText("Open the dashboard for alert-level details, branch references, dismissal analysis and historical trends.", { x: 0.82, y: 6.4, w: 11.7, h: 0.24, fontFace: "Aptos", fontSize: 9, color: "647482", margin: 0 });

  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "advanced-security"}-posture.pptx`;
  await pptx.writeFile({ fileName: filename });
}
