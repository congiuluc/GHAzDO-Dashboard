import { useEffect, useLayoutEffect, useState } from "react";
import { TeachingBubble } from "azure-devops-ui/TeachingBubble";
import { Location, type IOrigin } from "azure-devops-ui/Utilities/Position";

export interface TourStep {
  id: string;
  title: string;
  text: React.ReactNode;
  /** Returns the element the bubble points at; steps whose anchor is missing are skipped. */
  anchor: () => HTMLElement | null;
  origin?: IOrigin;
}

const BELOW: IOrigin = { horizontal: Location.center, vertical: Location.end };

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

/** Guided tour of the dashboard, rendered as a sequence of azure-devops-ui teaching bubbles. */
export function Tour({ storageKey, steps, onClose }: { storageKey: string; steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

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
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    <TeachingBubble
      key={step.id}
      anchorElement={anchor}
      anchorOrigin={step.origin ?? BELOW}
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
  );
}

const q = (selector: string) => () => document.querySelector<HTMLElement>(selector);

function tab(label: string) {
  return () => Array.from(document.querySelectorAll<HTMLElement>("[role=tab]")).find((t) => t.textContent?.trim() === label) ?? null;
}

/** Tour content for the organization and project dashboards. */
export function dashboardTourSteps(opts: { isProject: boolean; isBrowser: boolean }): TourStep[] {
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
      text: "Code scanning, Dependencies and Secrets have dedicated views. Coverage shows which repositories are protected.",
      anchor: tab("Code scanning"),
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
