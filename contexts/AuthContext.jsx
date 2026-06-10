import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  clearAuthType,
  getAuthType,
  readAuthTypeFromUrl,
  requiresPasswordSetup,
} from "../lib/authIntent";

const AuthContext = createContext(null);

function syncAuthType(setAuthIntent, setNeedsPassword) {
  const type = getAuthType();
  setAuthIntent(type);
  setNeedsPassword(requiresPasswordSetup(type));
}

export function AuthProvider({ children }) {
  const initialType = getAuthType();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(requiresPasswordSetup(initialType));
  const [authIntent, setAuthIntent] = useState(initialType);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(userId) {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!mounted) return;
      if (error) console.error("Failed to load staff profile:", error.message);
      setProfile(data);
    }

    async function resolveSession() {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!mounted) return s;

      setSession(s);
      if (s?.user) await loadProfile(s.user.id);
      else setProfile(null);
      return s;
    }

    async function init() {
      syncAuthType(setAuthIntent, setNeedsPassword);

      let s = await resolveSession();

      if (requiresPasswordSetup(getAuthType()) && !s) {
        await new Promise((r) => setTimeout(r, 300));
        s = await resolveSession();
      }

      if (mounted) setLoading(false);
    }

    const onUrlChange = () => {
      if (!mounted) return;
      syncAuthType(setAuthIntent, setNeedsPassword);
    };

    init();
    window.addEventListener("hashchange", onUrlChange);
    window.addEventListener("popstate", onUrlChange);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;

      setSession(s);
      if (s?.user) loadProfile(s.user.id);
      else setProfile(null);
      syncAuthType(setAuthIntent, setNeedsPassword);
      setLoading(false);
    });

    return () => {
      mounted = false;
      window.removeEventListener("hashchange", onUrlChange);
      window.removeEventListener("popstate", onUrlChange);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const setPassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    clearAuthType();
    setAuthIntent(null);
    setNeedsPassword(false);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    clearAuthType();
    setProfile(null);
    setAuthIntent(readAuthTypeFromUrl());
    setNeedsPassword(requiresPasswordSetup(readAuthTypeFromUrl()));
  };

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      loading,
      needsPassword,
      authIntent,
      signIn,
      setPassword,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
