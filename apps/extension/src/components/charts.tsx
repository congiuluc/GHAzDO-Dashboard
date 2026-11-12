import { useMemo, useState } from "react";
import { Card as AdoCard } from "azure-devops-ui/Card";
import type { NamedCount, Severity, TrendPoint } from "@ghazdo/shared";

export const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
  unknown: "var(--sev-unknown)",
};

const PALETTE = ["var(--ga-accent)", "var(--ga-link)", "var(--ga-warning)", "var(--ga-success)", "var(--ga-danger)", "var(--ga-border-strong)", "var(--ga-text-soft)"];

export function colorFor(id: string, index: number): string {
  return SEVERITY_COLOR[id] ?? PALETTE[index % PALETTE.length]!;
}

export const fmt = (n: number) => n.toLocaleString();

export function Empty({ children = "No data for the current filters." }: { children?: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function BarList({ items, onSelect, max: maxItems = 10, valueLabel }: { items: NamedCount[]; onSelect?: (item: NamedCount) => void; max?: number; valueLabel?: (i: NamedCount) => string }) {
  const shown = items.slice(0, maxItems);
  if (!shown.length) return <Empty />;
  const max = Math.max(...shown.map((i) => i.count), 1);
  return (
    <div className="barlist">
      {shown.map((i) => (
        <button key={i.id} className="barrow" onClick={() => onSelect?.(i)} disabled={!onSelect} title={`${i.label}: ${fmt(i.count)}`}>
          <span className="name">{i.label}</span>
          <span className="track">
            <span className="fill" style={{ width: `${(i.count / max) * 100}%`, display: "block" }} />
          </span>
          <span className="count">{valueLabel ? valueLabel(i) : fmt(i.count)}</span>
        </button>
      ))}
    </div>
  );
}

export function Donut({ items, onSelect, size = 140 }: { items: NamedCount[]; onSelect?: (item: NamedCount) => void; size?: number }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (!total) return <Empty />;
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} role="img" aria-label={items.map((i) => `${i.label} ${i.count}`).join(", ")}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {items.map((i, idx) => {
            const len = (i.count / total) * c;
            const el = (
              <circle
                key={i.id}
                className={onSelect ? "clickable" : undefined}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={colorFor(i.id, idx)}
                strokeWidth={16}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                onClick={() => onSelect?.(i)}
              >
                <title>{`${i.label}: ${fmt(i.count)}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 18, fill: "var(--ga-text)" }}>
          {fmt(total)}
        </text>
      </svg>
      <Legend items={items} onSelect={onSelect} />
    </div>
  );
}

export function Legend({ items, onSelect }: { items: { id: string; label: string; count?: number }[]; onSelect?: (item: NamedCount) => void }) {
  return (
    <div className="legend">
      {items.map((i, idx) => (
        <button key={i.id} onClick={() => onSelect?.(i as NamedCount)} disabled={!onSelect}>
          <span className="swatch" style={{ background: colorFor(i.id, idx) }} />
          {i.label}
          {i.count !== undefined ? ` (${fmt(i.count)})` : ""}
        </button>
      ))}
    </div>
  );
}

/** Multi-series line chart. Days with partial observations are marked so gaps aren't mistaken for drops. */
export function LineChart({ points, series, height = 180 }: { points: TrendPoint[]; series: { id: string; label: string }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const pad = { l: 36, r: 8, t: 8, b: 22 };
  const max = useMemo(() => Math.max(1, ...points.flatMap((p) => series.map((s) => p.values[s.id] ?? 0))), [points, series]);
  if (!points.some((p) => p.observed > 0)) return <Empty>No history yet. Trends appear after data is collected on multiple days.</Empty>;
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const hp = hover === null ? null : points[hover];
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Trend chart" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 4} y={y(t)} textAnchor="end" dominantBaseline="central">
              {fmt(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          p.observed > 0 && p.observed < p.expected ? <rect key={`gap${p.day}`} x={x(i) - 2} y={pad.t} width={4} height={height - pad.t - pad.b} fill="var(--ga-highlight)" /> : null,
        )}
        {series.map((s, si) => {
          let d = "";
          let pen = false;
          points.forEach((p, i) => {
            if (p.observed === 0) {
              pen = false;
              return;
            }
            d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.values[s.id] ?? 0).toFixed(1)}`;
            pen = true;
          });
          return <path key={s.id} d={d} fill="none" stroke={colorFor(s.id, si)} strokeWidth={2} />;
        })}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle">
            {points[i]?.day.slice(5)}
          </text>
        ))}
        {points.map((_, i) => (
          <rect key={i} x={x(i) - (width / points.length) / 2} y={0} width={width / points.length} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hp && <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={height - pad.b} stroke="var(--ga-border-strong)" strokeDasharray="3 3" />}
      </svg>
      <div className="legend">
        {hp ? (
          <span>
            {hp.day}: {series.map((s) => `${s.label} ${fmt(hp.values[s.id] ?? 0)}`).join(" · ")}
            {hp.observed < hp.expected ? ` (partial: ${hp.observed}/${hp.expected} repositories observed)` : ""}
          </span>
        ) : (
          <Legend items={series} />
        )}
      </div>
    </div>
  );
}

