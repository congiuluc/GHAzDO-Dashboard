import {
  Badge,
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  FluentProvider,
  makeStyles,
  mergeClasses,
  OverlayDrawer,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowLeftRegular,
  ArrowRightRegular,
  CodeRegular,
  DismissRegular,
  NavigationRegular,
  SearchRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { Home } from "./Home";
import { Markdown, type Heading } from "./Markdown";
import { REPO_URL, VERSION } from "./env";
import { findPage, PAGES, pageMarkdown } from "./pages";
import { Search } from "./Search";
import { darkTheme, lightTheme } from "./theme";

const useStyles = makeStyles({
  shell: { minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: tokens.colorNeutralBackground2 },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    height: "60px",
    padding: `0 clamp(12px, 3vw, 32px)`,
    backgroundColor: `color-mix(in srgb, ${tokens.colorNeutralBackground1} 78%, transparent)`,
    backdropFilter: "saturate(180%) blur(14px)",
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  brand: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, color: "inherit", textDecoration: "none", marginRight: tokens.spacingHorizontalS },
  logo: { width: "30px", height: "30px", borderRadius: tokens.borderRadiusLarge },
  brandName: { "@media (max-width: 560px)": { display: "none" } },
  spacer: { flex: 1 },
  menu: { "@media (min-width: 1000px)": { display: "none" } },
  searchBtn: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    width: "min(280px, 40vw)",
    height: "36px",
    padding: `0 ${tokens.spacingHorizontalM}`,
    font: "inherit",
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    cursor: "pointer",
    ":hover": { border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1Hover}` },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  kbd: {
    marginLeft: "auto",
    padding: "1px 6px",
    fontSize: tokens.fontSizeBase100,
    fontFamily: tokens.fontFamilyBase,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    "@media (max-width: 560px)": { display: "none" },
  },
  hideSmall: { "@media (max-width: 760px)": { display: "none" } },

  body: { flex: 1, display: "flex" },
  side: {
    width: "272px",
    flexShrink: 0,
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalM}`,
    borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    "@media (max-width: 999px)": { display: "none" },
  },
  sideInner: { position: "sticky", top: "84px", maxHeight: "calc(100vh - 100px)", overflowY: "auto" },
  group: {
    display: "block",
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXS}`,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: tokens.colorNeutralForeground3,
  },
  link: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    margin: "1px 0",
    borderRadius: tokens.borderRadiusLarge,
    color: tokens.colorNeutralForeground2,
    textDecoration: "none",
    fontSize: tokens.fontSizeBase300,
    ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover, color: tokens.colorNeutralForeground1 },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  linkIcon: { fontSize: "18px", flexShrink: 0 },
  linkActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    ":hover": { backgroundColor: tokens.colorBrandBackground2Hover, color: tokens.colorBrandForeground1 },
  },

  main: { flex: 1, minWidth: 0, padding: `40px clamp(16px, 4vw, 56px) 32px` },
  docGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 820px) 220px",
    gap: "56px",
    justifyContent: "center",
    "@media (max-width: 1280px)": { gridTemplateColumns: "minmax(0, 820px)" },
  },
  eyebrow: { display: "block", marginBottom: tokens.spacingVerticalS, color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  toc: { position: "sticky", top: "92px", alignSelf: "start", "@media (max-width: 1280px)": { display: "none" } },
  tocTitle: { display: "block", marginBottom: tokens.spacingVerticalS, fontWeight: tokens.fontWeightSemibold },
  tocList: { listStyle: "none", margin: 0, padding: 0, borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  tocLink: {
    display: "block",
    marginLeft: "-1px",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderLeft: `${tokens.strokeWidthThin} solid transparent`,
    color: tokens.colorNeutralForeground3,
    textDecoration: "none",
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    ":hover": { color: tokens.colorNeutralForeground1 },
  },
  tocSub: { paddingLeft: tokens.spacingHorizontalXL },
  tocActive: { color: tokens.colorBrandForeground1, borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke1}` },

  pager: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: tokens.spacingHorizontalL, marginTop: "56px", maxWidth: "820px" },
  pageCard: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: tokens.spacingHorizontalL,
    borderRadius: "14px",
    textDecoration: "none",
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    ":hover": { border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke2}` },
  },
  next: { gridColumn: 2, textAlign: "right", alignItems: "flex-end" },
  pageLabel: { display: "flex", alignItems: "center", gap: "4px", color: tokens.colorNeutralForeground3 },

  footer: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    maxWidth: "1180px",
    margin: "72px auto 0",
    paddingTop: tokens.spacingVerticalL,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
  },
});

const parseHash = () => {
  const [, route = "", anchor = ""] = /^#\/?([^#?]*)(?:[?][^#]*)?(?:#(.*))?$/.exec(window.location.hash) ?? [];
  return { route: route || "home", anchor };
};

function Nav({ current, onNavigate }: { current: string; onNavigate?: () => void }) {
  const s = useStyles();
  const groups = [...new Set(PAGES.map((p) => p.group))];
  return (
    <nav aria-label="Documentation">
      {groups.map((g) => (
        <div key={g}>
          <span className={s.group}>{g}</span>
          {PAGES.filter((p) => p.group === g).map((p) => (
            <a
              key={p.id}
              href={`#/${p.id}`}
              onClick={onNavigate}
              aria-current={p.id === current ? "page" : undefined}
              className={mergeClasses(s.link, p.id === current && s.linkActive)}
            >
              <p.icon className={s.linkIcon} />
              {p.title}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Toc({ pageId, headings }: { pageId: string; headings: Heading[] }) {
  const s = useStyles();
  const [active, setActive] = useState("");
  useEffect(() => {
    if (!headings.length) return;
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((e) => observer.observe(e));
    setActive(headings[0]!.id);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return <aside className={s.toc} />;
  return (
    <aside className={s.toc} aria-label="On this page">
      <Text size={200} className={s.tocTitle}>
        On this page
      </Text>
      <ul className={s.tocList}>
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#/${pageId}#${h.id}`} className={mergeClasses(s.tocLink, h.level === 3 && s.tocSub, active === h.id && s.tocActive)}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function App() {
  const s = useStyles();
  const [{ route, anchor }, setLocation] = useState(parseHash);
  const [dark, setDark] = useState(() => localStorage.getItem("docs-theme") === "dark" || (!localStorage.getItem("docs-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches));
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const page = findPage(route);
  const markdown = pageMarkdown(page);
  const index = PAGES.indexOf(page);
  const prev = index > 0 ? PAGES[index - 1] : undefined;
  const next = PAGES[index + 1];

  useEffect(() => {
    const onHash = () => setLocation(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.title = page.id === "home" ? "Advanced Security Dashboard · Docs" : `${page.title} · Advanced Security Dashboard`;
    if (page.id === "home" || !markdown) setHeadings([]);
  }, [page, markdown]);

  // Runs after Markdown has assigned heading ids.
  useEffect(() => {
    const target = anchor ? document.getElementById(decodeURIComponent(anchor)) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  }, [route, anchor, headings]);

  const go = (r: string) => {
    window.location.hash = `/${r}`;
    setDrawer(false);
  };
  const toggleTheme = () => {
    localStorage.setItem("docs-theme", dark ? "light" : "dark");
    setDark(!dark);
  };
  const onHeadings = useCallback((h: Heading[]) => setHeadings(h), []);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <FluentProvider theme={dark ? darkTheme : lightTheme}>
      <div className={s.shell}>
        <header className={s.header}>
          <Button className={s.menu} appearance="subtle" icon={<NavigationRegular />} aria-label="Open navigation" onClick={() => setDrawer(true)} />
          <a className={s.brand} href="#/home">
            <img className={s.logo} src="./icon.png" alt="" />
            <Text weight="semibold" size={400} className={s.brandName}>
              Advanced Security Dashboard
            </Text>
          </a>
          <Badge appearance="tint" shape="rounded" color="brand" className={s.hideSmall}>
            {VERSION}
          </Badge>
          <span className={s.spacer} />
          <button type="button" className={s.searchBtn} onClick={() => setSearch(true)} aria-label="Search documentation">
            <SearchRegular />
            <span>Search</span>
            <kbd className={s.kbd}>{isMac ? "⌘" : "Ctrl"} K</kbd>
          </button>
          {REPO_URL && (
            <>
              <Button as="a" href={`${REPO_URL}/releases/latest`} appearance="subtle" icon={<ArrowDownloadRegular />} className={s.hideSmall}>
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

        <Search open={search} onClose={() => setSearch(false)} go={go} />

        <OverlayDrawer open={drawer} onOpenChange={(_, d) => setDrawer(d.open)}>
          <DrawerHeader>
            <DrawerHeaderTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label="Close" onClick={() => setDrawer(false)} />}>Documentation</DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody>
            <Nav current={page.id} onNavigate={() => setDrawer(false)} />
          </DrawerBody>
        </OverlayDrawer>

        <div className={s.body}>
          <aside className={s.side}>
            <div className={s.sideInner}>
              <Nav current={page.id} />
            </div>
          </aside>
          <main className={s.main}>
            {page.id === "home" || !markdown ? (
              <Home go={go} />
            ) : (
              <div className={s.docGrid}>
                <div>
                  <Text size={300} className={s.eyebrow}>
                    {page.group}
                  </Text>
                  <Markdown key={page.id} source={markdown} pageId={page.id} onHeadings={onHeadings} />
                  <nav className={s.pager} aria-label="Pages">
                    {prev && (
                      <a className={s.pageCard} href={`#/${prev.id}`}>
                        <Text size={200} className={s.pageLabel}>
                          <ArrowLeftRegular /> Previous
                        </Text>
                        <Text weight="semibold">{prev.title}</Text>
                      </a>
                    )}
                    {next && (
                      <a className={mergeClasses(s.pageCard, s.next)} href={`#/${next.id}`}>
                        <Text size={200} className={s.pageLabel}>
                          Next <ArrowRightRegular />
                        </Text>
                        <Text weight="semibold">{next.title}</Text>
                      </a>
                    )}
                  </nav>
                </div>
                <Toc pageId={page.id} headings={headings} />
              </div>
            )}
            <footer className={s.footer}>
              <Text size={200}>Advanced Security Dashboard for Azure DevOps</Text>
              <Text size={200}>Documentation {VERSION}</Text>
            </footer>
          </main>
        </div>
      </div>
    </FluentProvider>
  );
}
