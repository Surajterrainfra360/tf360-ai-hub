"use client";

/**
 * Client for the AI service's `/v1/admin/*` endpoints.
 *
 * Authenticated calls carry a Firebase ID token; the AI service
 * independently verifies the user is an active admin.
 *
 * Public endpoints (no auth): setup-status, bootstrap.
 */
import { auth } from "./firebase";

const AI_BASE =
  process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:8080";

export type AIResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; code?: string };

async function request<TBody, TRes>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: TBody,
  options: { auth?: boolean } = { auth: true }
): Promise<AIResult<TRes>> {
  const useAuth = options.auth !== false;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (useAuth) {
    const u = auth.currentUser;
    if (!u) return { ok: false, status: 401, message: "Not signed in." };
    try {
      const token = await u.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    } catch {
      return { ok: false, status: 401, message: "Token refresh failed." };
    }
  }

  try {
    const res = await fetch(`${AI_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = `Request failed (${res.status}).`;
      let code: string | undefined;
      try {
        const j = await res.json();
        message = j?.detail?.message || j?.message || message;
        code = j?.detail?.code || j?.code;
      } catch {
        /* ignore */
      }
      return { ok: false, status: res.status, message, code };
    }
    const data = (await res.json()) as TRes;
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: (e as { message?: string })?.message || "Network error.",
    };
  }
}

/* ============ Public ============ */

export type SetupStatus = { count: number; needsSetup: boolean };

export function getSetupStatus() {
  return request<undefined, SetupStatus>(
    "/v1/admin/setup-status",
    "GET",
    undefined,
    { auth: false }
  );
}

export type BootstrapInput = { name: string; email: string; password: string };

export function bootstrap(input: BootstrapInput) {
  return request<BootstrapInput, { ok: true; uid: string; email: string }>(
    "/v1/admin/bootstrap",
    "POST",
    input,
    { auth: false }
  );
}

/* ============ Authenticated ============ */

export type Me = {
  uid: string;
  email: string;
  name: string;
  role: "super_admin" | "admin";
  active: boolean;
  createdAt?: number;
};

export function getMe() {
  return request<undefined, Me>("/v1/admin/me", "GET");
}

/* ============ Features ============ */

export type AiFeature = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  providerOverride?: string | null;
};

export function listFeatures() {
  return request<undefined, { features: AiFeature[] }>(
    "/v1/admin/features",
    "GET"
  );
}

export function toggleFeature(featureId: string, enabled: boolean) {
  return request<{ enabled: boolean }, { ok: true; feature: AiFeature }>(
    `/v1/admin/features/${encodeURIComponent(featureId)}/toggle`,
    "POST",
    { enabled }
  );
}

/* ============ Admins (super-admin only) ============ */

export type AdminRow = {
  uid: string;
  email: string;
  name: string;
  role: "super_admin" | "admin";
  active: boolean;
  createdAt?: number;
  createdByEmail?: string;
};

export function listAdmins() {
  return request<undefined, { admins: AdminRow[] }>(
    "/v1/admin/admins",
    "GET"
  );
}

export type InviteInput = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "super_admin";
};

export function inviteAdmin(input: InviteInput) {
  return request<InviteInput, { ok: true; uid: string; email: string }>(
    "/v1/admin/admins",
    "POST",
    input
  );
}

export function deactivateAdmin(uid: string) {
  return request<undefined, { ok: true }>(
    `/v1/admin/admins/${encodeURIComponent(uid)}`,
    "DELETE"
  );
}

export function changeAdminRole(uid: string, role: "admin" | "super_admin") {
  return request<{ role: string }, { ok: true }>(
    `/v1/admin/admins/${encodeURIComponent(uid)}/role`,
    "POST",
    { role }
  );
}
