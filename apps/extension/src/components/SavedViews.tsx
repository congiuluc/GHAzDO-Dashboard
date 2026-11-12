import { useEffect, useMemo, useState } from "react";
import { Button } from "azure-devops-ui/Button";
import type { DashboardScope, Filters } from "@ghazdo/shared";
import type { HostInfo } from "../sdk";
import { dashboardUrl, decodeView, encodeView, type ViewState } from "../urlState";

interface SavedView {
  id: string;
  name: string;
  view: ViewState;
}

const MAX_SAVED_VIEWS = 20;

function storageKey(host: HostInfo, scope: DashboardScope): string {
  return `ghazdo-saved-views:${host.organization}:${host.user.id}:${scope.kind === "project" ? scope.projectId : "organization"}`;
}

function readViews(key: string): SavedView[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is SavedView =>
        item && typeof item.id === "string" && typeof item.name === "string" && item.view?.filters && typeof item.view.tab === "string",
    );
  } catch {
    return [];
  }
}

export function SavedViews({ host, scope, view, tabs, maxDays, onApply }: {
  host: HostInfo;
  scope: DashboardScope;
  view: ViewState;
  tabs: readonly string[];
  maxDays: number;
  onApply: (filters: Filters, tab: string) => void;
}) {
  const key = useMemo(() => storageKey(host, scope), [host, scope]);
  const [views, setViews] = useState<SavedView[]>(() => readViews(key));
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setViews(readViews(key));
    setSelectedId("");
    setMessage("");
  }, [key]);

  function persist(next: SavedView[]) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setViews(next);
      setMessage("");
    } catch (err) {
      setMessage(`Could not save views in this browser: ${(err as Error).message}`);
    }
  }

  function save() {
    if (views.length >= MAX_SAVED_VIEWS) {
      setMessage(`You can save up to ${MAX_SAVED_VIEWS} views per dashboard.`);
      return;
    }
    const name = prompt("Name this dashboard view")?.trim();
    if (!name) return;
    const saved: SavedView = { id: crypto.randomUUID(), name: name.slice(0, 80), view: { filters: view.filters, tab: view.tab } };
    const next = [...views, saved];
    persist(next);
    setSelectedId(saved.id);
  }

  async function copyLink() {
    try {
      const url = await dashboardUrl(host, scope, encodeView(view));
      await navigator.clipboard.writeText(url);
      setMessage("Share link copied.");
    } catch (err) {
      setMessage(`Could not copy the share link: ${(err as Error).message}`);
    }
  }

  function apply(id: string) {
    setSelectedId(id);
    const saved = views.find((item) => item.id === id);
    if (!saved) return;
    const query = encodeView(saved.view);
    // Decode using the same validation path as links so stale or malformed local data is bounded.
    const restored = decodeView(query, maxDays, tabs);
    onApply(restored.filters, restored.tab);
  }

  const selected = views.find((item) => item.id === selectedId);
  return (
    <div className="saved-views">
      <label htmlFor="saved-view-select">Saved views</label>
      <select
        id="saved-view-select"
        value={selectedId}
        onChange={(event) => apply(event.target.value)}
        disabled={!views.length}
      >
        <option value="">Choose a view</option>
        {views.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <Button text="Save view" iconProps={{ iconName: "Save" }} onClick={save} />
      <Button text="Copy link" iconProps={{ iconName: "Link" }} onClick={() => void copyLink()} />
      <Button
        text="Delete"
        iconProps={{ iconName: "Delete" }}
        disabled={!selected}
        onClick={() => {
          if (selected && confirm(`Delete saved view "${selected.name}"?`)) {
            persist(views.filter((item) => item.id !== selected.id));
            setSelectedId("");
          }
        }}
      />
      {message && <span className="secondary-text" role="status">{message}</span>}
    </div>
  );
}
