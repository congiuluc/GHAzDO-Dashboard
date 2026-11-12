import { useEffect, useMemo, useState } from "react";
import { Breadcrumb, type IBreadcrumbItem } from "azure-devops-ui/Breadcrumb";
import { Button } from "azure-devops-ui/Button";
import { Dropdown } from "azure-devops-ui/Dropdown";
import type { IListBoxItem } from "azure-devops-ui/ListBox";
import { TextField } from "azure-devops-ui/TextField";
import { DropdownMultiSelection, DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import type { IListSelection } from "azure-devops-ui/List";
import { ALERT_KINDS, SEVERITIES, STATES, type DashboardData, type Filters } from "@ghazdo/shared";

interface Option {
  id: string;
  label: string;
}

const KIND_LABELS: Record<string, string> = { code: "Code scanning", dependency: "Dependencies", secret: "Secrets", other: "Other" };
const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** Ids of the items selected in an azure-devops-ui list selection. */
function selectedIds(selection: IListSelection, items: IListBoxItem[]): string[] {
  const ids: string[] = [];
  for (const r of selection.value) for (let i = r.beginIndex; i <= r.endIndex; i++) if (items[i]) ids.push(items[i]!.id);
  return ids;
}

/** Controlled multi-select built on the azure-devops-ui Dropdown, with a filter box for long lists. */
export function MultiSelect({ label, options, selected, onChange, disabled, className = "filter-dropdown" }: { label: string; options: Option[]; selected: string[]; onChange: (v: string[]) => void; disabled?: boolean; className?: string }) {
  const selection = useMemo(() => new DropdownMultiSelection(), []);
  const items = useMemo<IListBoxItem[]>(() => options.map((o) => ({ id: o.id, text: o.label })), [options]);
  const key = selected.join("\u0000");

  useEffect(() => {
    selection.clear();
    items.forEach((item, i) => selected.includes(item.id) && selection.select(i, 1, true, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, items, key]);

  return (
    <Dropdown
      className={className}
      ariaLabel={label}
      placeholder={`${label}: all`}
      items={items}
      selection={selection}
      disabled={disabled}
      showFilterBox={items.length > 8}
      filterPlaceholderText={`Find ${label.toLowerCase()}`}
      noItemsText="No options yet"
      onSelect={() => onChange(selectedIds(selection, items))}
      renderSelectedItems={(sel, all) => {
        const ids = selectedIds(sel, all);
        return ids.length === 1 ? `${label}: ${all.find((i) => i.id === ids[0])?.text ?? ids[0]}` : `${label}: ${ids.length} selected`;
      }}
      actions={[
        {
          className: "bolt-dropdown-action-right-button",
          disabled: selected.length === 0,
          iconProps: { iconName: "Clear" },
          text: "Clear",
          onClick: () => {
            selection.clear();
            onChange([]);
          },
        },
      ]}
    />
  );
}

/** Controlled single-select Dropdown. */
export function SingleSelect({ label, options, value, onChange, className = "filter-dropdown" }: { label: string; options: Option[]; value: string; onChange: (v: string) => void; className?: string }) {
  const selection = useMemo(() => new DropdownSelection(), []);
  const items = useMemo<IListBoxItem[]>(() => options.map((o) => ({ id: o.id, text: o.label })), [options]);
  useEffect(() => {
    const i = items.findIndex((x) => x.id === value);
    if (i >= 0) selection.select(i);
    else selection.clear();
  }, [selection, items, value]);
  return <Dropdown className={className} ariaLabel={label} items={items} selection={selection} onSelect={(_, item) => onChange(item.id)} />;
}

const PERIODS = [7, 14, 30, 60, 90, 180, 365];

export function FilterBar({
  filters,
  options,
  onChange,
  projectLocked,
  maxDays,
}: {
  filters: Filters;
  options: DashboardData["filterOptions"] | undefined;
  onChange: (f: Filters) => void;
  projectLocked: boolean;
  maxDays: number;
}) {
  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => {
    if (search === filters.search) return;
    const t = setTimeout(() => onChange({ ...filters, search }), 300);
    return () => clearTimeout(t);
  }, [search, filters, onChange]);

  const projects = useMemo(() => options?.projects ?? [], [options]);
  const repos = useMemo(() => (options?.repositories ?? []).filter((r) => !filters.projectIds.length || filters.projectIds.includes(r.projectId)), [options, filters.projectIds]);
  const showProjectPrefix = !projectLocked && filters.projectIds.length !== 1;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });

  const projectOptions = useMemo(() => projects.map((p) => ({ id: p.id, label: p.name })), [projects]);
  const repoOptions = useMemo(
    () => repos.map((r) => ({ id: r.id, label: showProjectPrefix ? `${projects.find((p) => p.id === r.projectId)?.name ?? r.projectId} / ${r.name}` : r.name })),
    [repos, projects, showProjectPrefix],
  );
  const kindOptions = useMemo(() => ALERT_KINDS.map((k) => ({ id: k, label: KIND_LABELS[k] ?? k })), []);
  const severityOptions = useMemo(() => SEVERITIES.map((s) => ({ id: s, label: capitalize(s) })), []);
  const stateOptions = useMemo(() => STATES.map((s) => ({ id: s, label: capitalize(s) })), []);
  const periodOptions = useMemo(() => PERIODS.filter((p) => p <= maxDays).map((p) => ({ id: String(p), label: `Last ${p} days` })), [maxDays]);

  const activeCount = (projectLocked ? 0 : filters.projectIds.length) + filters.repositoryIds.length + filters.kinds.length + filters.severities.length + filters.states.length + (filters.search ? 1 : 0);

  return (
    <div className="filterbar" role="search" aria-label="Dashboard filters">
      {!projectLocked && (
        <MultiSelect
          label="Projects"
          options={projectOptions}
          selected={filters.projectIds}
          onChange={(ids) => onChange({ ...filters, projectIds: ids, repositoryIds: filters.repositoryIds.filter((r) => !ids.length || ids.includes(repos.find((x) => x.id === r)?.projectId ?? "")) })}
        />
      )}
      <MultiSelect label="Repositories" options={repoOptions} selected={filters.repositoryIds} onChange={(v) => set("repositoryIds", v)} />
      <MultiSelect label="Type" options={kindOptions} selected={filters.kinds} onChange={(v) => set("kinds", v as Filters["kinds"])} />
      <MultiSelect label="Severity" options={severityOptions} selected={filters.severities} onChange={(v) => set("severities", v as Filters["severities"])} />
      <MultiSelect label="State" options={stateOptions} selected={filters.states} onChange={(v) => set("states", v as Filters["states"])} />
      <SingleSelect label="Trend period" options={periodOptions} value={String(filters.periodDays)} onChange={(v) => set("periodDays", Number(v))} />
      <TextField
        className="filter-search"
        prefixIconProps={{ iconName: "Search" }}
        placeholder="Search title, rule, package, secret type, repository"
        ariaLabel="Search alerts"
        value={search}
        onChange={(_, v) => setSearch(v)}
      />
      {activeCount > 0 && (
        <Button
          subtle
          iconProps={{ iconName: "ClearFilter" }}
          text={`Clear all (${activeCount})`}
          onClick={() => onChange({ ...filters, projectIds: projectLocked ? filters.projectIds : [], repositoryIds: [], kinds: [], severities: [], states: [], search: "" })}
        />
      )}
    </div>
  );
}

