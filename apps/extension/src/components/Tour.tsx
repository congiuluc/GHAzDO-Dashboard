import { useEffect, useLayoutEffect, useState } from "react";
import { TeachingBubble } from "azure-devops-ui/TeachingBubble";
import { Location, type IOrigin } from "azure-devops-ui/Utilities/Position";

export interface TourStep {
  id: string;
  title: string;
  text: React.ReactNode;
  /** Returns the element the bubble points at; steps whose anchor is missing are skipped. */
  anchor: () => HTMLElement | null;
  /** Elements to spotlight when they differ from the anchor; their combined bounds are highlighted. */
  highlight?: () => HTMLElement[];
  origin?: IOrigin;
}

const BELOW: IOrigin = { horizontal: Location.center, vertical: Location.end };
/** Narrower layouts stack panels full width, leaving no room for a bubble beside them. */
const SIDE_PLACEMENT_MIN_WIDTH = 1024;

const STORAGE_PREFIX = "ghazdo.tour.v1.";

export function tourSeen(key: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === "done";
  } catch {
    return true;
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, "done");
  } catch {
    // Storage can be blocked in some browsers; the tour then just won't auto-start next time either.
  }
}

const SPOTLIGHT_PADDING = 6;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Dims the page and outlines the highlighted elements, following them while they scroll or resize. */
export function Spotlight({ targets }: { targets: HTMLElement[] }) {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!targets.length) return;
    let frame = 0;
    let last = "";
    const measure = () => {
      const rs = targets.map((t) => t.getBoundingClientRect());
      const top = Math.min(...rs.map((r) => r.top));
      const left = Math.min(...rs.map((r) => r.left));
      const right = Math.max(...rs.map((r) => r.right));
      const bottom = Math.max(...rs.map((r) => r.bottom));
      const next = {
        top: top - SPOTLIGHT_PADDING,
        left: left - SPOTLIGHT_PADDING,
        width: right - left + SPOTLIGHT_PADDING * 2,
        height: bottom - top + SPOTLIGHT_PADDING * 2,
      };
      const key = `${next.top}|${next.left}|${next.width}|${next.height}`;
      if (key !== last) {
        last = key;
        setRect(next);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [targets]);

  if (!rect) return null;
  return (
    <>
      {/* Swallows clicks so the page cannot change under the tour. */}
      <div className="tour-blocker" aria-hidden="true" />
      <div className="tour-spotlight" aria-hidden="true" style={rect} />
    </>
  );
}

