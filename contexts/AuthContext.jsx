import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  captureAuthIntentFromUrl,
  clearAuthIntent,
  getAuthIntent,
  requiresPasswordSetup,
} from "../lib/authIntent";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const initialIntent = captureAuthIntentFromUrl();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(requiresPasswordSetup(initialIntent));
  const [authIntent, setAuthIntent] = useState(initialIntent);

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
      const intent = getAuthIntent();
      if (requiresPasswordSetup(intent)) {
        setNeedsPassword(true);
        setAuthIntent(intent);
      }

      let s = await resolveSession();

      // Hash session may land slightly after the first getSession().
      if (requiresPasswordSetup(intent) && !s) {
        await new Promise((r) => setTimeout(r, 300));
        s = await resolveSession();
      }

      if (mounted) setLoading(false);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;

      setSession(s);
      if (s?.user) loadProfile(s.user.id);
      else setProfile(null);

      const intent = getAuthIntent();
      if (
        event === "PASSWORD_RECOVERY" ||
        (requiresPasswordSetup(intent) && (event === "INITIAL_SESSION" || event === "SIGNED_IN"))
      ) {
        setNeedsPassword(true);
        setAuthIntent(intent);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
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
    clearAuthIntent();
    setNeedsPassword(false);
    setAuthIntent(null);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    clearAuthIntent();
    setProfile(null);
    setNeedsPassword(false);
    setAuthIntent(null);
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
