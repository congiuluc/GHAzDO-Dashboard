import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "azure-devops-ui/Button";
import { Card } from "azure-devops-ui/Card";
import { Link } from "azure-devops-ui/Link";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { ColumnSorting, SimpleTableCell, SortOrder, Table, type ITableColumn } from "azure-devops-ui/Table";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { ListSelection } from "azure-devops-ui/List";
import type { JsonPatchOperation } from "azure-devops-extension-api/WebApi";
import { alertsToCsv, MAX_PAGE_SIZE, type AlertPage, type AlertSummary, type DashboardScope, type Filters, type SortField } from "@ghazdo/shared";
import type { DataSource } from "../data/dataSource";
import { groupAlertsByProject, workItemDescription } from "../data/workItems";
import { inHost } from "../sdk";
import { Empty, SeverityDot } from "./charts";

const KIND_LABELS: Record<string, string> = { code: "Code", dependency: "Dependency", secret: "Secret", other: "Other" };

export function ReportedRef({ gitRef }: { gitRef?: string }) {
  return (
    <span className="text-ellipsis" title={gitRef}>
      {gitRef?.replace(/^refs\/heads\/(?=.)/, "") || "Not reported"}
    </span>
  );
}

function details(a: AlertSummary): string {
  if (a.kind === "dependency") return [a.packageName && `${a.packageName}@${a.packageVersion ?? "?"}`, a.fixedVersion && `fix: ${a.fixedVersion}`, a.advisoryIds?.join(", ")].filter(Boolean).join(" · ");
  if (a.kind === "secret") return [a.secretType, a.validity && a.validity !== "none" ? `validity: ${a.validity}` : undefined].filter(Boolean).join(" · ");
  return [a.ruleName ?? a.ruleId, a.tool].filter(Boolean).join(" · ");
}

type Sort = { field: SortField; direction: "asc" | "desc" };
type Drill = (f: Partial<Filters>) => void;

export const MAX_CSV_EXPORT_ALERTS = 50_000;

export async function collectCsvExportAlerts(
  fetchPage: (cursor: string | undefined, pageSize: number) => Promise<AlertPage>,
): Promise<{ items: AlertSummary[]; truncated: boolean }> {
  const items: AlertSummary[] = [];
  let next: string | undefined;
  do {
    const pageSize = Math.min(MAX_PAGE_SIZE, MAX_CSV_EXPORT_ALERTS - items.length);
    const page = await fetchPage(next, pageSize);
    items.push(...page.items.slice(0, MAX_CSV_EXPORT_ALERTS - items.length));
    next = page.nextCursor;
  } while (next && items.length < MAX_CSV_EXPORT_ALERTS);
  return { items, truncated: Boolean(next) };
}

/** Column definitions; negative widths are proportional in azure-devops-ui tables. */
function buildColumns(sort: Sort, onDrill: Drill): (ITableColumn<AlertSummary> & { field: SortField | null })[] {
  const cell = (render: (a: AlertSummary) => React.ReactNode) => (_r: number, columnIndex: number, column: ITableColumn<AlertSummary>, a: AlertSummary) => (
    <SimpleTableCell key={column.id} columnIndex={columnIndex} tableColumn={column}>
      {render(a)}
    </SimpleTableCell>
  );
  const col = (id: string, name: string, field: SortField | null, width: number, render: (a: AlertSummary) => React.ReactNode) => ({
    id,
    name,
    field,
    width,
    renderCell: cell(render),
    sortProps: field
      ? { ariaLabelAscending: "Sorted ascending", ariaLabelDescending: "Sorted descending", sortOrder: sort.field === field ? (sort.direction === "asc" ? SortOrder.ascending : SortOrder.descending) : undefined }
      : undefined,
  });
  return [
    col("severity", "Severity", "severity", -9, (a) => <SeverityDot severity={a.severity} />),
    col("title", "Alert", "title", -26, (a) => (
      <Link href={a.url} target="_blank" rel="noopener noreferrer" className="text-ellipsis" subtle={false}>
        {a.title}
      </Link>
    )),
    col("kind", "Type", "kind", -9, (a) => KIND_LABELS[a.kind] ?? a.kind),
    col("repository", "Project / repository", "repository", -20, (a) => (
      <span className="text-ellipsis">
        <button className="link-btn" onClick={() => onDrill({ projectIds: [a.projectId], repositoryIds: [] })}>
          {a.projectName}
        </button>
        {" / "}
        <button className="link-btn" onClick={() => onDrill({ projectIds: [a.projectId], repositoryIds: [a.repositoryId] })}>
          {a.repositoryName}
        </button>
      </span>
    )),
    col("gitRef", "Branch / ref", null, -14, (a) => <ReportedRef gitRef={a.gitRef} />),
    col("state", "State", "state", -10, (a) => a.state),
    col("details", "Details", null, -20, (a) => (
      <span className="text-ellipsis secondary-text" title={details(a)}>
        {details(a)}
      </span>
    )),
    col("firstSeen", "First seen", "firstSeen", -10, (a) => a.firstSeen?.slice(0, 10) ?? "—"),
  ];
}

