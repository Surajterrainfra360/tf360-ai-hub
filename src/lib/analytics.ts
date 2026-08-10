"use client";

/**
 * Client for the AI service's Natural-Language Analytics endpoints
 * (feature id: nl_analytics).
 *
 * Every call carries a Firebase ID token; the AI service independently
 * checks the caller is an active admin in `ai_admins/`.
 *
 * Nothing here computes a figure. The service returns finished numbers and
 * this file only shapes them for rendering — same trust boundary as the
 * backend, held on the client side too.
 */
import { AI_BASE, request, type AIResult } from "./aiAdmin";
import { auth } from "./firebase";

/* ===================== Types ===================== */

export type MetricKind = "money" | "count" | "ratio" | "percent" | "percent_signed";

export type KpiCard = {
  id: string;
  label: string;
  kind: MetricKind;
  value: number | null;
  previousValue: number | null;
  changePct: number | null;
  caption?: string;
};

export type Period = {
  label: string;
  from: string | null;
  to: string | null;
  previousFrom?: string | null;
  previousTo?: string | null;
};

export type KpiResponse = {
  cards: KpiCard[];
  period: Period;
  meta: QueryMeta;
};

export type QueryMeta = {
  start: string;
  end: string;
  days: number;
  channel: string;
  filtered?: boolean;
  sources: string[];
  truncated: boolean;
  errors: string[];
};

export type ResultRow = {
  key: string;
  label: string;
  value: number;
  previousValue: number | null;
  changePct: number | null;
  gmv: number;
  orders: number;
  units: number;
  share: number;
  isNew: boolean;
};

export type DayPoint = { date: string; gmv: number; orders: number; units: number };

export type AnalyticsResult = {
  metric: string;
  metricLabel: string;
  metricKind: MetricKind;
  dimension: string | null;
  total: number | null;
  previousTotal: number | null;
  changePct: number | null;
  rows: ResultRow[];
  byDay: DayPoint[];
  previousByDay: DayPoint[];
  totals: Record<string, number>;
  previousTotals: Record<string, number> | null;
  period: Period;
  plan: QueryPlan;
  verification: string;
  notes: string[];
  meta: QueryMeta;
};

export type QueryPlan = {
  metric: string;
  dimension: string | null;
  time: { preset: string; from: string | null; to: string | null; label?: string };
  compareToPrevious: boolean;
  filters: {
    channel: string;
    city: string | null;
    categoryId: string | null;
    vendorId: string | null;
  };
  limit: number;
};

export type Narrative = {
  headline: string;
  detail: string;
  insights: string[];
  assumptions: string;
  _fallback?: boolean;
};

export type Followup = { label: string; patch: Record<string, unknown> };

export type AskResponse =
  | {
      supported: true;
      question: string;
      restated: string;
      narrative: Narrative;
      /** true = numbers are final, wording is still being written */
      narrationPending?: boolean;
      result: AnalyticsResult;
      followups: Followup[];
      plan: QueryPlan;
      _meta: { provider: string; model: string; durationMs: number };
    }
  | {
      supported: false;
      question: string;
      message: string;
      available: string[];
    };

export type Insight = {
  kind: string;
  severity: "good" | "warn" | "info";
  text: string;
  dimension: string | null;
  key: string | null;
  changePct: number | null;
};

export type RegionRow = {
  key: string;
  label: string;
  gmv: number;
  orders: number;
  lat: number | null;
  lon: number | null;
  share: number;
};

export type SavedCard = {
  id: string;
  title: string;
  question: string;
  plan: QueryPlan;
  refresh: "daily" | "weekly" | "manual";
  visibility: "directors" | "private";
  createdAt: number;
  createdByEmail: string;
  createdByUid: string;
  last: {
    value: number | null;
    display: string;
    changePct: number | null;
    metricLabel: string;
    periodLabel: string;
    topLabel?: string | null;
    topDisplay?: string | null;
    refreshedAt: number;
  } | null;
  error?: string;
};

export type AnalyticsMeta = {
  metrics: { id: string; label: string; kind: MetricKind; description: string }[];
  dimensions: { id: string; label: string; description: string }[];
  timePresets: { id: string; label: string }[];
  channels: { id: string; label: string }[];
  defaults: Record<string, unknown>;
};

/* ===================== Filters ===================== */

export type Filters = {
  timePreset: string;
  channel: string;
  city: string;
  categoryId: string;
  vendorId: string;
};

export const DEFAULT_FILTERS: Filters = {
  timePreset: "this_month",
  channel: "all",
  city: "",
  categoryId: "",
  vendorId: "",
};

/** The cross-filterable fields — everything except the time window. */
export type FilterField = "channel" | "city" | "categoryId" | "vendorId";

export type FilterChip = {
  field: FilterField;
  value: string;
  label: string;
  fieldLabel: string;
};

export function clearFilter(f: Filters, field: FilterField): Filters {
  return { ...f, [field]: field === "channel" ? "all" : "" };
}

export function clearAllFilters(f: Filters): Filters {
  return { ...f, channel: "all", city: "", categoryId: "", vendorId: "" };
}

export function hasFilters(f: Filters): boolean {
  return f.channel !== "all" || !!f.city || !!f.categoryId || !!f.vendorId;
}

function qs(f: Filters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  p.set("timePreset", f.timePreset);
  p.set("channel", f.channel);
  if (f.city) p.set("city", f.city);
  if (f.categoryId) p.set("categoryId", f.categoryId);
  if (f.vendorId) p.set("vendorId", f.vendorId);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return `?${p.toString()}`;
}

