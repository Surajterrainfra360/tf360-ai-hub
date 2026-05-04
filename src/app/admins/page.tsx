"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDirectorAuth } from "@/lib/adminAuth";
import {
  listAdmins,
  inviteAdmin,
  deactivateAdmin,
  changeAdminRole,
  type AdminRow,
} from "@/lib/aiAdmin";

export default function AdminsPage() {
  const router = useRouter();
  const { user, isAdmin, isSuperAdmin, loading } = useDirectorAuth();

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  const reload = useCallback(async () => {
    setLoadingList(true);
    setError("");
    const res = await listAdmins();
    if (!res.ok) {
      setError(res.message);
      setAdmins([]);
    } else {
      setAdmins(res.data.admins || []);
    }
    setLoadingList(false);
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
    if (!isSuperAdmin) {
      router.replace("/");
      return;
    }
    void reload();
  }, [user, isAdmin, isSuperAdmin, loading, router, reload]);

  if (loading || !user || !isSuperAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/"
          style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none", fontWeight: 700 }}
        >
          ← Back to dashboard
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>
            👑 Manage Admins
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Super-admin only. Invite directors, change roles, or deactivate accounts.
          </div>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#1d4ed8",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          + Invite new admin
        </button>
      </div>

      {error && (
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
      )}

      {loadingList ? (
        <div style={{ color: "#64748b", padding: 20 }}>Loading admins…</div>
      ) : admins.length === 0 ? (
        <div style={{ color: "#64748b", padding: 20 }}>No admins yet.</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <AdminRowView
                  key={a.uid}
                  row={a}
                  isSelf={a.uid === user.uid}
                  onChange={reload}
                  setError={setError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={() => {
            setShowInvite(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function AdminRowView({
  row,
  isSelf,
  onChange,
  setError,
}: {
  row: AdminRow;
  isSelf: boolean;
  onChange: () => void;
  setError: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function promote() {
    setBusy(true);
    const res = await changeAdminRole(row.uid, "super_admin");
    setBusy(false);
    if (!res.ok) setError(res.message);
    else onChange();
  }
  async function demote() {
    if (isSelf) {
      setError("You cannot demote yourself.");
      return;
    }
    setBusy(true);
    const res = await changeAdminRole(row.uid, "admin");
    setBusy(false);
    if (!res.ok) setError(res.message);
    else onChange();
  }
  async function remove() {
    if (isSelf) return;
    if (!window.confirm(`Remove ${row.name || row.email}? They will lose access immediately.`)) return;
    setBusy(true);
    const res = await deactivateAdmin(row.uid);
    setBusy(false);
    if (!res.ok) setError(res.message);
    else onChange();
  }

  const roleColor = row.role === "super_admin" ? "#dc2626" : "#1d4ed8";
  const roleLabel = row.role === "super_admin" ? "👑 Super Admin" : "🔒 Admin";

  return (
    <tr style={{ borderTop: "1px solid #f1f5f9" }}>
      <td style={td}>
        <b>{row.name || "—"}</b>
        {isSelf && (
          <span style={{ fontSize: 10, color: "#64748b", marginLeft: 8, fontWeight: 700 }}>
            (you)
          </span>
        )}
      </td>
      <td style={{ ...td, color: "#475569" }}>{row.email}</td>
      <td style={td}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: roleColor,
            background: row.role === "super_admin" ? "#fee2e2" : "#dbeafe",
            padding: "3px 10px",
            borderRadius: 999,
          }}
        >
          {roleLabel}
        </span>
      </td>
      <td style={td}>
        {row.active ? (
          <span style={{ fontSize: 12, color: "#047857", fontWeight: 700 }}>● Active</span>
        ) : (
          <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>○ Inactive</span>
        )}
      </td>
      <td style={td}>
        <div style={{ display: "flex", gap: 6 }}>
          {row.role === "admin" && (
            <button onClick={() => void promote()} disabled={busy} style={btnSmall}>
              ↑ Promote
            </button>
          )}
          {row.role === "super_admin" && !isSelf && (
            <button onClick={() => void demote()} disabled={busy} style={btnSmall}>
              ↓ Demote
            </button>
          )}
          {!isSelf && row.active && (
            <button
              onClick={() => void remove()}
              disabled={busy}
              style={{ ...btnSmall, color: "#dc2626", borderColor: "#fecaca" }}
            >
              × Remove
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const res = await inviteAdmin({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onCreated();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={handle}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth: 460,
          boxShadow: "0 20px 50px rgba(0,0,0,0.30)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, color: "#1d4ed8", marginBottom: 4 }}>
          Invite a new admin
        </div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16, lineHeight: 1.5 }}>
          You set a temporary password and share it with the invitee. They'll change it after first login.
        </div>

        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} style={input} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            style={input}
          />
        </Field>
        <Field label="Temporary password (min 8 chars)">
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            style={input}
          />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "super_admin")} style={input}>
            <option value="admin">🔒 Admin (regular)</option>
            <option value="super_admin">👑 Super Admin (can manage other admins)</option>
          </select>
        </Field>

        {error && (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: 13,
              fontWeight: 600,
              marginTop: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ ...btnSmall, padding: "10px 16px" }}>
            Cancel
          </button>
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
            }}
          >
            {busy ? "Creating…" : "Create admin"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

const th: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  letterSpacing: 0.3,
  textTransform: "uppercase",
};
const td: React.CSSProperties = { padding: "14px", fontSize: 13.5, color: "#0f172a" };
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
const btnSmall: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
};
