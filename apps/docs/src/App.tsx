import {
  Badge,
  Button,
  Divider,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  FluentProvider,
  makeStyles,
  OverlayDrawer,
  Tab,
  TabList,
  Text,
  tokens,
  Tooltip,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, CodeRegular, DismissRegular, NavigationRegular, WeatherMoonRegular, WeatherSunnyRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { Home } from "./Home";
import { Markdown } from "./Markdown";
import { REPO_URL, VERSION } from "./env";
import { findPage, PAGES, pageMarkdown } from "./pages";

const useStyles = makeStyles({
  shell: { minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: tokens.colorNeutralBackground2 },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    height: "52px",
    padding: `0 ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  brand: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, color: "inherit", textDecoration: "none" },
  logo: { width: "28px", height: "28px", borderRadius: tokens.borderRadiusMedium },
  spacer: { flex: 1 },
  menu: { "@media (min-width: 900px)": { display: "none" } },
  body: { flex: 1, display: "flex" },
  side: {
    width: "260px",
    flexShrink: 0,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    "@media (max-width: 899px)": { display: "none" },
  },
  sideInner: { position: "sticky", top: "68px" },
  group: { display: "block", padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXS}`, color: tokens.colorNeutralForeground3 },
  main: { flex: 1, minWidth: 0, padding: `${tokens.spacingVerticalXXL} clamp(16px, 4vw, 56px)` },
  footer: { marginTop: tokens.spacingVerticalXXXL, color: tokens.colorNeutralForeground3 },
});

const routeFromHash = () => window.location.hash.replace(/^#\/?/, "").split(/[?#]/)[0] || "home";

function Nav({ current, onSelect }: { current: string; onSelect: (id: string) => void }) {
  const styles = useStyles();
  const groups = [...new Set(PAGES.map((p) => p.group))];
  return (
    <nav aria-label="Documentation">
      {groups.map((g) => (
        <div key={g}>
          <Text size={200} weight="semibold" className={styles.group}>
            {g}
          </Text>
          <TabList vertical selectedValue={current} onTabSelect={(_, d) => onSelect(String(d.value))}>
            {PAGES.filter((p) => p.group === g).map((p) => (
              <Tab key={p.id} value={p.id} icon={<p.icon />}>
                {p.title}
              </Tab>
            ))}
          </TabList>
        </div>
      ))}
    </nav>
  );
}

export function App() {
  const styles = useStyles();
  const [route, setRoute] = useState(routeFromHash);
  const [dark, setDark] = useState(() => localStorage.getItem("docs-theme") === "dark" || (!localStorage.getItem("docs-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches));
  const [drawer, setDrawer] = useState(false);
  const page = findPage(route);

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.title = page.id === "home" ? "Advanced Security Dashboard · Docs" : `${page.title} · Advanced Security Dashboard`;
  }, [page]);

  const go = (id: string) => {
    window.location.hash = `/${id}`;
    setDrawer(false);
  };
  const toggleTheme = () => {
    localStorage.setItem("docs-theme", dark ? "light" : "dark");
    setDark(!dark);
  };
  const markdown = pageMarkdown(page);

  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Button className={styles.menu} appearance="subtle" icon={<NavigationRegular />} aria-label="Open navigation" onClick={() => setDrawer(true)} />
          <a className={styles.brand} href="#/home">
            <img className={styles.logo} src="./icon.png" alt="" />
            <Text weight="semibold" size={400}>
              Advanced Security Dashboard
            </Text>
          </a>
          <Badge appearance="tint" color="brand">
            {VERSION}
          </Badge>
          <span className={styles.spacer} />
          {REPO_URL && (
            <>
              <Button as="a" href={`${REPO_URL}/releases/latest`} appearance="subtle" icon={<ArrowDownloadRegular />}>
                Download
              </Button>
              <Tooltip content="Source on GitHub" relationship="label">
                <Button as="a" href={REPO_URL} appearance="subtle" icon={<CodeRegular />} />
              </Tooltip>
            </>
          )}
          <Tooltip content={dark ? "Switch to light theme" : "Switch to dark theme"} relationship="label">
            <Button appearance="subtle" icon={dark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />} onClick={toggleTheme} />
          </Tooltip>
        </header>

        <OverlayDrawer open={drawer} onOpenChange={(_, d) => setDrawer(d.open)}>
          <DrawerHeader>
            <DrawerHeaderTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label="Close" onClick={() => setDrawer(false)} />}>Documentation</DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody>
            <Nav current={page.id} onSelect={go} />
          </DrawerBody>
        </OverlayDrawer>

        <div className={styles.body}>
          <aside className={styles.side}>
            <div className={styles.sideInner}>
              <Nav current={page.id} onSelect={go} />
            </div>
          </aside>
          <main className={styles.main}>
            {page.id === "home" || !markdown ? <Home go={go} /> : <Markdown source={markdown} />}
            <footer className={styles.footer}>
              <Divider />
              <Text size={200}>
                Advanced Security Dashboard for Azure DevOps · documentation {VERSION}
              </Text>
            </footer>
          </main>
        </div>
      </div>
    </FluentProvider>
  );
}
