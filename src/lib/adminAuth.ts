"use client";

/**
 * Director auth state for tf360-ai-hub.
 *
 * useDirectorAuth() returns: { user, role, name, isAdmin, isSuperAdmin, loading }
 * The role check is server-side via /v1/admin/me — that route looks up
 * ai_admins/<uid> and returns the role + name + active flag.
 */
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";
import { getMe, type Me } from "./aiAdmin";

export type DirectorAuthState = {
  user: User | null;
  role: "super_admin" | "admin" | null;
  name: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
};

export function useDirectorAuth(): DirectorAuthState {
  const [state, setState] = useState<DirectorAuthState>({
    user: null,
    role: null,
    name: null,
    isAdmin: false,
    isSuperAdmin: false,
    loading: true,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({
          user: null,
          role: null,
          name: null,
          isAdmin: false,
          isSuperAdmin: false,
          loading: false,
        });
        return;
      }
      const res = await getMe();
      if (!res.ok) {
        setState({
          user,
          role: null,
          name: null,
          isAdmin: false,
          isSuperAdmin: false,
          loading: false,
        });
        return;
      }
      const m: Me = res.data;
      setState({
        user,
        role: m.role,
        name: m.name,
        isAdmin: true,
        isSuperAdmin: m.role === "super_admin",
        loading: false,
      });
    });
    return () => unsub();
  }, []);

  return state;
}
