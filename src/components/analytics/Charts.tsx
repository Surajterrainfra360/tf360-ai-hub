"use client";

/**
 * Charts for the Analytics dashboard.
 *
 * Hand-rolled SVG on purpose: the AI Hub has no chart library, and adding
 * one (recharts/Chart.js) would mean a dependency install before this page
 * renders at all. These cover what the blueprint asks for — bars for
 * breakdowns, a line for trends, bubbles for regions — with axis labels and
 * hover tooltips, and they scale cleanly on a phone.
 *
 * Swapping in a chart library later is a drop-in replacement: every
 * component here takes plain data and formatted-label callbacks.
 */
import React from "react";
import {
  fmtDay,
  fmtMoney,
  fmtPct,
  fmtValue,
  type DayPoint,
  type MetricKind,
  type RegionRow,
  type ResultRow,
} from "@/lib/analytics";

const BLUE = "#2563eb";
const BLUE_SOFT = "#93c5fd";
const GREEN = "#10b981";
const RED = "#ef4444";
const GRID = "#e2e8f0";
const MUTED = "#94a3b8";
const INK = "#0f172a";

/* ===================================================================
 * Bar chart — breakdown by category / vendor / city
 * =================================================================== */

export function BarChart({
  rows,
  kind,
  height = 260,
}: {
  rows: ResultRow[];
  kind: MetricKind;
  height?: number;
}) {
  if (!rows.length) return null;

  const W = 720;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padTop = 18;
  const labelBand = 46;
  const plotH = H - padTop - labelBand;

  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const slot = (W - padL - padR) / rows.length;
  const barW = Math.min(slot * 0.56, 74);

  // Round the axis up to something human — 1/2/5 x 10^n.
  const niceMax = niceCeil(max);
  const ticks = [0, niceMax / 2, niceMax];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Breakdown bar chart"
      style={{ display: "block", overflow: "visible" }}
    >
      {ticks.map((t, i) => {
        const y = padTop + plotH - (t / niceMax) * plotH;
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={padL} y={y - 4} fontSize={10} fill={MUTED}>
              {fmtValue(kind, t)}
            </text>
          </g>
        );
      })}

      {rows.map((r, i) => {
        const h = Math.max((Math.abs(r.value) / niceMax) * plotH, r.value ? 3 : 0);
        const x = padL + i * slot + (slot - barW) / 2;
        const y = padTop + plotH - h;
        const isTop = i === 0;
        const up = (r.changePct ?? 0) > 0;
        return (
          <g key={r.key}>
            <title>
              {`${r.label}\n${fmtValue(kind, r.value)}\n` +
                (r.isNew
                  ? "new this period"
                  : r.changePct !== null
                  ? `${fmtPct(r.changePct)} vs previous`
                  : "no comparison") +
                `\n${r.share.toFixed(0)}% of total · ${r.orders} orders`}
            </title>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={6}
              fill={isTop ? BLUE : BLUE_SOFT}
            />
            {r.changePct !== null && h > 26 ? (
              <text
                x={x + barW / 2}
                y={y - 5}
                fontSize={10.5}
                fontWeight={800}
                textAnchor="middle"
                fill={up ? GREEN : RED}
              >
                {fmtPct(r.changePct)}
              </text>
            ) : null}
            <text
              x={x + barW / 2}
              y={padTop + plotH + 16}
              fontSize={11}
              fontWeight={isTop ? 800 : 600}
              textAnchor="middle"
              fill={isTop ? INK : "#475569"}
            >
              {truncate(r.label, 14)}
            </text>
            <text
              x={x + barW / 2}
              y={padTop + plotH + 31}
              fontSize={10}
              textAnchor="middle"
              fill={MUTED}
            >
              {fmtValue(kind, r.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ===================================================================
 * Trend line — daily series, with the previous period behind it
 * =================================================================== */

export function TrendChart({
  points,
  previous = [],
  kind = "money",
  height = 260,
  valueKey = "gmv",
}: {
  points: DayPoint[];
  previous?: DayPoint[];
  kind?: MetricKind;
  height?: number;
  valueKey?: "gmv" | "orders" | "units";
}) {
  if (!points.length) return null;

  const W = 720;
  const H = height;
  const padL = 44;
  const padR = 10;
  const padTop = 16;
  const padBottom = 28;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;

  const vals = points.map((p) => Number(p[valueKey]) || 0);
  const prevVals = previous.map((p) => Number(p[valueKey]) || 0);
  const max = Math.max(...vals, ...prevVals, 1);
  const niceMax = niceCeil(max);

  const xAt = (i: number, n: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => padTop + plotH - (v / niceMax) * plotH;

  const line = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i, series.length)},${yAt(v)}`).join(" ");

  const area =
    line(vals) +
    ` L${xAt(vals.length - 1, vals.length)},${padTop + plotH}` +
    ` L${xAt(0, vals.length)},${padTop + plotH} Z`;

  const ticks = [0, niceMax / 2, niceMax];
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Trend over time"
      style={{ display: "block", overflow: "visible" }}
    >
      {ticks.map((t, i) => {
        const y = yAt(t);
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={0} y={y + 3} fontSize={10} fill={MUTED}>
              {fmtValue(kind, t)}
            </text>
          </g>
        );
      })}

      {prevVals.length > 1 ? (
        <path
          d={line(prevVals)}
          fill="none"
          stroke={MUTED}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.7}
        />
      ) : null}

      <path d={area} fill={BLUE} opacity={0.08} />
      <path d={line(vals)} fill="none" stroke={BLUE} strokeWidth={2.5} strokeLinejoin="round" />

      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={xAt(i, points.length)} cy={yAt(vals[i])} r={points.length > 40 ? 1.5 : 3} fill={BLUE}>
            <title>{`${fmtDay(p.date)}\n${fmtValue(kind, vals[i])}\n${p.orders} orders`}</title>
          </circle>
          {i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              x={xAt(i, points.length)}
              y={H - 8}
              fontSize={10}
              textAnchor="middle"
              fill={MUTED}
            >
              {fmtDay(p.date)}
            </text>
          ) : null}
        </g>
      ))}

      {prevVals.length > 1 ? (
        <g transform={`translate(${padL},${padTop - 6})`}>
          <line x1={0} x2={16} y1={0} y2={0} stroke={MUTED} strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={21} y={3} fontSize={9.5} fill={MUTED}>
            previous period
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/* ===================================================================
 * Region bubble map
 * =================================================================== */

/**
 * Equirectangular plot over India's bounding box. Deliberately a
 * coordinate plot with a faint graticule rather than a traced outline —
 * bubbles sit at true lat/lon, and nothing pretends to be a survey map.
 */
export function RegionMap({
  rows,
  height = 300,
  selectedKey,
  onPick,
}: {
  rows: RegionRow[];
  height?: number;
  selectedKey?: string;
  onPick?: (r: RegionRow) => void;
}) {
  const placed = rows.filter((r) => r.lat !== null && r.lon !== null);
  if (!placed.length) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: MUTED, fontSize: 13 }}>
        No regional sales in this period.
      </div>
    );
  }

  const W = 460;
  const H = height;
  const LAT_MIN = 6, LAT_MAX = 37, LON_MIN = 68, LON_MAX = 98;

  const x = (lon: number) => ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (W - 40) + 20;
  const y = (lat: number) => ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (H - 40) + 20;

  const maxGmv = Math.max(...placed.map((r) => r.gmv), 1);
  const r = (g: number) => 5 + Math.sqrt(g / maxGmv) * 26;

  const sorted = [...placed].sort((a, b) => b.gmv - a.gmv);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="GMV by region"
      style={{ display: "block" }}
    >
      <rect x={0} y={0} width={W} height={H} rx={10} fill="#f8fafc" />
      {[10, 15, 20, 25, 30, 35].map((lat) => (
        <line key={lat} x1={12} x2={W - 12} y1={y(lat)} y2={y(lat)} stroke={GRID} strokeWidth={0.8} />
      ))}
      {[70, 75, 80, 85, 90, 95].map((lon) => (
        <line key={lon} x1={x(lon)} x2={x(lon)} y1={12} y2={H - 12} stroke={GRID} strokeWidth={0.8} />
      ))}

      {sorted
        .slice()
        .reverse()
        .map((row) => {
          const selected = !!selectedKey && row.key === selectedKey;
          const dimmed = !!selectedKey && !selected;
          return (
            <circle
              key={row.key}
              cx={x(row.lon as number)}
              cy={y(row.lat as number)}
              r={r(row.gmv)}
              fill={selected ? "#1d4ed8" : BLUE}
              fillOpacity={dimmed ? 0.1 : selected ? 0.45 : 0.28}
              stroke={selected ? "#1d4ed8" : BLUE}
              strokeWidth={selected ? 2.6 : 1.4}
              strokeOpacity={dimmed ? 0.35 : 1}
              style={{ cursor: onPick ? "pointer" : "default", transition: "all .2s ease" }}
              onClick={() => onPick?.(row)}
            >
              <title>
                {`${row.label}\n${fmtMoney(row.gmv)} · ${row.orders} orders\n${row.share.toFixed(0)}% of GMV` +
                  (onPick ? `\n\nClick to ${selected ? "clear this filter" : "filter the page"}` : "")}
              </title>
            </circle>
          );
        })}

      {sorted.slice(0, 5).map((row) => (
        <text
          key={`l-${row.key}`}
          x={x(row.lon as number)}
          y={y(row.lat as number) - r(row.gmv) - 4}
          fontSize={10}
          fontWeight={800}
          textAnchor="middle"
          fill={INK}
        >
          {row.label}
        </text>
      ))}
    </svg>
  );
}

/* ===================================================================
 * Horizontal bars — better than vertical when labels are long
 * (category and vendor names always are)
 * =================================================================== */

export const SERIES = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#4f46e5", "#0d9488"];

export function HBarChart({
  rows,
  kind,
  max: maxOverride,
  showChange = true,
  selectedKey,
  onPick,
}: {
  rows: ResultRow[];
  kind: MetricKind;
  max?: number;
  showChange?: boolean;
  /** When set, other rows dim — the Power BI "selection" behaviour. */
  selectedKey?: string;
  onPick?: (r: ResultRow) => void;
}) {
  if (!rows.length) return null;
  const max = maxOverride ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const hasSel = !!selectedKey;

  return (
    <div style={{ display: "grid", gap: 9 }}>
      {rows.map((r, i) => {
        const pct = Math.max((Math.abs(r.value) / max) * 100, r.value ? 1.5 : 0);
        const selected = hasSel && r.key === selectedKey;
        const dim = hasSel && !selected;
        return (
          <div
            key={r.key}
            onClick={() => onPick?.(r)}
            style={{
              cursor: onPick ? "pointer" : "default",
              opacity: dim ? 0.42 : 1,
              transition: "opacity .2s ease",
            }}
            title={
              `${r.label}\n${fmtValue(kind, r.value)} · ${r.share.toFixed(0)}% of total · ${r.orders} orders` +
              (onPick ? `\n\nClick to ${selected ? "clear this filter" : "filter the page"}` : "")
            }
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
              <span style={{
                fontSize: 12.5, fontWeight: selected ? 900 : 600,
                color: selected ? BLUE : "#334155",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {selected ? "● " : ""}{truncate(r.label, 26)}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <b style={{ fontSize: 12.5, color: INK }}>{fmtValue(kind, r.value)}</b>
                {showChange ? (
                  r.isNew ? (
                    <span style={{ fontSize: 10, fontWeight: 800, color: GREEN }}>NEW</span>
                  ) : (
                    <DeltaArrow value={r.changePct} />
                  )
                ) : null}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: SERIES[i % SERIES.length],
                  opacity: dim ? 0.55 : i === 0 || selected ? 1 : 0.75,
                  transition: "width .4s ease, opacity .2s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===================================================================
 * Donut — share of mix (channel, payment method)
 * =================================================================== */

export function Donut({
  rows,
  kind,
  size = 168,
  centerLabel,
  selectedKey,
  onPick,
}: {
  rows: ResultRow[];
  kind: MetricKind;
  size?: number;
  centerLabel?: string;
  selectedKey?: string;
  onPick?: (r: ResultRow) => void;
}) {
  const total = rows.reduce((s, r) => s + Math.abs(r.value), 0);
  if (!total) return null;

  const R = size / 2;
  const stroke = size * 0.19;
  const radius = R - stroke / 2 - 2;
  const circ = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = rows.map((r, i) => {
    const frac = Math.abs(r.value) / total;
    const seg = { r, i, frac, dash: frac * circ, offset };
    offset += frac * circ;
    return seg;
  });

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${R} ${R})`}>
          {arcs.map(({ r, i, dash, offset: off }) => {
            const selected = !!selectedKey && r.key === selectedKey;
            const dimmed = !!selectedKey && !selected;
            return (
              <circle
                key={r.key}
                cx={R}
                cy={R}
                r={radius}
                fill="none"
                stroke={SERIES[i % SERIES.length]}
                strokeWidth={selected ? stroke * 1.16 : stroke}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-off}
                opacity={dimmed ? 0.35 : 1}
                style={{ cursor: onPick ? "pointer" : "default", transition: "opacity .2s ease" }}
                onClick={() => onPick?.(r)}
              >
                <title>
                  {`${r.label}\n${fmtValue(kind, r.value)} · ${((Math.abs(r.value) / total) * 100).toFixed(0)}%` +
                    (onPick ? `\n\nClick to ${selected ? "clear this filter" : "filter the page"}` : "")}
                </title>
              </circle>
            );
          })}
        </g>
        {centerLabel ? (
          <>
            <text x={R} y={R - 2} fontSize={15} fontWeight={900} textAnchor="middle" fill={INK}>
              {centerLabel}
            </text>
            <text x={R} y={R + 14} fontSize={9.5} textAnchor="middle" fill={MUTED}>
              total
            </text>
          </>
        ) : null}
      </svg>

      <div style={{ display: "grid", gap: 7, minWidth: 120 }}>
        {rows.map((r, i) => {
          const selected = !!selectedKey && r.key === selectedKey;
          const dimmed = !!selectedKey && !selected;
          return (
            <div
              key={r.key}
              onClick={() => onPick?.(r)}
              style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                cursor: onPick ? "pointer" : "default", opacity: dimmed ? 0.45 : 1,
              }}
            >
              <span
                style={{
                  width: 9, height: 9, borderRadius: 3, flexShrink: 0,
                  background: SERIES[i % SERIES.length],
                }}
              />
              <span style={{ color: selected ? BLUE : "#475569", flex: 1, fontWeight: selected ? 800 : 400 }}>
                {truncate(r.label, 16)}
              </span>
              <b style={{ color: INK }}>{((Math.abs(r.value) / total) * 100).toFixed(0)}%</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===================================================================
 * Small pieces
 * =================================================================== */

export function DeltaArrow({ value, muted = false }: { value: number | null; muted?: boolean }) {
  if (value === null || Number.isNaN(value)) {
    return <span style={{ color: MUTED, fontSize: 12, fontWeight: 700 }}>—</span>;
  }
  const up = value > 0;
  const flat = Math.abs(value) < 0.5;
  const color = flat ? MUTED : up ? GREEN : RED;
  return (
    <span style={{ color: muted ? MUTED : color, fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" }}>
      {flat ? "▬" : up ? "▲" : "▼"} {fmtPct(Math.abs(value), false)}
    </span>
  );
}

export function Sparkbars({ points, valueKey = "gmv" }: { points: DayPoint[]; valueKey?: "gmv" | "orders" }) {
  if (!points.length) return null;
  const vals = points.map((p) => Number(p[valueKey]) || 0);
  const max = Math.max(...vals, 1);
  const W = 120;
  const H = 26;
  const bw = W / vals.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden style={{ display: "block" }}>
      {vals.map((v, i) => {
        const h = Math.max((v / max) * H, v ? 1.5 : 0);
        return (
          <rect
            key={i}
            x={i * bw + bw * 0.15}
            y={H - h}
            width={bw * 0.7}
            height={h}
            rx={1}
            fill={BLUE_SOFT}
          />
        );
      })}
    </svg>
  );
}

/* ===================================================================
 * helpers
 * =================================================================== */

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
