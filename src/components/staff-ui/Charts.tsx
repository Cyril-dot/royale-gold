// Charts — hand-rolled SVG (zero new dependency, decision D5).
// Labelled axes, readable at 360px, tap value, table/list alternative,
// colour-blind-safe RG palette (gold / green / muted / red-text), max 4-5 series.
"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "./Button";

export interface ChartSeries {
  label: string;
  /** Hex colour — use the palette below (gold/green/muted/red-text). */
  color: string;
  values: number[];
}

export const CHART_COLORS = {
  gold: "#F2C230",
  goldLight: "#FFD964",
  green: "#3ED97E",
  muted: "#B2B69F",
  redText: "#FF8580",
} as const;

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="st-chart-legend" aria-label="Chart series">
      {series.map((s) => (
        <li key={s.label}>
          <span className="st-chart-legend-dot" style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTable({
  labels,
  series,
  formatValue,
}: {
  labels: string[];
  series: ChartSeries[];
  formatValue: (v: number) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide table" : "View as table"}
      </Button>
      {open ? (
        <table className="st-chart-table">
          <thead>
            <tr>
              <th scope="col">Period</th>
              {series.map((s) => (
                <th key={s.label} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {series.map((s) => (
                  <td key={s.label}>{formatValue(s.values[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/** Grouped bar chart — deposits vs withdrawals, commission per day, etc. */
export function BarChart({
  labels,
  series,
  formatValue = (v) => String(v),
  height = 180,
}: {
  labels: string[];
  series: ChartSeries[];
  formatValue?: (v: number) => string;
  height?: number;
}) {
  const [selected, setSelected] = useState<{ group: number; series: number } | null>(null);
  const titleId = useId();
  const W = 640;
  const H = height;
  const padL = 8;
  const padB = 24;
  const padT = 8;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const groupW = (W - padL * 2) / Math.max(1, labels.length);
  const barW = Math.min(28, (groupW * 0.7) / Math.max(1, series.length));
  const tip = useMemo(() => {
    if (!selected) return "Tap a bar for its exact value.";
    const s = series[selected.series];
    return `${labels[selected.group]} — ${s.label}: ${formatValue(s.values[selected.group] ?? 0)}`;
  }, [selected, labels, series, formatValue]);

  return (
    <div className="st-chart">
      <ChartLegend series={series} />
      <svg
        className="st-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-tip`}
      >
        <title id={titleId}>Bar chart: {series.map((s) => s.label).join(", ")}</title>
        {labels.map((label, gi) => {
          const gx = padL + gi * groupW;
          return (
            <g key={label}>
              {series.map((s, si) => {
                const v = s.values[gi] ?? 0;
                const h = Math.max(v > 0 ? 2 : 0, ((H - padT - padB) * v) / max);
                const x = gx + (groupW - barW * series.length) / 2 + si * barW;
                const y = H - padB - h;
                const active = selected?.group === gi && selected?.series === si;
                return (
                  <rect
                    key={s.label}
                    className="st-chart-bar"
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={3}
                    fill={s.color}
                    opacity={selected && !active ? 0.35 : 1}
                    tabIndex={0}
                    role="button"
                    aria-label={`${label}, ${s.label}: ${formatValue(v)}`}
                    onClick={() => setSelected(active ? null : { group: gi, series: si })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(active ? null : { group: gi, series: si });
                      }
                    }}
                  />
                );
              })}
              <text x={gx + groupW / 2} y={H - 6} textAnchor="middle" className="st-chart-axis">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="st-chart-tip" id={`${titleId}-tip`} aria-live="polite">
        {tip}
      </p>
      <ChartTable labels={labels} series={series} formatValue={formatValue} />
    </div>
  );
}

/** Line chart — GGR/revenue trend, active players, RTP vs target. */
export function LineChart({
  labels,
  series,
  formatValue = (v) => String(v),
  height = 180,
}: {
  labels: string[];
  series: ChartSeries[];
  formatValue?: (v: number) => string;
  height?: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const titleId = useId();
  const W = 640;
  const H = height;
  const padL = 8;
  const padB = 24;
  const padT = 12;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const min = Math.min(0, ...series.flatMap((s) => s.values));
  const span = max - min || 1;
  const x = (i: number) => padL + (i / Math.max(1, labels.length - 1)) * (W - padL * 2);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const tip = useMemo(() => {
    if (selected === null) return "Tap a point for its exact value.";
    return labels[selected] + " — " + series.map((s) => `${s.label}: ${formatValue(s.values[selected] ?? 0)}`).join(" · ");
  }, [selected, labels, series, formatValue]);

  return (
    <div className="st-chart">
      <ChartLegend series={series} />
      <svg
        className="st-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-tip`}
      >
        <title id={titleId}>Line chart: {series.map((s) => s.label).join(", ")}</title>
        {series.map((s) => (
          <polyline
            key={s.label}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {labels.map((label, i) => (
          <g key={label}>
            <circle
              cx={x(i)}
              cy={y(series[0]?.values[i] ?? 0)}
              r={selected === i ? 6 : 4}
              fill="#070812"
              stroke={series[0]?.color ?? "#F2C230"}
              strokeWidth={2}
              className="st-chart-bar"
              tabIndex={0}
              role="button"
              aria-label={`${label}: ${series.map((s) => `${s.label} ${formatValue(s.values[i] ?? 0)}`).join(", ")}`}
              onClick={() => setSelected(selected === i ? null : i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(selected === i ? null : i);
                }
              }}
            />
            {/* Edge labels are anchored inward — a centred label under the
                first/last point overflows the viewBox and clips ("17 No"). */}
            <text
              x={i === 0 ? 0 : i === labels.length - 1 ? W : x(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
              className="st-chart-axis"
            >
              {label}
            </text>
          </g>
        ))}
      </svg>
      <p className="st-chart-tip" id={`${titleId}-tip`} aria-live="polite">
        {tip}
      </p>
      <ChartTable labels={labels} series={series} formatValue={formatValue} />
    </div>
  );
}

/** Tiny sparkline for KpiTile deltas. */
export function Sparkline({ values, color = CHART_COLORS.gold }: { values: number[]; color?: string }) {
  const W = 96;
  const H = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${H - 3 - ((v - min) / span) * (H - 6)}`)
    .join(" ");
  return (
    <svg width={W} height={H} role="img" aria-label="Trend" style={{ display: "block", marginTop: 6 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
