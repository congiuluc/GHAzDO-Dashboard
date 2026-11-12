import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "azure-devops-ui/Button";
import { Card } from "azure-devops-ui/Card";
import { Link } from "azure-devops-ui/Link";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { ColumnSorting, SimpleTableCell, SortOrder, Table, type ITableColumn } from "azure-devops-ui/Table";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { alertsToCsv, MAX_PAGE_SIZE, type AlertSummary, type DashboardScope, type Filters, type SortField } from "@ghazdo/shared";
import type { DataSource } from "../data/dataSource";
import { Empty, SeverityDot } from "./charts";

const KIND_LABELS: Record<string, string> = { code: "Code", dependency: "Dependency", secret: "Secret", other: "Other" };

function details(a: AlertSummary): string {
  if (a.kind === "dependency") return [a.packageName && `${a.packageName}@${a.packageVersion ?? "?"}`, a.fixedVersion && `fix: ${a.fixedVersion}`, a.advisoryIds?.join(", ")].filter(Boolean).join(" · ");
  if (a.kind === "secret") return [a.secretType, a.validity && a.validity !== "none" ? `validity: ${a.validity}` : undefined].filter(Boolean).join(" · ");
  return [a.ruleName ?? a.ruleId, a.tool].filter(Boolean).join(" · ");
}

type Sort = { field: SortField; direction: "asc" | "desc" };
type Drill = (f: Partial<Filters>) => void;

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
    col("kind", "Type", "kind", -8, (a) => KIND_LABELS[a.kind] ?? a.kind),
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
    col("state", "State", "state", -7, (a) => a.state),
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
    try {
      const all: AlertSummary[] = [];
      let next: string | undefined;
      do {
        const page = await source.getAlerts({ filters, sort, pageSize: MAX_PAGE_SIZE, cursor: next }, scope);
        all.push(...page.items);
        next = page.nextCursor;
      } while (next && all.length < 50_000);
      const blob = new Blob([alertsToCsv(all)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `advanced-security-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
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

  return (
    <div className="alert-table">
      <div className="toolbar">
        <span className="body-m">
          {total.toLocaleString()} alerts{filters.states.length ? "" : " (all states)"}
        </span>
        <span className="spacer" />
        <Button iconProps={{ iconName: "Download" }} text={exporting ? "Exporting…" : "Export CSV"} onClick={() => void exportCsv()} disabled={exporting || !total} />
      </div>
      {error && (
        <MessageCard className="messages" severity={MessageCardSeverity.Error} onDismiss={() => setError(undefined)}>
          {error}
        </MessageCard>
      )}
      {!items.length && !loading ? (
        <Empty />
      ) : (
        <Card className="flex-grow bolt-table-card" contentProps={{ contentPadding: false }}>
          <Table<AlertSummary> ariaLabel="Advanced Security alerts" columns={columns} itemProvider={provider} behaviors={[sorting]} showLines containerClassName="h-scroll-auto" />
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