export function Breadcrumbs({
  filters,
  options,
  onChange,
  projectLocked,
  rootLabel,
}: {
  filters: Filters;
  options: DashboardData["filterOptions"] | undefined;
  onChange: (f: Filters) => void;
  projectLocked: boolean;
  rootLabel: string;
}) {
  const project = filters.projectIds.length === 1 ? options?.projects.find((p) => p.id === filters.projectIds[0]) : undefined;
  const repo = filters.repositoryIds.length === 1 ? options?.repositories.find((r) => r.id === filters.repositoryIds[0]) : undefined;
  const items: IBreadcrumbItem[] = [{ key: "root", text: rootLabel, onClick: () => onChange({ ...filters, projectIds: projectLocked ? filters.projectIds : [], repositoryIds: [] }) }];
  if (project && !projectLocked) items.push({ key: "project", text: project.name, onClick: () => onChange({ ...filters, repositoryIds: [] }) });
  if (filters.projectIds.length > 1) items.push({ key: "projects", text: `${filters.projectIds.length} projects` });
  if (repo) items.push({ key: "repo", text: repo.name });
  if (filters.repositoryIds.length > 1) items.push({ key: "repos", text: `${filters.repositoryIds.length} repositories` });
  return <Breadcrumb className="ga-breadcrumbs" ariaLabel="Breadcrumb" items={items} />;
}
