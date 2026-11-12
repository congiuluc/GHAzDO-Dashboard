import { Body1, Button, Caption1, Card, CardHeader, makeStyles, Subtitle2, Text, Title1, tokens } from "@fluentui/react-components";
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
  hero: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXL}`,
    marginBottom: tokens.spacingVerticalXXL,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    maxWidth: "1100px",
  },
  lead: { maxWidth: "720px", color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400 },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalS },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: tokens.spacingHorizontalL, maxWidth: "1100px" },
  icon: { fontSize: "24px", color: tokens.colorBrandForeground1 },
  section: { margin: `${tokens.spacingVerticalXXL} 0 ${tokens.spacingVerticalM}`, display: "block" },
  card: { height: "100%" },
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

export function Home({ go }: { go: (id: string) => void }) {
  const styles = useStyles();
  return (
    <>
      <section className={styles.hero}>
        <Caption1>Azure DevOps extension</Caption1>
        <Title1 as="h1">GitHub Advanced Security, every project, one dashboard</Title1>
        <Text as="p" className={styles.lead}>
          Advanced Security Dashboard brings code scanning, dependency scanning and secret scanning alerts from all your Azure DevOps projects and repositories
          together, with trends, history, filters and drill-down.
        </Text>
        <div className={styles.actions}>
          <Button appearance="primary" icon={<ArrowRightRegular />} iconPosition="after" onClick={() => go("getting-started")}>
            Get started
          </Button>
          {REPO_URL && (
            <Button as="a" href={`${REPO_URL}/releases/latest`} icon={<ArrowDownloadRegular />}>
              Download the latest release
            </Button>
          )}
          <Button appearance="subtle" onClick={() => go("dashboards")}>
            Tour the dashboards
          </Button>
        </div>
      </section>

      <Subtitle2 as="h2" className={styles.section}>
        What you get
      </Subtitle2>
      <div className={styles.grid}>
        {FEATURES.map((f) => (
          <Card key={f.title} className={styles.card} onClick={() => go(f.page)} aria-label={f.title}>
            <CardHeader image={<f.icon className={styles.icon} />} header={<Text weight="semibold">{f.title}</Text>} />
            <Body1>{f.text}</Body1>
          </Card>
        ))}
      </div>
    </>
  );
}
