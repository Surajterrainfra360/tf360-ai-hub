"use client";

/**
 * AI Features — the kill switches.
 *
 * The LIST of features lives in this repo at src/lib/featureCatalogue.ts.
 * To add or remove a toggle, edit that file. The AI service is only asked
 * for each feature's on/off STATE.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDirectorAuth } from "@/lib/adminAuth";
import { listFeatures, toggleFeature, type FeatureState } from "@/lib/aiAdmin";
import {
  FEATURE_CATALOGUE,
  FEATURE_GROUPS,
  type CatalogueEntry,
} from "@/lib/featureCatalogue";

export default function FeaturesPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useDirectorAuth();

  const [states, setStates] = useState<Record<string, FeatureState>>({});
  const [loadingStates, setLoadingStates] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadingStates(true);
    setError("");
    const res = await listFeatures();
    if (!res.ok) {
      setError(res.message);
    } else {
      // Prefer the `states` map (covers every id). Fall back to the older
      // `features` array so an un-updated AI service still works.
      const next: Record<string, FeatureState> = { ...(res.data.states || {}) };
      for (const f of res.data.features || []) {
        if (!(f.id in next)) {
          next[f.id] = { enabled: f.enabled, providerOverride: f.providerOverride };
        }
      }
      setStates(next);
    }
    setLoadingStates(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isAdmin) {
      router.replace("/access-denied");
      return;
    }
    void reload();
  }, [user, isAdmin, loading, router, reload]);

  /** Missing doc = enabled. Matches feature_flags.is_enabled() on the server. */
  const isOn = (id: string) => states[id]?.enabled ?? true;

  async function handleToggle(entry: CatalogueEntry) {
    const next = !isOn(entry.id);
    setBusyId(entry.id);
    setError("");
    // Optimistic — the switch should feel instant.
    setStates((p) => ({ ...p, [entry.id]: { ...(p[entry.id] || {}), enabled: next } }));
    const res = await toggleFeature(entry.id, next);
    if (!res.ok) {
      setError(`${entry.name}: ${res.message}`);
      setStates((p) => ({ ...p, [entry.id]: { ...(p[entry.id] || {}), enabled: !next } }));
    }
    setBusyId(null);
  }

  if (loading || !user || !isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading…</div>
    );
  }

  const onCount = FEATURE_CATALOGUE.filter((f) => isOn(f.id)).length;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px 60px" }}>
      <style>{css}</style>

      <div style={{ marginBottom: 18 }}>
        <Link href="/" className="ff-back">← Back to dashboard</Link>
      </div>

      <div className="ff-head">
        <div>
          <h1>AI Features</h1>
          <p>
            Toggle any module on or off. Changes take effect within ~30 seconds
            across all tf360 apps.
          </p>
        </div>
        <div className="ff-count">
          {loadingStates ? "…" : `${onCount} of ${FEATURE_CATALOGUE.length} on`}
        </div>
      </div>

      {error ? <div className="ff-err">{error}</div> : null}

      {FEATURE_GROUPS.map((group) => {
        const items = FEATURE_CATALOGUE.filter((f) => f.group === group.id);
        if (!items.length) return null;
        return (
          <section key={group.id} className="ff-group">
            <div className="ff-grouphead">
              <span>{group.label}</span>
              <i />
            </div>

            <div className="ff-list">
              {items.map((f) => {
                const on = isOn(f.id);
                const busy = busyId === f.id;
                return (
                  <div key={f.id} className="ff-row" data-on={on}>
                    <div className="ff-info">
                      <div className="ff-name">{f.name}</div>
                      <div className="ff-desc">{f.description}</div>
                      {f.caution ? (
                        <div className="ff-caution">⚠ {f.caution}</div>
                      ) : null}
                      <div className="ff-meta">
                        id: <code>{f.id}</code>
                        {states[f.id]?.lastChangedBy
                          ? ` · last changed by ${states[f.id]?.lastChangedBy}`
                          : ""}
                      </div>
                    </div>

                    <button
                      className="ff-switch"
                      onClick={() => void handleToggle(f)}
                      disabled={busy || loadingStates}
                      aria-pressed={on}
                      aria-label={`${on ? "Disable" : "Enable"} ${f.name}`}
                      title={on ? "Click to disable" : "Click to enable"}
                    >
                      <span className="ff-track"><span className="ff-knob" /></span>
                      <span className="ff-label">
                        {busy ? "…" : on ? "ENABLED" : "DISABLED"}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="ff-foot">
        This list is defined in the AI Hub at <code>src/lib/featureCatalogue.ts</code>.
        Add a feature there — each <code>id</code> must match the
        <code> FEATURE_ID</code> in its AI service route, or the switch will
        control nothing.
      </p>
    </div>
  );
}

const css = `
.ff-back { font-size:13px; color:#1d4ed8; text-decoration:none; font-weight:700; }
.ff-head { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; margin-bottom:24px; flex-wrap:wrap; }
.ff-head h1 { font-size:24px; font-weight:900; color:#0f172a; margin:0; letter-spacing:-.4px; }
.ff-head p { font-size:13px; color:#64748b; margin:5px 0 0; max-width:520px; }
.ff-count { font-size:12px; font-weight:800; color:#475569; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:999px; padding:7px 14px; white-space:nowrap; }
.ff-err { padding:12px 14px; border-radius:10px; background:#fee2e2; color:#b91c1c; font-size:13px; font-weight:600; margin-bottom:16px; }

.ff-group { margin-bottom:26px; }
.ff-grouphead { display:flex; align-items:center; gap:12px; margin-bottom:11px; }
.ff-grouphead span { font-size:10.5px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:1.1px; white-space:nowrap; }
.ff-grouphead i { flex:1; height:1px; background:#e2e8f0; }

.ff-list { display:grid; gap:10px; }
.ff-row { display:flex; align-items:center; justify-content:space-between; gap:18px; background:#fff; border:1px solid #e6ebf2; border-left:4px solid #cbd5e1; border-radius:12px; padding:15px 18px; transition:border-color .2s ease; }
.ff-row[data-on="true"] { border-left-color:#10b981; }
.ff-info { flex:1; min-width:0; }
.ff-name { font-size:14.5px; font-weight:800; color:#0f172a; margin-bottom:4px; }
.ff-desc { font-size:12.5px; color:#475569; line-height:1.55; }
.ff-caution { font-size:11.5px; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:7px; padding:6px 9px; margin-top:7px; line-height:1.5; }
.ff-meta { font-size:11px; color:#94a3b8; margin-top:6px; }
.ff-meta code { background:#f1f5f9; padding:1px 5px; border-radius:4px; }

.ff-switch { display:flex; align-items:center; gap:9px; background:none; border:none; cursor:pointer; padding:4px; flex-shrink:0; }
.ff-switch:disabled { opacity:.55; cursor:default; }
.ff-track { width:42px; height:24px; border-radius:999px; background:#cbd5e1; position:relative; transition:background .18s ease; flex-shrink:0; }
.ff-knob { position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25); transition:transform .18s ease; }
.ff-row[data-on="true"] .ff-track { background:#10b981; }
.ff-row[data-on="true"] .ff-knob { transform:translateX(18px); }
.ff-label { font-size:10.5px; font-weight:800; color:#94a3b8; letter-spacing:.5px; min-width:62px; text-align:left; }
.ff-row[data-on="true"] .ff-label { color:#059669; }

.ff-foot { font-size:11.5px; color:#94a3b8; line-height:1.6; margin-top:26px; border-top:1px solid #e2e8f0; padding-top:14px; }
.ff-foot code { background:#f1f5f9; padding:1px 5px; border-radius:4px; }

@media (max-width:620px){
  .ff-row { flex-direction:column; align-items:flex-start; gap:12px; }
}
`;
