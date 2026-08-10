"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useDirectorAuth } from "@/lib/adminAuth";
import { getSetupStatus } from "@/lib/aiAdmin";

export default function HomePage() {
  const router = useRouter();
  const { user, isAdmin, isSuperAdmin, role, name, loading } = useDirectorAuth();
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await getSetupStatus();
      if (res.ok && res.data.needsSetup) {
        router.replace("/setup");
        return;
      }
      setCheckingSetup(false);
    })();
  }, [router]);

  useEffect(() => {
    if (loading || checkingSetup) return;
    if (!user) {
      router.replace("/login");
    } else if (!isAdmin) {
      router.replace("/access-denied");
    }
  }, [user, isAdmin, loading, checkingSetup, router]);

  if (loading || checkingSetup || !user || !isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Loading…
      </div>
    );
  }

  const tiles: Array<{
    title: string;
    desc: string;
    href: string;
    color: string;
    enabled: boolean;
    superAdminOnly?: boolean;
  }> = [
    {
      title: "Features",
      desc: "Toggle each AI module on or off in real time.",
      href: "/features",
      color: "#1d4ed8",
      enabled: true,
    },
    {
      title: "📊 Analytics",
      desc: "Ask plain-English questions of your data.",
      href: "/analytics",
      color: "#0891b2",
      enabled: true,
    },
    {
      title: "👑 Manage Admins",
      desc: "Invite, remove, or change roles of admins.",
      href: "/admins",
      color: "#dc2626",
      enabled: true,
      superAdminOnly: true,
    },
    {
      title: "⚙ My Profile",
      desc: "Change your password and view your role.",
      href: "/profile",
      color: "#0891b2",
      enabled: true,
    },
    {
      title: "Connections",
      desc: "Manage Gemini & Ollama provider configuration.",
      href: "/connections",
      color: "#0891b2",
      enabled: false,
    },
    {
      title: "Live Logs",
      desc: "Stream every AI call as it happens.",
      href: "/logs",
      color: "#8b5cf6",
      enabled: false,
    },
    {
      title: "Usage & Cost",
      desc: "Charts of calls per module, per vendor, per day.",
      href: "/usage",
      color: "#f59e0b",
      enabled: false,
    },
    {
      title: "Prompts",
      desc: "Edit AI instructions with version history.",
      href: "/prompts",
      color: "#10b981",
      enabled: false,
    },
    {
      title: "Provisional Taxonomy",
      desc: "Review macro/category/product-type entries created by AI.",
      href: "/provisional-taxonomy",
      color: "#ec4899",
      enabled: false,
    },
    {
      title: "Add new module",
      desc: "Define a new AI capability without writing code.",
      href: "/new-module",
      color: "#d97706",
      enabled: false,
    },
  ].filter((t) => !t.superAdminOnly || isSuperAdmin);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#1d4ed8",
              letterSpacing: -0.5,
            }}
          >
            tf360 AI Hub
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Signed in as <b>{name || user.email}</b>
            {role === "super_admin" && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#fff",
                  background: "#dc2626",
                  padding: "2px 8px",
                  borderRadius: 6,
                  letterSpacing: 0.5,
                }}
              >
                SUPER ADMIN
              </span>
            )}
            {role === "admin" && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#fff",
                  background: "#1d4ed8",
                  padding: "2px 8px",
                  borderRadius: 6,
                  letterSpacing: 0.5,
                }}
              >
                ADMIN
              </span>
            )}
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut(auth);
            router.replace("/login");
          }}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#475569",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>

      {/* Welcome card */}
      <div
        style={{
          background:
            "linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%)",
          color: "#fff",
          borderRadius: 14,
          padding: 24,
          marginBottom: 28,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>
          Welcome, Director.
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
          From here you control every AI feature in tf360 — what's enabled,
          which provider powers it, what prompts it uses, and what it has
          done. Employees never see this surface.
        </div>
      </div>

      {/* Tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {tiles.map((t) => {
          const card = (
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 18,
                borderLeft: `4px solid ${t.color}`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                cursor: t.enabled ? "pointer" : "default",
                opacity: t.enabled ? 1 : 0.55,
                transition: "transform 0.1s, box-shadow 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!t.enabled) return;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.10)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color: t.color,
                  marginBottom: 6,
                }}
              >
                {t.title}
                {!t.enabled && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#94a3b8",
                      background: "#f1f5f9",
                      padding: "2px 8px",
                      borderRadius: 6,
                      marginLeft: 8,
                      verticalAlign: "middle",
                    }}
                  >
                    soon
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.45 }}>
                {t.desc}
              </div>
            </div>
          );
          return t.enabled ? (
            <Link
              key={t.title}
              href={t.href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              {card}
            </Link>
          ) : (
            <div key={t.title}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
