"use client";

/**
 * Feature 19 — Natural-Language Analytics.
 *
 * A Power BI-style console with two modes:
 *
 *   dashboard — the standing BI view. Sidebar, slicers, KPI strip, and a
 *               grid of coordinated visuals. Click any bar, bubble or donut
 *               segment and the whole page cross-filters to it.
 *   chat      — asking a question takes over the screen: your question, the
 *               answer, its chart and what to ask next. Nothing competing.
 *
 * Cross-filtering follows the Power BI rule — a visual is never filtered by
 * its own dimension, so clicking "Paint" narrows every other chart while the
 * category chart keeps showing all categories with Paint highlighted.
 *
 * Every figure arrives pre-computed from GET /v1/analytics/overview — one
 * request, one aggregation pass. This file formats and lays out; it never
 * does arithmetic on money.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDirectorAuth } from "@/lib/adminAuth";
import {
  DEFAULT_FILTERS,
  ask,
  clearAllFilters,
  clearFilter,
  deleteCard,
  exportCsv,
  fmtCount,
  fmtMoney,
  fmtValue,
  getAnalyticsMeta,
  getOverview,
  hasFilters,
  listCards,
  narrateAnswer,
  refreshCard,
  saveCard,
  triggerRollup,
  type AnalyticsMeta,
  type AskResponse,
  type FilterField,
  type Filters,
  type KpiCard,
  type Overview,
  type QueryPlan,
  type SavedCard,
} from "@/lib/analytics";
import {
  BarChart,
  DeltaArrow,
  Donut,
  HBarChart,
  RegionMap,
  Sparkbars,
  TrendChart,
} from "@/components/analytics/Charts";

const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const BLUE = "#2563eb";
const LINE = "#e6ebf2";
const NAV = "#0b1220";

const EXAMPLES = [
  "Which category grew most last month?",
  "Top 5 vendors by revenue",
  "GMV by region this quarter",
  "Daily orders trend this week",
];

type Turn = { id: number; question: string; res: AskResponse };

/**
 * A conversation is a separate chat, exactly like a chat app's sidebar
 * entry — its own title, its own list of exchanges. Clicking one in the
 * sidebar loads that whole conversation and replaces what's on screen.
 * Follow-ups continue inside the conversation you're in.
 */
type Conversation = {
  id: number;
  title: string;
  createdAt: number;
  turns: Turn[];
};

/** Conversations survive a page reload. Per browser, per machine. */
const HISTORY_KEY = "tf360.analytics.chats.v1";

