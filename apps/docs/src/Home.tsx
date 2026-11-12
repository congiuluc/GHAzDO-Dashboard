import { Badge, Button, makeStyles, mergeClasses, Text, tokens } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowRightRegular,
  BoxRegular,
  BugRegular,
  CloudArrowUpRegular,
  DatabaseRegular,
  FilterRegular,
  GridRegular,
  KeyRegular,
  ShieldLockRegular,
} from "@fluentui/react-icons";
import type { FluentIcon } from "@fluentui/react-icons";
import { REPO_URL } from "./env";

const useStyles = makeStyles({
  wrap: { maxWidth: "1180px", margin: "0 auto" },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
    gap: "48px",
    alignItems: "center",
    padding: "56px 0 72px",
    "@media (max-width: 1000px)": { gridTemplateColumns: "1fr", padding: "24px 0 48px" },
  },
  eyebrow: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalS, color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  title: {
    margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalL}`,
    fontSize: "clamp(34px, 5vw, 56px)",
    lineHeight: "1.05",
    letterSpacing: "-0.035em",
    fontWeight: tokens.fontWeightBold,
    color: tokens.colorNeutralForeground1,
  },
  accent: { color: tokens.colorBrandForeground1 },
  lead: { maxWidth: "560px", fontSize: tokens.fontSizeBase500, lineHeight: "1.6", color: tokens.colorNeutralForeground2, margin: 0 },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalM, marginTop: "32px" },
  pills: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, marginTop: "28px" },

  preview: {
    position: "relative",
    padding: tokens.spacingHorizontalL,
    borderRadius: "20px",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow28,
  },
  chrome: { display: "flex", alignItems: "center", gap: "6px", marginBottom: tokens.spacingVerticalL },
  dot: { width: "10px", height: "10px", borderRadius: "50%", backgroundColor: tokens.colorNeutralStroke1 },
  chromeTitle: { marginLeft: tokens.spacingHorizontalS, color: tokens.colorNeutralForeground3 },
  kpis: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalL },
  kpi: {
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground3,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  kpiValue: { fontSize: "22px", fontWeight: tokens.fontWeightBold, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" },
  chart: {
    display: "flex",
    alignItems: "flex-end",
    gap: "6px",
    height: "120px",
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  col: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "2px", height: "100%" },
  seg: { borderRadius: "3px" },
  critical: { backgroundColor: tokens.colorPaletteRedBackground3 },
  high: { backgroundColor: tokens.colorPaletteDarkOrangeBackground3 },
  medium: { backgroundColor: tokens.colorPaletteMarigoldBackground3 },
  low: { backgroundColor: tokens.colorBrandBackground },
  legend: { display: "flex", gap: tokens.spacingHorizontalL, marginTop: tokens.spacingVerticalM, color: tokens.colorNeutralForeground3 },
  swatch: { display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", marginRight: "6px" },

  sectionHead: { margin: "16px 0 24px", display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  h2: { margin: 0, fontSize: tokens.fontSizeBase600, letterSpacing: "-0.01em", fontWeight: tokens.fontWeightSemibold },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: tokens.spacingHorizontalL },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalXL,
    borderRadius: "16px",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    transitionProperty: "transform, box-shadow, border-color",
    transitionDuration: tokens.durationFast,
    ":hover": { transform: "translateY(-2px)", boxShadow: tokens.shadow8, border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke2}` },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: "2px" },
    "@media (prefers-reduced-motion: reduce)": { ":hover": { transform: "none" } },
  },
  iconTile: {
    display: "grid",
    placeItems: "center",
    width: "40px",
    height: "40px",
    borderRadius: tokens.borderRadiusXLarge,
    fontSize: "22px",
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
  },
  muted: { color: tokens.colorNeutralForeground2, lineHeight: "1.55" },

  steps: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: tokens.spacingHorizontalL, margin: "0 0 32px" },
  step: { display: "flex", gap: tokens.spacingHorizontalM, alignItems: "flex-start" },
  num: {
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    fontWeight: tokens.fontWeightBold,
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorBrandBackground,
  },
  spaced: { marginTop: "72px" },
});

interface Feature {
  icon: FluentIcon;
  title: string;
  text: string;
  page: string;
}

const FEATURES: Feature[] = [
  { icon: GridRegular, title: "Organization and project dashboards", text: "One view across every project, plus a dashboard inside each project locked to its repositories.", page: "dashboards" },
  { icon: BugRegular, title: "Code and dependency scanning", text: "Top rules and tools, vulnerable packages, ecosystems and advisories, severity and age.", page: "dashboards" },
  { icon: KeyRegular, title: "Secret scanning", text: "Exposed secrets by type and repository, secret age and long-lived exposures.", page: "dashboards" },
  { icon: FilterRegular, title: "Filters and drill-down", text: "Filter by project and repository everywhere. Every chart and list drills into the matching alerts.", page: "filters" },
  { icon: BoxRegular, title: "Dashboard widgets", text: "Summary, severity, riskiest repositories and exposed secrets widgets for Azure DevOps dashboards.", page: "widgets" },
  { icon: DatabaseRegular, title: "History your way", text: "Browser cache by default, optional per-user history in Azure DevOps, or shared history in Azure.", page: "data-modes" },
  { icon: CloudArrowUpRegular, title: "Optional shared backend", text: "Azure Functions with managed identity, hourly collection and 365 days of organization history.", page: "backend" },
  { icon: ShieldLockRegular, title: "No secrets stored", text: "Only an allowlist of alert metadata is kept. Secret values, snippets and file paths never are.", page: "security" },
];