/* ===================== Calls ===================== */

export type Overview = {
  cards: KpiCard[];
  period: Period;
  byDay: DayPoint[];
  previousByDay: DayPoint[];
  breakdowns: {
    category: ResultRow[];
    vendor: ResultRow[];
    city: ResultRow[];
    channel: ResultRow[];
    payment_method: ResultRow[];
    product: ResultRow[];
  };
  regions: RegionRow[];
  insights: Insight[];
  totals: Record<string, number>;
  previousTotals: Record<string, number>;
  hasData: boolean;
  activeFilters: FilterChip[];
  meta: QueryMeta;
};

/** One call, one aggregation pass — powers the whole dashboard. */
export function getOverview(f: Filters) {
  return request<undefined, Overview>(`/v1/analytics/overview${qs(f)}`, "GET");
}

export function getAnalyticsMeta() {
  return request<undefined, AnalyticsMeta>("/v1/analytics/meta", "GET");
}

export function getKpis(f: Filters) {
  return request<undefined, KpiResponse>(`/v1/analytics/kpis${qs(f)}`, "GET");
}

export function getInsights(f: Filters, limit = 4) {
  return request<undefined, { insights: Insight[] }>(
    `/v1/analytics/insights${qs(f, { limit })}`,
    "GET"
  );
}

export function getRegions(f: Filters) {
  return request<undefined, { rows: RegionRow[]; period: Period; unplaced: string[] }>(
    `/v1/analytics/regions${qs({ ...f, city: "" })}`,
    "GET"
  );
}

export type AskInput = {
  question: string;
  previousPlan?: QueryPlan | null;
  channel?: string;
  city?: string;
  timePreset?: string;
  categoryId?: string;
  vendorId?: string;
  /** false = return the numbers immediately, fetch the wording after. */
  narrate?: boolean;
};

/** Phase two of the fast path — the words for an answer already on screen. */
export function narrateAnswer(question: string, plan: QueryPlan) {
  return request<{ question: string; plan: QueryPlan }, { narrative: Narrative }>(
    "/v1/analytics/narrate",
    "POST",
    { question, plan }
  );
}

export function ask(input: AskInput) {
  return request<AskInput, AskResponse>("/v1/analytics-ask", "POST", input);
}

export function listCards(refresh = false) {
  return request<undefined, { cards: SavedCard[] }>(
    `/v1/analytics/cards${refresh ? "?refresh=true" : ""}`,
    "GET"
  );
}

export type SaveCardInput = {
  title: string;
  plan: QueryPlan;
  refresh: "daily" | "weekly" | "manual";
  visibility: "directors" | "private";
  question?: string;
};

export function saveCard(input: SaveCardInput) {
  return request<SaveCardInput, { ok: true; id: string; card: SavedCard }>(
    "/v1/analytics/cards",
    "POST",
    input
  );
}

export function refreshCard(id: string) {
  return request<undefined, { ok: true; last: SavedCard["last"] }>(
    `/v1/analytics/cards/${encodeURIComponent(id)}/refresh`,
    "POST"
  );
}

export function deleteCard(id: string) {
  return request<undefined, { ok: true }>(
    `/v1/analytics/cards/${encodeURIComponent(id)}`,
    "DELETE"
  );
}

export function triggerRollup(days = 7) {
  return request<{ days: number }, { built: string[]; failed: unknown[]; days: number }>(
    "/v1/analytics/rollup-mine",
    "POST",
    { days }
  );
}

/**
 * CSV export needs the raw response body, so it bypasses the JSON helper
 * and streams the blob straight to a download.
 */
export async function exportCsv(plan: QueryPlan): Promise<AIResult<true>> {
  const u = auth.currentUser;
  if (!u) return { ok: false, status: 401, message: "Not signed in." };
  try {
    const token = await u.getIdToken();
    const res = await fetch(`${AI_BASE}/v1/analytics/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(plan),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, message: "Export failed." };
    }
    const blob = await res.blob();
    const name =
      res.headers
        .get("Content-Disposition")
        ?.match(/filename="?([^"]+)"?/)?.[1] || "tf360-analytics.csv";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, data: true };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: (e as { message?: string })?.message || "Export failed.",
    };
  }
}

/* ===================== Formatting ===================== */

/** 2.30 -> "2.3", 2.00 -> "2". toFixed always emits a dot, so this is safe. */
function trim(x: number, dp: number): string {
  return x.toFixed(dp).replace(/0+$/, "").replace(/\.$/, "");
}

/** Indian short form — ₹4.1L, ₹2.3Cr. Matches the service's formatter. */
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7, 2)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5, 1)}L`;
  if (a >= 1000) return `${sign}₹${trim(a / 1000, 1)}K`;
  return `${sign}₹${a.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString("en-IN");
}

export function fmtPct(v: number | null | undefined, signed = true): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = signed && v > 0 ? "+" : "";
  return `${s}${v.toFixed(v !== 0 && Math.abs(v) < 10 ? 1 : 0)}%`;
}

export function fmtValue(kind: MetricKind, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  switch (kind) {
    case "money":
      return fmtMoney(v);
    case "count":
      return fmtCount(v);
    case "percent":
      return `${(Math.abs(v) <= 1 ? v * 100 : v).toFixed(1)}%`;
    case "percent_signed":
      return fmtPct(v);
    default:
      return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
}

/** Short axis label for a date — "3 Aug". */
export function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}`;
}