export function AlertTable({ source, filters, scope, onDrill }: { source: DataSource; filters: Filters; scope: DashboardScope; onDrill: Drill }) {
  const [sort, setSort] = useState<Sort>({ field: "severity", direction: "asc" });
  const [items, setItems] = useState<AlertSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const [exportWarning, setExportWarning] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [workItemStatus, setWorkItemStatus] = useState<string>();
  const [selectedCount, setSelectedCount] = useState(0);

  const load = useCallback(
    async (next?: string) => {
      setLoading(true);
      setError(undefined);
      try {
        const page = await source.getAlerts({ filters, sort, pageSize: 50, cursor: next }, scope);
        setItems((prev) => (next ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
        setCursor(page.nextCursor);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [source, filters, sort, scope],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    setExporting(true);
    setError(undefined);
    setExportWarning(undefined);
    try {
      const { items, truncated } = await collectCsvExportAlerts((cursor, pageSize) =>
        source.getAlerts({ filters, sort, pageSize, cursor }, scope),
      );
      const blob = new Blob([alertsToCsv(items)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `advanced-security-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (truncated) setExportWarning(`CSV export is limited to the first ${MAX_CSV_EXPORT_ALERTS.toLocaleString()} alerts. Refine the filters and export again to include other alerts.`);
    } catch (err) {
      setError(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  const columns = useMemo(() => buildColumns(sort, onDrill), [sort, onDrill]);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  // Sorting is done by the data source so it spans every page, not just the loaded rows.
  const sorting = useMemo(
    () =>
      new ColumnSorting<AlertSummary>((columnIndex, proposed) => {
        const field = columnsRef.current[columnIndex]?.field;
        if (field) setSort({ field, direction: proposed === SortOrder.ascending ? "asc" : "desc" });
      }),
    [],
  );
  const provider = useMemo(() => new ArrayItemProvider(items), [items]);
  const selection = useMemo(() => new ListSelection({ multiSelect: true }), []);

  useEffect(() => {
    selection.clear();
  }, [selection, filters, sort]);

  useEffect(() => {
    const updateSelectionCount = () => setSelectedCount(selection.selectedCount);
    selection.subscribe(updateSelectionCount);
    return () => selection.unsubscribe(updateSelectionCount);
  }, [selection]);

  async function createWorkItems() {
    const selected = selection.value.flatMap((range) => items.slice(range.beginIndex, range.endIndex + 1));
    if (!selected.length) {
      setError("Select one or more alerts first.");
      return;
    }
    const groups = groupAlertsByProject(selected);
    const projects = [...groups.keys()];
    const projectNames = [...new Set(selected.map((a) => a.projectName))];
    if (!confirm(`Create ${groups.size} Task work item${groups.size === 1 ? "" : "s"} for ${selected.length} selected alert${selected.length === 1 ? "" : "s"} in ${projectNames.join(", ")}?`)) return;
    setCreating(true);
    setError(undefined);
    setWorkItemStatus(undefined);
    const created: string[] = [];
    try {
      const [{ getClient }, { WorkItemTrackingRestClient }, { Operation }] = await Promise.all([
        import("azure-devops-extension-api"),
        import("azure-devops-extension-api/WorkItemTracking"),
        import("azure-devops-extension-api/WebApi"),
      ]);
      const client = getClient(WorkItemTrackingRestClient);
      for (const projectId of projects) {
        const alerts = groups.get(projectId)!;
        const title = `Advanced Security remediation (${alerts.length} alert${alerts.length === 1 ? "" : "s"})`;
        const patch: JsonPatchOperation[] = [
          { op: Operation.Add, path: "/fields/System.Title", value: title, from: "" },
          { op: Operation.Add, path: "/fields/System.Description", value: workItemDescription(alerts), from: "" },
          { op: Operation.Add, path: "/fields/System.Tags", value: "Advanced Security", from: "" },
        ];
        const result = await client.createWorkItem(patch, projectId, "Task");
        created.push(`#${result.id} in ${alerts[0]!.projectName}`);
      }
      setWorkItemStatus(`Created ${created.join("; ")}.`);
      selection.clear();
    } catch (err) {
      setError(`${created.length ? `Created ${created.join("; ")}. ` : ""}Work item creation failed: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="alert-table">
      <div className="toolbar">
        <span className="body-m">
          {total.toLocaleString()} alerts{filters.states.length ? "" : " (all states)"}
        </span>
        <span className="body-s secondary-text">Branch / ref is a reported ref; other affected branches may not appear.</span>
        <span className="spacer" />
        {inHost && (
          <Button
            iconProps={{ iconName: "WorkItem" }}
            text={creating ? "Creating…" : `Create Task${selectedCount ? ` (${selectedCount})` : ""}`}
            onClick={() => void createWorkItems()}
            disabled={creating || selectedCount === 0}
          />
        )}
        <Button iconProps={{ iconName: "Download" }} text={exporting ? "Exporting…" : "Export CSV"} onClick={() => void exportCsv()} disabled={exporting || !total} />
      </div>
      {workItemStatus && <MessageCard className="messages" severity={MessageCardSeverity.Info} onDismiss={() => setWorkItemStatus(undefined)}>{workItemStatus}</MessageCard>}
      {exportWarning && <MessageCard className="messages" severity={MessageCardSeverity.Warning} onDismiss={() => setExportWarning(undefined)}>{exportWarning}</MessageCard>}
      {error && (
        <MessageCard className="messages" severity={MessageCardSeverity.Error} onDismiss={() => setError(undefined)}>
          {error}
        </MessageCard>
      )}
      {!items.length && !loading ? (
        <Empty />
      ) : (
        <Card className="flex-grow bolt-table-card" contentProps={{ contentPadding: false }}>
          <Table<AlertSummary> ariaLabel="Advanced Security alerts" columns={columns} itemProvider={provider} behaviors={[sorting]} selection={selection} showLines containerClassName="h-scroll-auto" />
        </Card>
      )}
      {cursor && (
        <div className="toolbar">
          <Button text={loading ? "Loading…" : `Load more (${items.length} of ${total})`} onClick={() => void load(cursor)} disabled={loading} />
        </div>
      )}
    </div>
  );
}
