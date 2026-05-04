"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDirectorAuth } from "@/lib/adminAuth";
import { listFeatures, toggleFeature, type AiFeature } from "@/lib/aiAdmin";

export default function FeaturesPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useDirectorAuth();

  const [features, setFeatures] = useState<AiFeature[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadingFeatures(true);
    setError("");
    const res = await listFeatures();
    if (!res.ok) {
      setError(res.message);
      setFeatures([]);
    } else {
      setFeatures(res.data.features || []);
    }
    setLoadingFeatures(false);
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

  async function handleToggle(feat: AiFeature) {
    setBusyId(feat.id);
    setError("");
    const res = await toggleFeature(feat.id, !feat.enabled);
    if (!res.ok) {
      setError(res.message);
    } else {
      setFeatures((prev) =>
        prev.map((f) => (f.id === feat.id ? res.data.feature : f))
      );
    }
    setBusyId(null);
  }

  if (loading || !user || !isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "#1d4ed8",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          ← Back to dashboard
        </Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: "#0f172a",
            marginBottom: 4,
          }}
        >
          AI Features
        </div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          Toggle any module on or off. Changes take effect within ~30 seconds
          across all tf360 apps.
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      ) : null}

      {loadingFeatures ? (
        <div style={{ color: "#64748b", padding: 20 }}>Loading features…</div>
      ) : features.length === 0 ? (
        <div
          style={{
            padding: 32,
            background: "#fff",
            borderRadius: 12,
            border: "1px dashed #cbd5e1",
            textAlign: "center",
            color: "#64748b",
          }}
        >
          No features configured yet.
          <br />
          <span style={{ fontSize: 12 }}>
            They appear here automatically as you ship new AI modules.
          </span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {features.map((f) => {
            const isBusy = busyId === f.id;
            return (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#fff",
                  borderRadius: 12,
                  padding: "16px 20px",
                  borderLeft: `4px solid ${
                    f.enabled ? "#10b981" : "#94a3b8"
                  }`,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                  gap: 16,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 900,
                      color: "#0f172a",
                      marginBottom: 4,
                    }}
                  >
                    {f.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#475569" }}>
                    {f.description}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      marginTop: 4,
                    }}
                  >
                    id: <code>{f.id}</code>
                    {f.providerOverride
                      ? ` · provider: ${f.providerOverride}`
                      : ""}
                  </div>
                </div>

                <button
                  onClick={() => void handleToggle(f)}
                  disabled={isBusy}
                  style={{
                    minWidth: 110,
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: "none",
                    background: f.enabled ? "#10b981" : "#cbd5e1",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: isBusy ? "default" : "pointer",
                    opacity: isBusy ? 0.6 : 1,
                  }}
                >
                  {isBusy ? "…" : f.enabled ? "● ENABLED" : "○ DISABLED"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