export function GroupedBars({ data, height = 170 }: { data: { label: string; a: number; b: number }[]; height?: number; labels?: [string, string] }) {
  if (!data.some((d) => d.a || d.b)) return <Empty />;
  const width = 640;
  const pad = { l: 30, r: 4, t: 6, b: 20 };
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const bw = (width - pad.l - pad.r) / data.length;
  const h = (v: number) => (v / max) * (height - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="New versus fixed per week">
      <line className="gridline" x1={pad.l} x2={width} y1={height - pad.b} y2={height - pad.b} />
      <text x={pad.l - 4} y={pad.t + 4} textAnchor="end">
        {fmt(max)}
      </text>
      {data.map((d, i) => (
        <g key={d.label}>
          <rect x={pad.l + i * bw + bw * 0.1} y={height - pad.b - h(d.a)} width={bw * 0.38} height={h(d.a)} fill="var(--ga-danger)">
            <title>{`${d.label} new: ${d.a}`}</title>
          </rect>
          <rect x={pad.l + i * bw + bw * 0.5} y={height - pad.b - h(d.b)} width={bw * 0.38} height={h(d.b)} fill="var(--ga-success)">
            <title>{`${d.label} fixed: ${d.b}`}</title>
          </rect>
          {i % Math.ceil(data.length / 6) === 0 && (
            <text x={pad.l + i * bw + bw / 2} y={height - 5} textAnchor="middle">
              {d.label.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function SeverityDot({ severity }: { severity: Severity | string }) {
  return (
    <span className="sev" style={{ ["--dot" as string]: SEVERITY_COLOR[severity] ?? "var(--sev-unknown)" }}>
      {severity}
    </span>
  );
}

export function Card({ title, hint, className = "span-6", children }: { title: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`grid-cell ${className}`} aria-label={title}>
      <AdoCard className="flex-grow" titleProps={{ text: title, ariaLevel: 2 }} headerDescriptionProps={hint ? { text: <span className="card-hint">{hint}</span> } : undefined}>
        <div className="flex-column flex-grow" style={{ minWidth: 0, width: "100%" }}>
          {children}
        </div>
      </AdoCard>
    </section>
  );
}

/** Untitled card used for KPI tiles. */
export function Tile({ className = "span-3", label, children }: { className?: string; label: string; children: React.ReactNode }) {
  return (
    <section className={`grid-cell ${className}`} aria-label={label}>
      <AdoCard className="flex-grow">
        <div className="flex-column flex-grow" style={{ minWidth: 0, width: "100%" }}>
          {children}
        </div>
      </AdoCard>
    </section>
  );
}