/** Guided tour of the dashboard, rendered as a sequence of azure-devops-ui teaching bubbles. */
export function Tour({ storageKey, steps, onClose }: { storageKey: string; steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [targets, setTargets] = useState<HTMLElement[]>([]);

  // Resolve the current step's anchor, skipping steps whose element is not on the page.
  useLayoutEffect(() => {
    let i = index;
    while (i < steps.length && !steps[i]?.anchor()) i++;
    const el = steps[i]?.anchor();
    if (!el) {
      finish();
      return;
    }
    if (i !== index) {
      setIndex(i);
      return;
    }
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const extra = steps[i]?.highlight?.() ?? [];
    setTargets(extra.length ? extra : [el]);
    setAnchor(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, steps]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    markSeen(storageKey);
    onClose();
  }

  const step = steps[index];
  if (!step || !anchor) return null;

  const visible = steps.filter((s) => s.anchor());
  const position = visible.indexOf(step) + 1;
  const last = !steps.slice(index + 1).some((s) => s.anchor());

  return (
    <>
    <Spotlight key={`spotlight-${step.id}`} targets={targets} />
    <TeachingBubble
      key={step.id}
      anchorElement={anchor}
      anchorOrigin={(window.innerWidth >= SIDE_PLACEMENT_MIN_WIDTH && step.origin) || BELOW}
      title={step.title}
      text={
        <>
          <div>{step.text}</div>
          <div className="tour-progress" aria-live="polite">
            {position} of {visible.length}
          </div>
        </>
      }
      onDismiss={finish}
      primaryButtonProps={{ text: last ? "Done" : "Next", onClick: () => (last ? finish() : setIndex(index + 1)) }}
      secondaryButtonProps={index > 0 ? { text: "Back", onClick: () => setIndex(Math.max(0, index - 1)) } : { text: "Skip tour", onClick: finish }}
    />
          </>
  );
}

const q = (selector: string) => () => document.querySelector<HTMLElement>(selector);
const section = (label: string) => q(`section[aria-label="${label}"]`);
const sections = (...labels: string[]) => () =>
  labels.map((label) => document.querySelector<HTMLElement>(`section[aria-label="${label}"]`)).filter((el): el is HTMLElement => !!el);
const selectedTab = q('[role=tab][aria-selected="true"]');
const SIDE: IOrigin = { horizontal: Location.start, vertical: Location.center };

function tab(label: string) {
  return () => Array.from(document.querySelectorAll<HTMLElement>("[role=tab]")).find((t) => t.textContent?.trim() === label) ?? null;
}

export type DashboardTab = "overview" | "code" | "dependencies" | "secrets" | "coverage" | "alerts" | "settings";

/** Each tab has its own tour; the overview keeps the original key so users who finished it are not shown it again. */
export function tabTourKey(scope: "org" | "project", tabId: string): string {
  return tabId === "overview" ? scope : `${scope}.${tabId}`;
}

/** Tour content for the selected dashboard tab. */
export function tabTourSteps(tabId: string, opts: { isProject: boolean; isBrowser: boolean; canCreateTasks: boolean }): TourStep[] {
  switch (tabId as DashboardTab) {
    case "code":
      return [
        { id: "code-intro", title: "Code scanning", text: "Focuses on CodeQL and other code scanning results: which rules fire most and which tools report them.", anchor: selectedTab },
        { id: "code-rules", title: "Top rules", text: "Rules with the most open alerts. Select a rule to open its alerts and fix the pattern once across repositories.", anchor: section("Top code scanning rules") },
        { id: "code-tools", title: "Scanning tools", text: "Open alerts per analysis tool, so you can spot a misconfigured or noisy scanner.", anchor: section("Code scanning tools"), origin: SIDE },
      ];
    case "dependencies":
      return [
        { id: "dep-intro", title: "Dependencies", text: "Vulnerable open-source packages reported by dependency scanning.", anchor: selectedTab },
        { id: "dep-packages", title: "Most vulnerable packages", text: "Packages with the most open alerts. Select one to see every affected repository.", anchor: section("Most vulnerable packages") },
        { id: "dep-upgrade", title: "Upgrade impact", text: "Estimates how many alerts each package upgrade would close, using the fixed versions reported by the advisories.", anchor: section("Potential package upgrade impact") },
        { id: "dep-fix", title: "Fix availability", text: "How many alerts already have a patched version available: the quickest wins.", anchor: section("Fix availability"), origin: SIDE },
        {
          id: "dep-ecosystems",
          title: "Ecosystems and advisories",
          text: "Break alerts down by package ecosystem and by CVE / GHSA advisory.",
          anchor: section("Ecosystems"),
          highlight: sections("Ecosystems", "Top advisories (CVE / GHSA)"),
        },
      ];
    case "secrets":
      return [
        { id: "sec-intro", title: "Secrets", text: "Credentials committed to repositories. Exposed secrets should be rotated first, then the alert closed.", anchor: selectedTab },
        {
          id: "sec-exposure",
          title: "Exposure and validity",
          text: "How many secrets have been exposed for over a week, whether they are still valid, and how long they have been open.",
          anchor: section("Secrets exposed for more than 7 days"),
          highlight: sections("Secrets exposed for more than 7 days", "Secret validity", "Open secret age"),
        },
        {
          id: "sec-where",
          title: "Where and what",
          text: "Repositories with the most exposed secrets and the most common secret types. Select a row to open its alerts.",
          anchor: section("Repositories with exposed secrets"),
          highlight: sections("Repositories with exposed secrets", "Secret types"),
        },
        { id: "sec-weekly", title: "Detected vs closed", text: "Weekly trend of new secrets versus closed ones; closing should keep pace with detection.", anchor: section("Secrets detected vs closed per week") },
      ];
    case "coverage":
      return [
        { id: "cov-intro", title: "Coverage", text: "Shows which repositories have each Advanced Security scanner enabled.", anchor: selectedTab },
        {
          id: "cov-kpis",
          title: "Enablement at a glance",
          text: "Share of repositories with code scanning, dependency scanning and secret protection enabled. Unknown means the status could not be read with your permissions.",
          anchor: section("Code scanning enabled"),
          highlight: sections("Code scanning enabled", "Dependency scanning enabled", "Secret protection enabled", "Enablement unknown"),
        },
        { id: "cov-table", title: "Per repository", text: "Every repository and its scanner status, so you can find the gaps to enable next.", anchor: section("Repository coverage") },
        { id: "cov-trend", title: "Coverage trend", text: "How enablement has changed over the selected period.", anchor: section("Scanner coverage trend") },
      ];
    case "alerts":
      return [
        { id: "alerts-intro", title: "Every alert", text: "Individual alerts matching the filters above, with project, repository, branch / ref and age.", anchor: selectedTab },
        {
          id: "alerts-table",
          title: "Sort and open",
          text: "Sort by any column. Select a title to open the alert in Azure DevOps, or a project or repository to drill into it.",
          anchor: q(".alert-table .bolt-table-card"),
        },
        {
          id: "alerts-actions",
          title: opts.canCreateTasks ? "Create tasks and export" : "Export",
          text: opts.canCreateTasks
            ? "Select rows, then Create Task to add Azure Boards tasks grouped by project. Export CSV downloads up to 50,000 alerts."
            : "Export CSV downloads up to 50,000 alerts matching the current filters.",
          anchor: q(".alert-table > .toolbar"),
        },
      ];
    case "settings":
      return [
        { id: "settings-org", title: "Organization settings", text: "Admins configure the optional shared backend, history retention, SLA targets and the weekly email digest.", anchor: section("Organization settings") },
        { id: "settings-user", title: "Your data", text: "Manage data cached in this browser and saving your history to your Azure DevOps profile.", anchor: section("Your data"), origin: SIDE },
      ];
    default:
      return overviewTourSteps(opts);
  }
}

function overviewTourSteps(opts: { isProject: boolean; isBrowser: boolean }): TourStep[] {
  const { isProject, isBrowser } = opts;
  return [
    {
      id: "welcome",
      title: "Welcome to Advanced Security",
      text: isProject
        ? "This dashboard brings code scanning, dependency scanning and secret scanning alerts from every repository in this project into one view."
        : "This dashboard brings code scanning, dependency scanning and secret scanning alerts from every project in the organization into one view.",
      anchor: q(".bolt-header-title-area, .bolt-header-title"),
    },
    {
      id: "collect",
      title: isBrowser ? "Collect alerts" : "Reload",
      text: isBrowser
        ? "Collect now scans the projects and repositories you can access, using your own permissions. Results are cached in this browser."
        : "Reload fetches the latest data. Alerts are collected on a schedule by the shared backend.",
      anchor: q(".bolt-header-commandbar"),
      origin: { horizontal: Location.end, vertical: Location.end },
    },
    {
      id: "filters",
      title: "Filter everything",
      text: isProject
        ? "Narrow every panel by repository, alert type, severity, state and time period, or search titles, rules, packages and secret types."
        : "Narrow every panel by project, repository, alert type, severity, state and time period, or search titles, rules, packages and secret types.",
      anchor: q(".filterbar"),
    },
    {
      id: "breadcrumbs",
      title: "Drill down and back",
      text: "The breadcrumb shows where you are. Select a level to step back out of a project or repository.",
      anchor: q(".ga-breadcrumbs"),
    },
    {
      id: "kpis",
      title: "Key numbers",
      text: "Open, critical and high, new and fixed alerts at a glance. Select a tile to see the matching alerts.",
      anchor: q('section[aria-label="Open alerts"]'),
      highlight: () =>
        ["Open alerts", "Critical + high open", "New (7 days)", "Fixed (7 days)"]
          .map((label) => document.querySelector<HTMLElement>(`section[aria-label="${label}"]`))
          .filter((el): el is HTMLElement => !!el),
    },
    {
      id: "charts",
      title: "Click to drill down",
      text: "Select any chart segment, bar or row to filter the dashboard to it and open the matching alerts.",
      anchor: q('section[aria-label="Open alerts by severity"]'),
    },
    {
      id: "freshness",
      title: "Data freshness",
      text: "Shows when data was last collected and which repositories are stale, failed or have Advanced Security disabled.",
      anchor: q('section[aria-label="Data freshness"]'),
      origin: { horizontal: Location.start, vertical: Location.center },
    },
    {
      id: "tabs",
      title: "Focus by scanner",
      text: "Overview summarizes everything. Code scanning, Dependencies and Secrets focus on one scanner, and Coverage shows which repositories are protected. Each tab has its own short tour: open a tab and select Take the tour.",
      anchor: () => tab("Code scanning")()?.closest<HTMLElement>("[role=tablist]") ?? tab("Code scanning")(),
    },
    {
      id: "alerts",
      title: "Every alert",
      text: "The Alerts tab lists individual alerts with sorting and CSV export, and links each one to Azure DevOps.",
      anchor: tab("Alerts"),
    },
    {
      id: "settings",
      title: "Settings",
      text: "Configure the optional shared backend, history retention and saving your history to your Azure DevOps profile.",
      anchor: tab("Settings"),
    },
  ];
}
