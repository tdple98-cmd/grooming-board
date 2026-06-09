import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

function hashAuthType() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  return new URLSearchParams(hash).get("type");
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(() => {
    const t = hashAuthType();
    return t === "invite" || t === "recovery";
  });

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

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) loadProfile(s.user.id);
      else setProfile(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) loadProfile(s.user.id);
      else setProfile(null);
      if (event === "PASSWORD_RECOVERY" || hashAuthType() === "invite") {
        setNeedsPassword(true);
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
    setNeedsPassword(false);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
    setNeedsPassword(false);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, needsPassword, signIn, setPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
