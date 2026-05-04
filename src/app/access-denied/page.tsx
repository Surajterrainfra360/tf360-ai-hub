"use client";

import React from "react";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function AccessDeniedPage() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fef2f2",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 16,
          padding: 40,
          boxShadow: "0 12px 30px rgba(0,0,0,0.15)",
          textAlign: "center",
          borderTop: "6px solid #dc2626",
        }}
      >
        <div style={{ fontSize: 56 }}>🔒</div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: "#dc2626",
            marginTop: 8,
            marginBottom: 12,
          }}
        >
          Access denied
        </h1>
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 24 }}>
          This area is restricted to authorized tf360 directors only. Your account
          is not on the allowlist.
        </p>
        <p
          style={{
            fontSize: 12,
            color: "#94a3b8",
            marginBottom: 28,
            fontStyle: "italic",
          }}
        >
          If you believe this is a mistake, contact Suraj at suraj@terrainfra360.com
          to request access.
        </p>
        <button
          onClick={() => void handleSignOut()}
          style={{
            padding: "10px 22px",
            borderRadius: 10,
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
    </div>
  );
}