export default function AnalyticsPage() {
  const router = useRouter();
  const { user, isAdmin, name, role, loading } = useDirectorAuth();

  const [mode, setMode] = useState<"dashboard" | "chat">("dashboard");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [meta, setMeta] = useState<AnalyticsMeta | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);

  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  /** The question in flight — the composer clears, so the bubble needs
   *  its own copy or it renders empty while you wait. */
  const [pending, setPending] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [saveFor, setSaveFor] = useState<Turn | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  /** The conversation currently on screen. */
  const active = useMemo(
    () => convos.find((c) => c.id === activeId) || null,
    [convos, activeId]
  );
  const turns = active?.turns || [];

  /**
   * Conversations persist across reloads — refreshing shouldn't lose the
   * answers you were reading. Capped at 25 chats so storage stays small.
   */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { convos: Conversation[]; activeId: number | null };
      if (Array.isArray(saved?.convos)) {
        setConvos(saved.convos);
        setActiveId(saved.activeId ?? null);
      }
    } catch {
      /* corrupt or unavailable storage — start fresh, not a failure */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify({ convos: convos.slice(-25), activeId })
      );
    } catch {
      /* quota or private mode — history just won't persist */
    }
  }, [convos, activeId]);

  /** Load a past conversation. Replaces the screen; never re-runs a query. */
  const openConvo = useCallback((id: number) => {
    setActiveId(id);
    setMode("chat");
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto" }), 60);
  }, []);

  /** Start a fresh chat. The old one stays in the sidebar. */
  const newConvo = useCallback(() => {
    setActiveId(null);
    setQuestion("");
    setMode("chat");
  }, []);

  const deleteConvo = useCallback((id: number) => {
    setConvos((p) => p.filter((c) => c.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!isAdmin) router.replace("/access-denied");
  }, [user, isAdmin, loading, router]);

  const loadBoard = useCallback(async (f: Filters) => {
    setLoadingBoard(true);
    setError("");
    const res = await getOverview(f);
    if (!res.ok) setError(res.message);
    else setOv(res.data);
    setLoadingBoard(false);
  }, []);

  useEffect(() => {
    if (loading || !user || !isAdmin) return;
    void loadBoard(filters);
  }, [filters, loading, user, isAdmin, loadBoard]);

  useEffect(() => {
    if (loading || !user || !isAdmin) return;
    void (async () => {
      const m = await getAnalyticsMeta();
      if (m.ok) setMeta(m.data);
      const c = await listCards();
      if (c.ok) setCards(c.data.cards);
    })();
  }, [loading, user, isAdmin]);

  const lastPlan: QueryPlan | null = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const r = turns[i].res;
      if (r.supported) return r.plan;
    }
    return null;
  }, [turns]);

  const runAsk = useCallback(
    async (q: string, keepContext: boolean) => {
      const text = q.trim();
      if (!text) return;
      setMode("chat");
      setAsking(true);
      setError("");
      setQuestion("");
      setPending(text);
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 40);

      // Phase 1 — plan + aggregate only. The chart and every figure are
      // final at this point; we don't make the director wait on prose.
      const res = await ask({
        question: text,
        previousPlan: keepContext ? lastPlan : null,
        channel: filters.channel,
        city: filters.city || undefined,
        timePreset: filters.timePreset,
        categoryId: filters.categoryId || undefined,
        vendorId: filters.vendorId || undefined,
        narrate: false,
      });
      setAsking(false);
      setPending("");
      if (!res.ok) {
        setQuestion(text);   // put it back so the wording isn't lost
        return setError(res.message);
      }

      const turnId = Date.now();
      const turn: Turn = { id: turnId, question: text, res: res.data };

      // Append to the conversation we're in, or start a new one titled
      // with the first question — the same way a chat app names a thread.
      let convoId = activeId;
      if (convoId === null) {
        convoId = turnId;
        setActiveId(convoId);
        setConvos((p) => [...p, {
          id: convoId as number,
          title: text,
          createdAt: turnId,
          turns: [turn],
        }]);
      } else {
        setConvos((p) => p.map((c) =>
          c.id === convoId ? { ...c, turns: [...c.turns, turn] } : c));
      }
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);

      // Phase 2 — swap in the AI wording when it lands. If this never
      // returns, the code-written headline already on screen stands.
      const patchTurn = (patch: Partial<AskResponse>) =>
        setConvos((p) => p.map((c) =>
          c.id !== convoId ? c : {
            ...c,
            turns: c.turns.map((t) =>
              t.id === turnId && t.res.supported
                ? { ...t, res: { ...t.res, ...patch } as AskResponse }
                : t),
          }));

      const d = res.data;
      if (d.supported && d.narrationPending) {
        const n = await narrateAnswer(text, d.plan);
        patchTurn(n.ok
          ? { narrative: n.data.narrative, narrationPending: false }
          : { narrationPending: false });
      }
    },
    [lastPlan, filters, activeId]
  );

  /**
   * Cross-filter: clicking a value in any visual toggles it as a page-wide
   * filter. Clicking the same value again clears it, which is what people
   * expect from a slicer.
   */
  const crossFilter = useCallback((field: FilterField, value: string) => {
    setFilters((f) => (f[field] === value ? clearFilter(f, field) : { ...f, [field]: value }));
  }, []);

  function flash(msg: string) {
    setBanner(msg);
    window.setTimeout(() => setBanner(""), 4000);
  }

  async function onSaveCard(t: string, r: "daily" | "weekly" | "manual", v: "directors" | "private") {
    if (!saveFor || !saveFor.res.supported) return;
    setBusy("save");
    const res = await saveCard({
      title: t, plan: saveFor.res.plan, refresh: r, visibility: v, question: saveFor.question,
    });
    setBusy(null);
    setSaveFor(null);
    if (!res.ok) return setError(res.message);
    setCards((p) => [...p, res.data.card]);
    flash(`Pinned “${t}” to the dashboard.`);
  }

  async function onRollup() {
    setBusy("rollup");
    const res = await triggerRollup(30);
    setBusy(null);
    if (!res.ok) return setError(res.message);
    flash(`Rebuilt ${res.data.days} days of aggregates.`);
    void loadBoard(filters);
  }

  async function onExport(plan: QueryPlan) {
    setBusy("export");
    const res = await exportCsv(plan);
    setBusy(null);
    if (!res.ok) setError(res.message);
  }

  const isLive = useMemo(() => (ov?.meta?.sources || []).includes("live"), [ov]);
  const b = ov?.breakdowns;

  if (loading || !user || !isAdmin) {
    return <div style={{ padding: 40, textAlign: "center", color: MUTED }}>Loading…</div>;
  }

  return (
    <div className="bi">
      <style>{css}</style>

      {/* ================= sidebar ================= */}
      <aside className="bi-nav">
        <div className="bi-brand">
          <div className="bi-logo">T</div>
          <div>
            <div className="bi-brandname">TerraInfra360</div>
            <div className="bi-brandsub">ADMIN · AI HUB</div>
          </div>
        </div>

        {/* No Hub menu here — the AI Hub already has its own navigation and
            repeating it made this page feel like a separate app. The rail
            carries only what belongs to Analytics. */}
        <Link href="/" className="bi-navback">← AI Hub</Link>

        <button
          className={`bi-navitem bi-navbtnitem ${mode === "dashboard" ? "bi-active" : ""}`}
          onClick={() => setMode("dashboard")}
        >
          Dashboard
        </button>
        <button className="bi-navitem bi-navbtnitem bi-newchat" onClick={newConvo}>
          <span>＋</span> Ask your data
        </button>

        {/* History only. Each entry is its own conversation — clicking one
            loads that whole chat. Example prompts live in the chat view,
            not here; the rail is for what you've actually asked. */}
        <div className="bi-navlabel" style={{ marginTop: 22 }}>History</div>
        {convos.length ? (
          <div className="bi-convos">
            {[...convos].sort((a, b) => b.createdAt - a.createdAt).map((c) => (
              <div
                key={c.id}
                className={`bi-convo ${activeId === c.id && mode === "chat" ? "bi-convoon" : ""}`}
                onClick={() => openConvo(c.id)}
                title={c.title}
              >
                <span className="bi-convotitle">{c.title}</span>
                <span className="bi-convometa">
                  {c.turns.length} {c.turns.length === 1 ? "question" : "questions"}
                </span>
                <button
                  className="bi-convodel"
                  title="Delete this chat"
                  onClick={(e) => { e.stopPropagation(); deleteConvo(c.id); }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bi-convoempty">
            Your chats will appear here once you ask something.
          </div>
        )}

        {cards.length ? (
          <>
            <div className="bi-navlabel" style={{ marginTop: 22 }}>Pinned</div>
            {cards.slice(0, 4).map((c) => (
              <div key={c.id} className="bi-navpin">
                <span>{c.title}</span>
                <b>{c.last?.display ?? "—"}</b>
              </div>
            ))}
          </>
        ) : null}

        <div className="bi-navfoot">
          <div className="bi-navuser">
            <div className="bi-navname">{name || user.email}</div>
            <div className="bi-navrole">{role === "super_admin" ? "Super Admin" : "Admin"}</div>
            <div className="bi-navstatus" title={isLive
              ? "Reading orders directly — slower. Rebuild to speed it up."
              : "Reading nightly pre-computed totals — fast."}>
              <span className={isLive ? "bi-dotwarn" : "bi-dotok"} />
              {isLive ? "Live data" : "Up to date"}
              <button onClick={() => void onRollup()} disabled={busy === "rollup"}>
                {busy === "rollup" ? "refreshing…" : "refresh"}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ================= CHAT MODE ================= */}
      {mode === "chat" ? (
        <main className="bi-main bi-chatmain">
          <header className="bi-chathead">
            <button className="bi-back" onClick={() => setMode("dashboard")}>← Dashboard</button>
            <div className="bi-chattitle">
              <b>{active ? active.title : "Ask your data"}</b>
              <span>{filters.timePreset.replace(/_/g, " ")} · {filters.channel} channels
                {filters.city ? ` · ${filters.city}` : ""}</span>
            </div>
            <button className="bi-link" onClick={newConvo}>＋ Ask your data</button>
          </header>

          {error ? <div className="bi-banner bi-err">{error}</div> : null}
          {banner ? <div className="bi-banner bi-ok">{banner}</div> : null}

          <div className="bi-thread">
            {turns.length === 0 && !asking ? (
              <div className="bi-welcome">
                <div className="bi-welcomeicon">💬</div>
                <h2>What would you like to know?</h2>
              </div>
            ) : null}

            {turns.map((t) => (
              <TurnBlock key={t.id} turn={t} busy={busy}
                onFollow={(q) => void runAsk(q, true)}
                onSave={() => setSaveFor(t)}
                onExport={onExport} />
            ))}

            {asking ? (
              <>
                <div className="bi-q"><span>{pending}</span></div>
                <div className="bi-a">
                  <div className="bi-thinking">
                    <div className="bi-dots"><span /><span /><span /></div>
                    <div>Planning the query, then running it against your orders…</div>
                  </div>
                </div>
              </>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="bi-composer">
            <form onSubmit={(e) => { e.preventDefault(); void runAsk(question, true); }}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={turns.length
                  ? "Ask a follow-up — “and last month?”, “only B2B”…"
                  : "e.g. which category grew most in Mysore last month?"}
                disabled={asking}
                autoFocus
              />
              <button type="submit" className="bi-btn bi-btn-primary" disabled={asking || !question.trim()}>
                {asking ? "…" : "Ask"}
              </button>
            </form>
            {turns.length === 0 ? (
              <div className="bi-chips">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="bi-chip" onClick={() => void runAsk(ex, false)}>{ex}</button>
                ))}
              </div>
            ) : (
              <div className="bi-composerhint">Follow-ups keep the context of your last question.</div>
            )}
          </div>
        </main>
      ) : (
        /* ================= DASHBOARD MODE ================= */
        <main className="bi-main">
          <header className="bi-top">
            <div>
              <h1>Analytics</h1>
              <p>Ask your data — plain questions, real numbers.</p>
            </div>
            <div className="bi-period">
              {ov?.period?.label ? (
                <>
                  <span>{ov.period.label}</span>
                  <small>vs {ov.period.previousFrom} → {ov.period.previousTo}</small>
                </>
              ) : null}
            </div>
          </header>

          <div className="bi-toolbar">
            <Segmented value={filters.timePreset}
              onChange={(v) => setFilters((f) => ({ ...f, timePreset: v }))}
              options={QUICK_TIME} />
            <div className="bi-tbspacer" />
            <Select label="Channel" value={filters.channel}
              onChange={(v) => setFilters((f) => ({ ...f, channel: v }))}
              options={(meta?.channels || FALLBACK_CHANNELS).map((c) => ({ value: c.id, label: c.label }))} />
            <Select label="Region" value={filters.city}
              onChange={(v) => setFilters((f) => ({ ...f, city: v }))}
              options={[{ value: "", label: "All regions" },
                ...(ov?.regions || []).map((r) => ({ value: r.key, label: r.label }))]} />
            <Select label="Period" value={filters.timePreset}
              onChange={(v) => setFilters((f) => ({ ...f, timePreset: v }))}
              options={(meta?.timePresets || FALLBACK_PRESETS).map((p) => ({ value: p.id, label: p.label }))} />
          </div>

          {ov?.activeFilters?.length ? (
            <div className="bi-slicers">
              <span className="bi-slicerlabel">Filtered by</span>
              {ov.activeFilters.map((c) => (
                <button key={`${c.field}:${c.value}`} className="bi-slicer"
                  onClick={() => setFilters((f) => clearFilter(f, c.field))}
                  title={`Remove ${c.fieldLabel} filter`}>
                  <em>{c.fieldLabel}</em> {c.label} <b>✕</b>
                </button>
              ))}
              {hasFilters(filters) ? (
                <button className="bi-slicerclear" onClick={() => setFilters(clearAllFilters)}>Clear all</button>
              ) : null}
            </div>
          ) : null}

          {banner ? <div className="bi-banner bi-ok">{banner}</div> : null}
          {error ? <div className="bi-banner bi-err">{error}</div> : null}

          <section className="bi-kpis">
            {(ov?.cards || PLACEHOLDER).map((c) => (
              <div className="bi-kpi" key={c.id}>
                <div className="bi-kpilabel">{c.label}</div>
                <div className="bi-kpivalue">
                  {loadingBoard ? <span className="bi-skel" /> : fmtValue(c.kind, c.value)}
                </div>
                <div className="bi-kpifoot">
                  {c.id === "growth" ? (
                    <span className="bi-kpicap">{c.caption || "vs previous"}</span>
                  ) : (
                    <><DeltaArrow value={c.changePct} /><span className="bi-kpicap">vs previous</span></>
                  )}
                </div>
                {ov?.byDay?.length && c.id !== "growth" ? (
                  <div className="bi-kpispark">
                    <Sparkbars points={ov.byDay} valueKey={c.id === "orders" ? "orders" : "gmv"} />
                  </div>
                ) : null}
              </div>
            ))}
          </section>

          <button className="bi-launcher" onClick={() => setMode("chat")}>
            <span className="bi-launchericon">💬</span>
            <span className="bi-launchertext">
              <b>Ask your data</b>
              <small>Plain questions, real numbers — opens the conversation view</small>
            </span>
            <span className="bi-launcherarrow">→</span>
          </button>

          {!loadingBoard && ov && !ov.hasData ? (
            <section className="bi-card bi-empty">
              <div className="bi-emptyicon">📊</div>
              <h3>No orders in {ov.period.label}</h3>
              <p>Nothing to chart for this period yet. Try a wider window — or if you
                know there are orders, rebuild the aggregates so they get picked up.</p>
              <div className="bi-chips" style={{ justifyContent: "center" }}>
                <button className="bi-chip" onClick={() => setFilters((f) => ({ ...f, timePreset: "this_year" }))}>Try this year</button>
                <button className="bi-chip" onClick={() => setFilters((f) => ({ ...f, timePreset: "last_30d" }))}>Last 30 days</button>
                <button className="bi-chip" onClick={() => void onRollup()}>Rebuild aggregates</button>
              </div>
            </section>
          ) : null}

          {ov?.hasData ? (
            <>
              <section className="bi-grid">
                <Card title="Revenue trend" sub={`Daily GMV · ${ov.period.label}`}>
                  <TrendChart points={ov.byDay} previous={ov.previousByDay} kind="money" height={230} />
                </Card>
                <Card title="Where it changed" sub="Detected automatically — no question needed">
                  <div className="bi-stack">
                    {ov.insights.slice(0, 5).map((i, idx) => (
                      <div key={idx} className={`bi-note bi-sev-${i.severity}`}>{i.text}</div>
                    ))}
                  </div>
                </Card>
              </section>

              <section className="bi-grid3">
                <Card title="Top categories" sub="Click a bar to filter the page">
                  {b?.category.length
                    ? <HBarChart rows={b.category} kind="money" selectedKey={filters.categoryId}
                        onPick={(r) => crossFilter("categoryId", r.key)} />
                    : <Empty />}
                </Card>
                <Card title="Top vendors" sub="Click a bar to filter the page">
                  {b?.vendor.length
                    ? <HBarChart rows={b.vendor} kind="money" selectedKey={filters.vendorId}
                        onPick={(r) => crossFilter("vendorId", r.key)} />
                    : <Empty />}
                </Card>
                <Card title="Channel mix" sub="Retail vs B2B">
                  {b?.channel.length
                    ? <Donut rows={b.channel} kind="money" centerLabel={fmtMoney(ov.totals.gmv)}
                        selectedKey={filters.channel === "all" ? "" : filters.channel}
                        onPick={(r) => crossFilter("channel", r.key)} />
                    : <Empty />}
                </Card>
              </section>

              <section className="bi-grid">
                <Card title="GMV by region" sub="Bubble size = revenue · click to filter">
                  <RegionMap rows={ov.regions} height={280} selectedKey={filters.city}
                    onPick={(r) => crossFilter("city", r.key)} />
                  <div className="bi-legend">
                    {ov.regions.slice(0, 5).map((r) => (
                      <span key={r.key}><b>{r.label}</b> {fmtMoney(r.gmv)} · {r.share.toFixed(0)}%</span>
                    ))}
                  </div>
                </Card>
                <Card title="Top regions" sub="Click a bar to filter the page">
                  {b?.city.length
                    ? <HBarChart rows={b.city} kind="money" selectedKey={filters.city}
                        onPick={(r) => crossFilter("city", r.key)} />
                    : <Empty />}
                </Card>
              </section>

              <section className="bi-grid">
                <Card title="Best-selling products" sub="By revenue contribution">
                  {b?.product.length ? <HBarChart rows={b.product} kind="money" showChange={false} /> : <Empty />}
                </Card>
                <Card title="Payment methods" sub="Share of GMV">
                  {b?.payment_method.length ? <Donut rows={b.payment_method} kind="money" /> : <Empty />}
                </Card>
              </section>
            </>
          ) : null}

          <section className="bi-card">
            <div className="bi-cardhead">
              <div>
                <h3 style={{ margin: 0 }}>Saved dashboard cards</h3>
                <p className="bi-sub">Pinned questions that refresh on their own</p>
              </div>
              <button className="bi-link" onClick={async () => {
                setBusy("cards");
                const r = await listCards(true);
                setBusy(null);
                if (r.ok) setCards(r.data.cards);
              }} disabled={busy === "cards"}>
                {busy === "cards" ? "Refreshing…" : "Refresh all"}
              </button>
            </div>
            {cards.length === 0 ? (
              <p className="bi-emptyline">
                Nothing pinned yet. Ask a question, then <b>Save to dashboard</b> to keep it here.
              </p>
            ) : (
              <div className="bi-savedgrid">
                {cards.map((c) => (
                  <div key={c.id} className="bi-saved">
                    <div className="bi-savedtitle">{c.title}</div>
                    <div className="bi-savedvalue">{c.last?.display ?? "—"}</div>
                    <div className="bi-savedfoot">
                      <DeltaArrow value={c.last?.changePct ?? null} />
                      <span>{c.last?.periodLabel || ""}</span>
                    </div>
                    <div className="bi-savedactions">
                      <button className="bi-link" onClick={async () => {
                        setBusy(c.id);
                        const r = await refreshCard(c.id);
                        setBusy(null);
                        if (r.ok) setCards((p) => p.map((x) => (x.id === c.id ? { ...x, last: r.data.last } : x)));
                      }} disabled={busy === c.id}>Refresh</button>
                      <button className="bi-link bi-dangerlink" onClick={async () => {
                        setBusy(c.id);
                        const r = await deleteCard(c.id);
                        setBusy(null);
                        if (r.ok) setCards((p) => p.filter((x) => x.id !== c.id));
                        else setError(r.message);
                      }} disabled={busy === c.id}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <footer className="bi-foot">
            {ov?.meta ? (
              <>Numbers from orders + b2b_orders · {ov.meta.days} days scanned ·{" "}
                {isLive ? "computed live" : "nightly aggregates"} · cancelled and
                failed-payment orders excluded</>
            ) : null}
          </footer>
        </main>
      )}

      {saveFor ? (
        <SaveModal
          defaultTitle={saveFor.res.supported ? saveFor.res.restated : saveFor.question}
          busy={busy === "save"}
          onClose={() => setSaveFor(null)}
          onSave={onSaveCard}
        />
      ) : null}
    </div>
  );
}

/* ===================== one Q&A turn ===================== */

function TurnBlock({
  turn, busy, onFollow, onSave, onExport,
}: {
  turn: Turn;
  busy: string | null;
  onFollow: (q: string) => void;
  onSave: () => void;
  onExport: (p: QueryPlan) => void;
}) {
  const r = turn.res;

  if (!r.supported) {
    return (
      <>
        <div className="bi-q"><span>{turn.question}</span></div>
        <div className="bi-a">
          <div className="bi-card bi-outside">
            <h3>Outside what I track</h3>
            <p>{r.message}</p>
            <div className="bi-chips">
              {r.available?.map((a) => <span key={a} className="bi-tag">{a}</span>)}
            </div>
          </div>
        </div>
      </>
    );
  }

  const res = r.result;
  const isTrend = res.dimension === "day" || res.dimension === "week" || res.dimension === "month";

  return (
    <>
      <div className="bi-q"><span>{turn.question}</span></div>
      <div className="bi-a">
        <div className="bi-card">
          <div className="bi-eyebrow">
            {r.restated}
            {r.narrationPending ? <span className="bi-writing">writing…</span> : null}
          </div>
          <h2 className="bi-headline">{r.narrative.headline}</h2>
          {r.narrative.detail ? <p className="bi-detail">{r.narrative.detail}</p> : null}

          <div style={{ marginTop: 16 }}>
            {isTrend || !res.rows.length ? (
              <TrendChart points={res.byDay} previous={res.previousByDay} kind={res.metricKind}
                valueKey={res.metric === "orders" ? "orders" : res.metric === "units" ? "units" : "gmv"} />
            ) : (
              <BarChart rows={res.rows} kind={res.metricKind} />
            )}
          </div>

          {r.narrative.insights?.length ? (
            <div className="bi-inlineinsights">
              {r.narrative.insights.slice(0, 3).map((t, i) => <div key={i} className="bi-note">{t}</div>)}
            </div>
          ) : null}

          {res.rows.length && !isTrend ? (
            <details className="bi-details">
              <summary>The numbers behind it ({res.rows.length} rows)</summary>
              <div className="bi-tablewrap">
                <table className="bi-table">
                  <thead>
                    <tr>
                      <th>{cap(res.dimension || "Row")}</th>
                      <th className="r">{res.metricLabel}</th>
                      <th className="r">Previous</th>
                      <th className="r">Change</th>
                      <th className="r">Share</th>
                      <th className="r">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.rows.map((row) => (
                      <tr key={row.key}>
                        <td><b>{row.label}</b></td>
                        <td className="r">{fmtValue(res.metricKind, row.value)}</td>
                        <td className="r m">{row.previousValue === null ? "—" : fmtValue(res.metricKind, row.previousValue)}</td>
                        <td className="r">{row.isNew ? <span className="bi-new">new</span> : <DeltaArrow value={row.changePct} />}</td>
                        <td className="r m">{row.share.toFixed(0)}%</td>
                        <td className="r m">{fmtCount(row.orders)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          <div className="bi-verify">{res.verification}</div>
          {res.notes?.length ? (
            <ul className="bi-notes">{res.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          ) : null}

          <div className="bi-actions">
            <button className="bi-btn bi-btn-primary" onClick={onSave}>Save to dashboard</button>
            <button className="bi-btn" onClick={() => onExport(r.plan)} disabled={busy === "export"}>
              {busy === "export" ? "Exporting…" : "Export CSV"}
            </button>
          </div>

          {r.followups?.length ? (
            <div className="bi-followrow">
              {r.followups.map((f) => (
                <button key={f.label} className="bi-follow" onClick={() => onFollow(f.label)}>{f.label}</button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ===================== small components ===================== */

function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bi-card">
      <div className="bi-cardhead">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {sub ? <p className="bi-sub">{sub}</p> : null}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Empty() { return <p className="bi-emptyline">No data for this selection.</p>; }

function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="bi-seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? "bi-segon" : ""}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="bi-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function SaveModal({ defaultTitle, busy, onClose, onSave }: {
  defaultTitle: string; busy: boolean; onClose: () => void;
  onSave: (t: string, r: "daily" | "weekly" | "manual", v: "directors" | "private") => void;
}) {
  const [title, setTitle] = useState(defaultTitle.slice(0, 80));
  const [refresh, setRefresh] = useState<"daily" | "weekly" | "manual">("daily");
  const [visibility, setVisibility] = useState<"directors" | "private">("directors");
  return (
    <div className="bi-modalbg" onClick={onClose}>
      <div className="bi-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 17 }}>Save as dashboard card</h3>
        <p className="bi-sub">The card keeps this exact query and re-runs it on schedule.</p>
        <label className="bi-field"><span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></label>
        <label className="bi-field"><span>Refresh</span>
          <select value={refresh} onChange={(e) => setRefresh(e.target.value as typeof refresh)}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option>
            <option value="manual">Manual only</option></select></label>
        <label className="bi-field"><span>Visible to</span>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
            <option value="directors">All directors</option><option value="private">Only me</option>
          </select></label>
        <div className="bi-modalfoot">
          <button className="bi-btn" onClick={onClose}>Cancel</button>
          <button className="bi-btn bi-btn-primary" disabled={busy || !title.trim()}
            onClick={() => onSave(title.trim(), refresh, visibility)}>
            {busy ? "Saving…" : "Save card"}</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== fallbacks ===================== */

const QUICK_TIME = [
  { value: "last_7d", label: "7D" }, { value: "last_30d", label: "30D" },
  { value: "this_month", label: "MTD" }, { value: "last_month", label: "Last mo" },
  { value: "this_quarter", label: "QTD" }, { value: "this_year", label: "YTD" },
];
const FALLBACK_PRESETS = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" }, { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" }, { id: "last_month", label: "Last month" },
  { id: "last_7d", label: "Last 7 days" }, { id: "last_30d", label: "Last 30 days" },
  { id: "this_quarter", label: "This quarter" }, { id: "this_year", label: "This year" },
];
const FALLBACK_CHANNELS = [
  { id: "all", label: "All channels" }, { id: "retail", label: "Retail" }, { id: "b2b", label: "B2B" },
];
const PLACEHOLDER: KpiCard[] = [
  { id: "gmv", label: "GMV", kind: "money", value: null, previousValue: null, changePct: null },
  { id: "orders", label: "Orders", kind: "count", value: null, previousValue: null, changePct: null },
  { id: "aov", label: "Avg order", kind: "money", value: null, previousValue: null, changePct: null },
  { id: "buyers", label: "Buyers", kind: "count", value: null, previousValue: null, changePct: null },
  { id: "growth", label: "Growth", kind: "percent_signed", value: null, previousValue: null, changePct: null },
];

/* ===================== styles ===================== */

const css = `
.bi { display:grid; grid-template-columns:232px 1fr; min-height:100vh; background:#f4f6fa; }
.bi * { box-sizing:border-box; }

/* ---- sidebar ----
   Depth instead of flat fill: a soft vertical gradient, a hairline edge
   catching the light, and an active state that tints rather than shouts.
   A solid saturated block on flat black is the thing that reads cheap. */
.bi-nav {
  background:
    radial-gradient(120% 55% at 0% 0%, rgba(59,130,246,.10) 0%, transparent 62%),
    linear-gradient(180deg, #121b30 0%, #0b1221 48%, #070d19 100%);
  color:#cbd5e1; padding:22px 14px; display:flex; flex-direction:column;
  position:sticky; top:0; height:100vh;
  border-right:1px solid rgba(148,163,184,.10);
  box-shadow: inset -1px 0 0 rgba(255,255,255,.035), 6px 0 24px rgba(2,6,20,.30);
}
.bi-brand { display:flex; gap:11px; align-items:center; margin-bottom:22px; }
.bi-logo { width:36px; height:36px; border-radius:11px;
  background:linear-gradient(140deg,#60a5fa 0%,#3b82f6 45%,#7c3aed 100%);
  color:#fff; display:flex; align-items:center; justify-content:center;
  font-weight:900; font-size:16px; letter-spacing:-.5px;
  box-shadow:0 6px 18px rgba(59,130,246,.34), inset 0 1px 0 rgba(255,255,255,.28); }
.bi-brandname { color:#f1f5f9; font-weight:800; font-size:13.5px; letter-spacing:-.1px; }
.bi-brandsub { color:#5b6b86; font-size:8.5px; letter-spacing:1.5px; font-weight:800; margin-top:2px; }

.bi-navlabel { font-size:9px; letter-spacing:1.5px; color:#4a5a75; font-weight:800;
  margin:0 0 9px 11px; text-transform:uppercase; }
.bi-navback { display:inline-flex; align-items:center; gap:5px; font-size:11.5px;
  color:#64748b; text-decoration:none; font-weight:700; padding:0 0 18px 3px;
  transition:color .15s ease; }
.bi-navback:hover { color:#93c5fd; }

.bi-navitem { position:relative; display:block; width:100%; text-align:left;
  padding:10px 13px; border-radius:9px; font-size:13px; color:#8fa0ba;
  text-decoration:none; margin-bottom:3px; font-weight:600;
  transition:background .16s ease, color .16s ease; }
.bi-navbtnitem { background:none; border:none; cursor:pointer; font-family:inherit; }
.bi-navitem:hover { background:rgba(255,255,255,.045); color:#e2e8f0; }
.bi-active {
  background:linear-gradient(90deg, rgba(59,130,246,.22) 0%, rgba(59,130,246,.05) 100%);
  color:#fff !important; font-weight:700;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
}
.bi-active::before { content:""; position:absolute; left:0; top:9px; bottom:9px;
  width:3px; border-radius:0 3px 3px 0;
  background:linear-gradient(180deg,#93c5fd,#3b82f6);
  box-shadow:0 0 10px rgba(59,130,246,.55); }
.bi-count { background:rgba(147,197,253,.20); color:#bfdbfe; border-radius:999px;
  padding:1px 7px; font-size:10px; margin-left:6px; font-weight:800; }
/* conversation list — each row is a separate chat */
.bi-newchat { color:#93c5fd !important; display:flex; align-items:center; gap:7px; }
.bi-newchat span { font-size:15px; line-height:1; opacity:.85; }
.bi-newchat:hover { background:rgba(59,130,246,.12) !important; color:#dbeafe !important; }
.bi-convos { display:grid; gap:2px; max-height:34vh; overflow-y:auto; padding-right:2px; }
.bi-convos::-webkit-scrollbar { width:4px; }
.bi-convos::-webkit-scrollbar-thumb { background:rgba(148,163,184,.22); border-radius:4px; }
.bi-convo { position:relative; padding:8px 26px 8px 13px; border-radius:8px; cursor:pointer;
  transition:background .16s ease; }
.bi-convo:hover { background:rgba(255,255,255,.045); }
.bi-convoon { background:rgba(59,130,246,.16); }
.bi-convoon::before { content:""; position:absolute; left:0; top:7px; bottom:7px; width:2px;
  border-radius:0 2px 2px 0; background:#60a5fa; }
.bi-convotitle { display:block; font-size:11.5px; color:#8fa0ba; line-height:1.35;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.bi-convoon .bi-convotitle { color:#e8effb; }
.bi-convometa { display:block; font-size:9px; color:#4a5a75; margin-top:2px; font-weight:700; }
.bi-convodel { position:absolute; right:6px; top:50%; transform:translateY(-50%);
  background:none; border:none; color:#4a5a75; font-size:10px; cursor:pointer;
  padding:3px 5px; border-radius:5px; opacity:0; transition:opacity .15s ease; }
.bi-convo:hover .bi-convodel { opacity:1; }
.bi-convodel:hover { color:#f87171; background:rgba(248,113,113,.12); }
.bi-convoempty { font-size:10.5px; color:#4a5a75; line-height:1.5; padding:2px 13px 0;
  max-width:190px; }
.bi-navpin { padding:9px 12px; border-radius:9px; margin-bottom:4px;
  background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.018));
  border:1px solid rgba(148,163,184,.09); }
.bi-navpin span { display:block; font-size:9.5px; color:#5f7089; font-weight:600;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; letter-spacing:.2px; }
.bi-navpin b { font-size:14px; color:#eef2f8; font-weight:800; letter-spacing:-.3px; }

/* user block — extra bottom padding keeps it clear of the dev-tools badge */
.bi-navfoot { margin-top:auto; padding-bottom:40px; }
.bi-navuser { border-top:1px solid rgba(148,163,184,.13); padding-top:13px; }
.bi-navname { font-size:12.5px; color:#e2e8f0; font-weight:700; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; letter-spacing:-.1px; }
.bi-navrole { font-size:9px; color:#5b6b86; font-weight:800; letter-spacing:1.1px;
  text-transform:uppercase; margin-top:3px; }
.bi-navstatus { display:flex; align-items:center; gap:7px; margin-top:11px; font-size:10.5px;
  color:#6b7c96; padding:7px 9px; border-radius:8px; background:rgba(255,255,255,.035);
  border:1px solid rgba(148,163,184,.08); }
.bi-navstatus button { background:none; border:none; color:#60a5fa; font-size:10.5px;
  font-weight:800; cursor:pointer; padding:0; margin-left:auto; }
.bi-navstatus button:hover { color:#93c5fd; }
.bi-navstatus button:disabled { opacity:.5; cursor:default; }
.bi-dotok, .bi-dotwarn { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.bi-dotok { background:#22c55e; box-shadow:0 0 8px rgba(34,197,94,.65); }
.bi-dotwarn { background:#f59e0b; box-shadow:0 0 8px rgba(245,158,11,.65); }

.bi-main { padding:22px 24px 50px; min-width:0; }

.bi-chatmain { display:flex; flex-direction:column; height:100vh; padding:0; }
.bi-chathead { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:14px 24px; border-bottom:1px solid ${LINE}; background:#fff; }
.bi-back { background:#f1f5f9; border:1px solid ${LINE}; border-radius:8px; padding:7px 13px; font-size:12px; font-weight:800; color:#334155; cursor:pointer; }
.bi-back:hover { background:#e2e8f0; }
.bi-chattitle { text-align:center; }
.bi-chattitle b { display:block; font-size:13.5px; color:${INK}; }
.bi-chattitle span { font-size:10.5px; color:${FAINT}; text-transform:capitalize; }
.bi-thread { flex:1; overflow-y:auto; padding:22px 24px 10px; }
.bi-welcome { text-align:center; padding:60px 20px; }
.bi-welcomeicon { font-size:38px; }
.bi-welcome h2 { font-size:21px; font-weight:900; color:${INK}; margin:12px 0 8px; }
.bi-welcome p { font-size:13.5px; color:${MUTED}; max-width:430px; margin:0 auto; line-height:1.6; }
.bi-q { display:flex; justify-content:flex-end; margin:0 0 12px; }
.bi-q span { background:${BLUE}; color:#fff; padding:10px 16px; border-radius:16px 16px 4px 16px; font-size:13.5px; font-weight:600; max-width:min(560px,80%); }
.bi-a { margin-bottom:26px; max-width:900px; border-radius:14px; }
.bi-composer { border-top:1px solid ${LINE}; background:#fff; padding:14px 24px 18px; }
.bi-composer form { display:flex; gap:10px; }
.bi-composer input { flex:1; border:1px solid ${LINE}; border-radius:11px; padding:13px 16px; font-size:13.5px; color:${INK}; outline:none; background:#fbfcfe; }
.bi-composer input:focus { border-color:${BLUE}; background:#fff; box-shadow:0 0 0 3px rgba(37,99,235,.10); }
.bi-composerhint { font-size:10.5px; color:${FAINT}; margin-top:7px; }
.bi-inlineinsights { display:grid; gap:7px; margin-top:14px; }
.bi-followrow { display:flex; gap:7px; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid #f1f5f9; }
.bi-details { margin-top:14px; }
.bi-details summary { cursor:pointer; font-size:12px; font-weight:800; color:${BLUE}; padding:6px 0; }
.bi-launcher { display:flex; align-items:center; gap:14px; width:100%; background:#fff; border:1px solid ${LINE}; border-radius:13px; padding:16px 18px; cursor:pointer; text-align:left; margin-bottom:14px; }
.bi-launcher:hover { border-color:#bfdbfe; box-shadow:0 2px 10px rgba(37,99,235,.08); }
.bi-launchericon { font-size:22px; }
.bi-launchertext { flex:1; }
.bi-launchertext b { display:block; font-size:14px; color:${INK}; }
.bi-launchertext small { font-size:11.5px; color:${FAINT}; }
.bi-launcherarrow { color:${BLUE}; font-weight:900; }

.bi-top { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:16px; flex-wrap:wrap; }
.bi-top h1 { margin:0; font-size:25px; font-weight:900; color:${INK}; letter-spacing:-.5px; }
.bi-top p { margin:3px 0 0; font-size:13px; color:${MUTED}; }
.bi-period { text-align:right; }
.bi-period span { display:block; font-size:13px; font-weight:800; color:${INK}; }
.bi-period small { font-size:10.5px; color:${FAINT}; }
.bi-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; background:#fff; border:1px solid ${LINE}; border-radius:12px; padding:10px 12px; margin-bottom:14px; }
.bi-tbspacer { flex:1; min-width:0; }
.bi-seg { display:flex; background:#f1f5f9; border-radius:9px; padding:3px; gap:2px; }
.bi-seg button { border:none; background:none; padding:6px 12px; border-radius:7px; font-size:11.5px; font-weight:800; color:${MUTED}; cursor:pointer; }
.bi-segon { background:#fff !important; color:${BLUE} !important; box-shadow:0 1px 3px rgba(0,0,0,.10); }
.bi-select { display:flex; align-items:center; gap:7px; background:#f8fafc; border:1px solid ${LINE}; border-radius:9px; padding:6px 10px; }
.bi-select > span { font-size:10.5px; color:${FAINT}; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
.bi-select select { border:none; background:transparent; font-size:12.5px; font-weight:700; color:${INK}; outline:none; cursor:pointer; max-width:130px; }

.bi-slicers { display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:#eff6ff; border:1px solid #bfdbfe; border-radius:11px; padding:9px 12px; margin-bottom:14px; }
.bi-slicerlabel { font-size:10.5px; font-weight:800; color:#1e40af; text-transform:uppercase; letter-spacing:.5px; }
.bi-slicer { display:inline-flex; align-items:center; gap:6px; background:#fff; border:1px solid #bfdbfe; border-radius:999px; padding:5px 11px; font-size:12px; font-weight:700; color:#1d4ed8; cursor:pointer; }
.bi-slicer:hover { background:#dbeafe; }
.bi-slicer em { font-style:normal; font-size:9.5px; color:${FAINT}; text-transform:uppercase; font-weight:800; letter-spacing:.4px; }
.bi-slicer b { color:#93a4c0; font-weight:800; font-size:11px; }
.bi-slicer:hover b { color:#dc2626; }
.bi-slicerclear { background:none; border:none; color:#1d4ed8; font-size:11.5px; font-weight:800; cursor:pointer; text-decoration:underline; margin-left:auto; }

.bi-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:14px; }
.bi-kpi { background:#fff; border:1px solid ${LINE}; border-radius:13px; padding:14px 15px; position:relative; overflow:hidden; }
.bi-kpilabel { font-size:11px; color:${MUTED}; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
.bi-kpivalue { font-size:26px; font-weight:900; color:${INK}; letter-spacing:-.8px; margin-top:5px; line-height:1.1; }
.bi-kpifoot { display:flex; align-items:center; gap:6px; margin-top:5px; }
.bi-kpicap { font-size:10.5px; color:${FAINT}; }
.bi-kpispark { position:absolute; right:10px; bottom:8px; opacity:.5; pointer-events:none; }
.bi-grid { display:grid; grid-template-columns:1fr 380px; gap:14px; }
.bi-grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }

.bi-card { background:#fff; border:1px solid ${LINE}; border-radius:13px; padding:16px 18px; margin-bottom:14px; }
.bi-cardhead { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
.bi-cardhead h3 { font-size:14px; font-weight:900; color:${INK}; }
.bi-sub { margin:2px 0 0; font-size:11.5px; color:${FAINT}; }
.bi-chips { display:flex; gap:7px; flex-wrap:wrap; margin-top:10px; }
.bi-chip { background:#f1f5f9; border:1px solid ${LINE}; border-radius:999px; padding:6px 12px; font-size:11.5px; color:#475569; font-weight:600; cursor:pointer; }
.bi-chip:hover { background:#e2e8f0; color:${INK}; }
.bi-tag { background:#fef3c7; color:#92400e; border-radius:999px; padding:4px 11px; font-size:11px; font-weight:700; }
.bi-btn { background:#fff; border:1px solid ${LINE}; color:#334155; border-radius:9px; padding:10px 16px; font-size:12.5px; font-weight:700; cursor:pointer; }
.bi-btn:hover { background:#f8fafc; }
.bi-btn:disabled { opacity:.5; cursor:default; }
.bi-btn-primary { background:${BLUE}; border-color:${BLUE}; color:#fff; }
.bi-btn-primary:hover { background:#1d4ed8; }
.bi-link { background:none; border:none; color:${BLUE}; font-size:11.5px; font-weight:800; cursor:pointer; padding:0; }
.bi-link:disabled { opacity:.5; cursor:default; }
.bi-dangerlink { color:#dc2626; }
.bi-eyebrow { font-size:10px; letter-spacing:.7px; color:${FAINT}; font-weight:800; text-transform:uppercase; }
.bi-headline { font-size:20px; font-weight:900; color:${INK}; margin:6px 0 0; line-height:1.35;
  transition:opacity .25s ease; }
.bi-writing { margin-left:8px; color:${BLUE}; font-weight:800; text-transform:none;
  letter-spacing:0; animation:biw 1.3s ease-in-out infinite; }
@keyframes biw { 0%,100%{opacity:.35} 50%{opacity:1} }
.bi-detail { font-size:13.5px; color:#475569; margin:8px 0 0; line-height:1.55; }
.bi-verify { font-size:11px; color:${FAINT}; margin-top:12px; }
.bi-notes { margin:8px 0 0; padding-left:18px; font-size:11.5px; color:#b45309; }
.bi-actions { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
.bi-stack { display:grid; gap:8px; margin-top:10px; }
.bi-note { background:#f8fafc; border:1px solid ${LINE}; border-radius:9px; padding:10px 12px; font-size:12px; color:#334155; line-height:1.45; }
.bi-sev-warn { border-left:3px solid #f59e0b; }
.bi-sev-good { border-left:3px solid #10b981; }
.bi-sev-info { border-left:3px solid ${FAINT}; }
.bi-follow { background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:999px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; }
.bi-follow:hover { background:#dbeafe; }
.bi-tablewrap { overflow-x:auto; margin-top:10px; }
.bi-table { width:100%; border-collapse:collapse; font-size:12.5px; }
.bi-table th { text-align:left; padding:9px 12px; color:${FAINT}; font-weight:800; font-size:10.5px; text-transform:uppercase; letter-spacing:.4px; border-bottom:1px solid ${LINE}; white-space:nowrap; }
.bi-table td { padding:10px 12px; border-bottom:1px solid #f4f7fb; color:#334155; white-space:nowrap; }
.bi-table tr:last-child td { border-bottom:none; }
.bi-table .r { text-align:right; }
.bi-table .m { color:${MUTED}; }
.bi-new { background:#dcfce7; color:#166534; border-radius:999px; padding:2px 8px; font-size:10px; font-weight:800; }
.bi-savedgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(158px,1fr)); gap:10px; margin-top:12px; }
.bi-saved { background:#f8fafc; border:1px solid ${LINE}; border-radius:11px; padding:12px; }
.bi-savedtitle { font-size:11px; color:${MUTED}; font-weight:700; }
.bi-savedvalue { font-size:20px; font-weight:900; color:${INK}; margin-top:4px; letter-spacing:-.4px; }
.bi-savedfoot { display:flex; align-items:center; gap:7px; margin-top:4px; font-size:10px; color:${FAINT}; }
.bi-savedactions { display:flex; gap:10px; margin-top:8px; }
.bi-banner { padding:11px 14px; border-radius:10px; font-size:12.5px; font-weight:600; margin:0 0 12px; }
.bi-ok { background:#dcfce7; color:#166534; }
.bi-err { background:#fee2e2; color:#b91c1c; }
.bi-skel { display:inline-block; width:96px; height:26px; border-radius:7px; background:linear-gradient(90deg,#eef2f7 25%,#e2e8f0 50%,#eef2f7 75%); background-size:200% 100%; animation:bish 1.2s infinite; }
@keyframes bish { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.bi-thinking { display:flex; align-items:center; gap:14px; font-size:12.5px; color:${MUTED}; background:#fff; border:1px solid ${LINE}; border-radius:13px; padding:18px; }
.bi-dots { display:flex; gap:5px; }
.bi-dots span { width:8px; height:8px; border-radius:50%; background:${BLUE}; opacity:.35; animation:bib 1.1s infinite; }
.bi-dots span:nth-child(2){animation-delay:.15s} .bi-dots span:nth-child(3){animation-delay:.3s}
@keyframes bib { 0%,60%,100%{transform:translateY(0);opacity:.35} 30%{transform:translateY(-6px);opacity:1} }
.bi-outside { border-left:4px solid #f59e0b; }
.bi-outside h3 { margin:0 0 6px; font-size:14px; color:${INK}; }
.bi-outside p { margin:0; font-size:13px; color:#475569; }
.bi-empty { text-align:center; padding:40px 20px; }
.bi-emptyicon { font-size:34px; }
.bi-empty h3 { margin:10px 0 6px; font-size:16px; color:${INK}; }
.bi-empty p { margin:0 auto 14px; font-size:13px; color:${MUTED}; max-width:440px; line-height:1.6; }
.bi-emptyline { font-size:12.5px; color:${FAINT}; padding:14px 2px; margin:0; }
.bi-legend { display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; font-size:11px; color:${MUTED}; }
.bi-legend b { color:${INK}; }
.bi-foot { font-size:11px; color:${FAINT}; text-align:center; padding:8px 0 0; }
.bi-modalbg { position:fixed; inset:0; background:rgba(15,23,42,.5); display:flex; align-items:center; justify-content:center; padding:20px; z-index:60; }
.bi-modal { background:#fff; border-radius:15px; padding:22px; width:100%; max-width:420px; box-shadow:0 24px 60px rgba(0,0,0,.25); }
.bi-field { display:block; margin-top:14px; }
.bi-field > span { display:block; font-size:11px; font-weight:800; color:${MUTED}; margin-bottom:5px; text-transform:uppercase; letter-spacing:.4px; }
.bi-field input, .bi-field select { width:100%; border:1px solid ${LINE}; border-radius:9px; padding:9px 11px; font-size:13px; color:${INK}; outline:none; background:#fff; }
.bi-modalfoot { display:flex; gap:8px; justify-content:flex-end; margin-top:18px; }

@media (max-width:1240px){ .bi-grid3 { grid-template-columns:1fr 1fr; } }
@media (max-width:1100px){ .bi-grid { grid-template-columns:1fr; } .bi-kpis { grid-template-columns:repeat(3,1fr); } }
@media (max-width:900px){
  .bi { grid-template-columns:1fr; }
  .bi-nav { position:relative; height:auto; flex-direction:row; align-items:center; gap:10px; overflow-x:auto; padding:12px; }
  .bi-navlabel, .bi-navfoot { display:none; }
  .bi-brand { margin:0; }
  .bi-navitem { white-space:nowrap; width:auto; }
  .bi-grid3 { grid-template-columns:1fr; }
  .bi-kpis { grid-template-columns:repeat(2,1fr); }
  .bi-chatmain { height:auto; min-height:100vh; }
}
@media (max-width:560px){
  .bi-main { padding:16px 14px 40px; }
  .bi-thread, .bi-composer, .bi-chathead { padding-left:14px; padding-right:14px; }
  .bi-kpis { grid-template-columns:1fr 1fr; }
  .bi-composer form { flex-direction:column; }
}
`;
