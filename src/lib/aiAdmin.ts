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

export { AI_BASE };

/**
 * Every call gets a deadline.
 *
 * Without one, an AI service that accepts the TCP connection but never
 * answers — a hung Firestore read, a half-started uvicorn — leaves fetch
 * pending forever, and the Hub sits on "Loading…" with no way out. A
 * timeout turns that into an honest error the user can act on.
 *
 * Analytics aggregations can genuinely take a while on live data, so the
 * budget is generous rather than tight.
 */
const DEFAULT_TIMEOUT_MS = 45_000;
const FAST_TIMEOUT_MS = 12_000; // page-load gates: setup-status, me

function timeoutFor(path: string): number {
  return path.includes("/admin/setup-status") || path.includes("/admin/me")
    ? FAST_TIMEOUT_MS
    : DEFAULT_TIMEOUT_MS;
}

export async function request<TBody, TRes>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: TBody,
  options: { auth?: boolean; timeoutMs?: number } = { auth: true }
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

  const limit = options.timeoutMs ?? timeoutFor(path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limit);

  try {
    const res = await fetch(`${AI_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
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
    const err = e as { name?: string; message?: string };
    if (err?.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        code: "TIMEOUT",
        message:
          `The AI service didn't respond within ${Math.round(limit / 1000)}s. ` +
          `Is it running at ${AI_BASE}? Start it with: ` +
          `uvicorn app.main:app --reload --port 8080`,
      };
    }
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message:
        `Can't reach the AI service at ${AI_BASE}. ` +
        (err?.message || "Network error."),
    };
  } finally {
    clearTimeout(timer);
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

/** On/off state of one feature, keyed by id in the `states` map. */
export type FeatureState = {
  enabled: boolean;
  providerOverride?: string | null;
  lastChangedBy?: string | null;
  lastChangedAt?: number | null;
};

/**
 * Fetch on/off STATE only.
 *
 * The names and descriptions come from src/lib/featureCatalogue.ts in this
 * repo — the service no longer decides what appears on the Features page.
 * `states` covers every ai_features doc, so a feature listed only here still
 * gets its real state. Anything with no doc yet is enabled by default.
 */
export function listFeatures() {
  return request<
    undefined,
    { features: AiFeature[]; states?: Record<string, FeatureState> }
  >("/v1/admin/features", "GET");
}

export function toggleFeature(featureId: string, enabled: boolean) {
  return request<
    { enabled: boolean },
    { ok: true; feature: { id: string; enabled: boolean; providerOverride?: string | null } }
  >(
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
