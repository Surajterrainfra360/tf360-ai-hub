"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bootstrap, getSetupStatus } from "@/lib/aiAdmin";

export default function SetupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);

  // First check: if setup is already done, redirect to /login
  useEffect(() => {
    (async () => {
      const res = await getSetupStatus();
      if (res.ok && !res.data.needsSetup) {
        setAlreadyConfigured(true);
      }
      setChecking(false);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    const res = await bootstrap({ name: name.trim(), email: email.trim(), password });
    setBusy(false);

    if (!res.ok) {
      setError(res.message);
      if (res.code === "ALREADY_CONFIGURED") setAlreadyConfigured(true);
      return;
    }
    setSuccess(true);
    // Give a short pause so the user sees the success state, then go to login
    setTimeout(() => router.replace("/login"), 1800);
  }

  if (checking) {
    return (
      <div style={fullPageCentered}>
        <div style={{ color: "#64748b" }}>Checking setup status…</div>
      </div>
    );
  }

  if (alreadyConfigured) {
    return (
      <div style={fullPageCentered}>
        <div style={lockedCard}>
          <div style={{ fontSize: 48 }}>✅</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#047857", margin: "8px 0 6px" }}>
            Already configured
          </h1>
          <p style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
            The Hub has already been set up by a Super Admin. There can only be one bootstrap.
          </p>
          <button onClick={() => router.replace("/login")} style={primaryBtn}>
            Go to login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={fullPageCentered}>
        <div style={successCard}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#047857", margin: "10px 0 6px" }}>
            Super Admin created
          </h1>
          <p style={{ fontSize: 13, color: "#475569" }}>
            Redirecting to login…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <form onSubmit={handleSubmit} style={card}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 44 }}>🔐</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#1d4ed8", marginTop: 6 }}>
            Set up your tf360 AI Hub
          </h1>
          <p style={{ fontSize: 12.5, color: "#64748b", marginTop: 4, lineHeight: 1.5 }}>
            First-time setup. The account you create here becomes the
            <b> Super Admin</b>. You can invite other admins from inside the Hub.
            <br />
            <i>This page locks itself after the first run.</i>
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Your name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Suraj Govindaraju"
              disabled={busy}
              style={input}
            />
          </Field>
          <Field label="Email (used to log in)">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="suraj@terrainfra360.com"
              disabled={busy}
              style={input}
            />
          </Field>
          <Field label="Password (min 8 chars)">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              style={input}
            />
          </Field>
          <Field label="Confirm password">
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
        </div>

        {error && (
          <div style={errorBox}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} style={{
          ...primaryBtn,
          width: "100%",
          marginTop: 16,
          background: busy ? "#94a3b8" : "#1d4ed8",
        }}>
          {busy ? "Creating Super Admin…" : "Create Super Admin"}
        </button>

        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, textAlign: "center" }}>
          ⚠ Only run this once. After creation, this page is locked.
        </p>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #6d28d9 100%)",
};
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 540,
  background: "#fff",
  borderRadius: 16,
  padding: 28,
  boxShadow: "0 20px 50px rgba(0,0,0,0.30)",
};
const fullPageCentered: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  padding: 24,
};
const lockedCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  maxWidth: 460,
  textAlign: "center",
  borderTop: "6px solid #047857",
  boxShadow: "0 12px 30px rgba(0,0,0,0.15)",
};
const successCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  maxWidth: 460,
  textAlign: "center",
  borderTop: "6px solid #10b981",
  boxShadow: "0 12px 30px rgba(0,0,0,0.15)",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
const primaryBtn: React.CSSProperties = {
  padding: "11px 22px",
  borderRadius: 10,
  border: "none",
  background: "#1d4ed8",
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: 10,
  borderRadius: 8,
  background: "#fee2e2",
  color: "#b91c1c",
  fontSize: 13,
  fontWeight: 600,
};
