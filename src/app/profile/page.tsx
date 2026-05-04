"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useDirectorAuth } from "@/lib/adminAuth";

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAdmin, role, name, loading } = useDirectorAuth();

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!isAdmin) {
      router.replace("/access-denied");
    }
  }, [user, isAdmin, loading, router]);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!user || !user.email) return;

    if (newPwd.length < 8) {
      setMsg({ kind: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPwd !== confirm) {
      setMsg({ kind: "error", text: "New passwords do not match." });
      return;
    }
    if (newPwd === currentPwd) {
      setMsg({ kind: "error", text: "New password must differ from the current one." });
      return;
    }

    setBusy(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPwd);
      setMsg({ kind: "success", text: "Password updated successfully." });
      setCurrentPwd("");
      setNewPwd("");
      setConfirm("");
    } catch (err: unknown) {
      setMsg({
        kind: "error",
        text:
          (err as { message?: string })?.message ??
          "Could not change password. Check the current password.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || !isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/"
          style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none", fontWeight: 700 }}
        >
          ← Back to dashboard
        </Link>
      </div>

      <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", marginBottom: 4 }}>
        ⚙ My Profile
      </div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        Your account details and password.
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 22,
          marginBottom: 18,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <Row label="Name" value={name || "—"} />
        <Row label="Email" value={user.email || "—"} />
        <Row
          label="Role"
          value={
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 999,
                color: role === "super_admin" ? "#dc2626" : "#1d4ed8",
                background: role === "super_admin" ? "#fee2e2" : "#dbeafe",
              }}
            >
              {role === "super_admin" ? "👑 Super Admin" : "🔒 Admin"}
            </span>
          }
        />
      </div>

      <form
        onSubmit={handleChange}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 22,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>
          Change password
        </div>

        <Field label="Current password">
          <input
            type="password"
            required
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            disabled={busy}
            style={input}
          />
        </Field>
        <Field label="New password (min 8 characters)">
          <input
            type="password"
            required
            minLength={8}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            disabled={busy}
            style={input}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy}
            style={input}
          />
        </Field>

        {msg && (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: msg.kind === "success" ? "#d1fae5" : "#fee2e2",
              color: msg.kind === "success" ? "#047857" : "#b91c1c",
              fontSize: 13,
              fontWeight: 600,
              marginTop: 8,
              marginBottom: 8,
            }}
          >
            {msg.text}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: busy ? "#94a3b8" : "#1d4ed8",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            marginTop: 6,
          }}
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <div style={{ width: 120, fontSize: 12, fontWeight: 700, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 13.5, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
