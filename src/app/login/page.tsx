"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getMe, getSetupStatus } from "@/lib/aiAdmin";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // If no admin exists yet, redirect to /setup
  useEffect(() => {
    (async () => {
      const res = await getSetupStatus();
      if (res.ok && res.data.needsSetup) {
        router.replace("/setup");
      }
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const me = await getMe();
      if (!me.ok) {
        router.replace("/access-denied");
      } else {
        router.replace("/");
      }
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message ?? "Sign-in failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #6d28d9 100%)",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 20px 50px rgba(0,0,0,0.30)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
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
            Director sign-in
          </div>
        </div>

        <label style={{ display: "block", marginBottom: 14 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#475569",
              marginBottom: 6,
            }}
          >
            Email
          </div>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            placeholder="suraj@terrainfra360.com"
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              fontSize: 14,
              outline: "none",
            }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 18 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#475569",
              marginBottom: 6,
            }}
          >
            Password
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              fontSize: 14,
              outline: "none",
            }}
          />
        </label>

        {error ? (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: busy ? "#94a3b8" : "#1d4ed8",
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div
          style={{
            marginTop: 18,
            fontSize: 11,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          Restricted area. Authorized directors only.
        </div>
      </form>
    </div>
  );
}