const STEPS = [
  { title: "Install the extension", text: "Upload the VSIX to your publisher and share it with your organization." },
  { title: "Open Advanced Security", text: "Use the organization hub, or the Advanced Security entry in any project." },
  { title: "Collect and explore", text: "Collect alerts, filter by project or repository, and drill into anything." },
];

/** Illustrative sample data for the hero preview. */
const BARS = [
  [2, 5, 8, 6],
  [3, 6, 9, 5],
  [2, 7, 8, 6],
  [4, 8, 10, 7],
  [3, 7, 9, 6],
  [2, 6, 7, 5],
  [1, 5, 7, 6],
  [1, 4, 6, 5],
  [1, 3, 5, 5],
  [0, 3, 4, 4],
];
const KPIS = [
  { label: "Open alerts", value: "1,284" },
  { label: "Critical", value: "37" },
  { label: "Secrets", value: "12" },
  { label: "Fixed (30d)", value: "418" },
];

function Preview() {
  const s = useStyles();
  const sevs = [s.critical, s.high, s.medium, s.low];
  return (
    <div className={s.preview} aria-hidden="true">
      <div className={s.chrome}>
        <span className={s.dot} />
        <span className={s.dot} />
        <span className={s.dot} />
        <Text size={200} className={s.chromeTitle}>
          Advanced Security · Overview
        </Text>
      </div>
      <div className={s.kpis}>
        {KPIS.map((k) => (
          <div key={k.label} className={s.kpi}>
            <Text size={100}>{k.label}</Text>
            <span className={s.kpiValue}>{k.value}</span>
          </div>
        ))}
      </div>
      <div className={s.chart}>
        {BARS.map((b, i) => (
          <div key={i} className={s.col}>
            {b.map((v, j) => (
              <div key={j} className={mergeClasses(s.seg, sevs[j])} style={{ height: `${v * 2.4}%` }} />
            ))}
          </div>
        ))}
      </div>
      <div className={s.legend}>
        {["Critical", "High", "Medium", "Low"].map((l, i) => (
          <Text key={l} size={200}>
            <span className={mergeClasses(s.swatch, sevs[i])} />
            {l}
          </Text>
        ))}
      </div>
    </div>
  );
}

export function Home({ go }: { go: (id: string) => void }) {
  const s = useStyles();
  return (
    <div className={mergeClasses(s.wrap, "doc-fade")}>
      <section className={s.hero}>
        <div>
          <span className={s.eyebrow}>
            <ShieldLockRegular /> Azure DevOps extension
          </span>
          <h1 className={s.title}>
            Every Advanced Security alert. <span className={s.accent}>One dashboard.</span>
          </h1>
          <p className={s.lead}>
            Code scanning, dependency scanning and secret scanning alerts from all your Azure DevOps projects and repositories, with trends, history, filters and
            drill-down.
          </p>
          <div className={s.actions}>
            <Button appearance="primary" size="large" icon={<ArrowRightRegular />} iconPosition="after" onClick={() => go("getting-started")}>
              Get started
            </Button>
            {REPO_URL ? (
              <Button as="a" size="large" href={`${REPO_URL}/releases/latest`} icon={<ArrowDownloadRegular />}>
                Download
              </Button>
            ) : (
              <Button size="large" onClick={() => go("dashboards")}>
                Explore the dashboards
              </Button>
            )}
          </div>
          <div className={s.pills}>
            {["Code scanning", "Dependency scanning", "Secret scanning", "Widgets", "History"].map((p) => (
              <Badge key={p} appearance="outline" shape="rounded" size="large" color="informative">
                {p}
              </Badge>
            ))}
          </div>
        </div>
        <Preview />
      </section>

      <div className={s.sectionHead}>
        <h2 className={s.h2}>Up and running in three steps</h2>
      </div>
      <div className={s.steps}>
        {STEPS.map((st, i) => (
          <div key={st.title} className={s.step}>
            <span className={s.num}>{i + 1}</span>
            <div>
              <Text weight="semibold" block>
                {st.title}
              </Text>
              <Text className={s.muted}>{st.text}</Text>
            </div>
          </div>
        ))}
      </div>

      <div className={mergeClasses(s.sectionHead, s.spaced)}>
        <h2 className={s.h2}>What you get</h2>
        <Text className={s.muted}>Everything GitHub Advanced Security for Azure DevOps finds, in one place.</Text>
      </div>
      <div className={s.grid}>
        {FEATURES.map((f) => (
          <button key={f.title} type="button" className={s.card} onClick={() => go(f.page)}>
            <span className={s.iconTile}>
              <f.icon />
            </span>
            <Text weight="semibold" size={400}>
              {f.title}
            </Text>
            <Text className={s.muted}>{f.text}</Text>
          </button>
        ))}
      </div>
    </div>
  );
}
