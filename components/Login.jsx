import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getSupabaseConfigStatus, isSupabaseConfigured } from "../lib/supabase";

const C = {
  cream: "#F4EFE7",
  paper: "#FCFAF6",
  brown: "#2A2420",
  ink: "#3D362F",
  gold: "#B8956A",
  line: "#E7DECF",
  rose: "#C98B7A",
  slate: "#9A9087",
};

export default function Login() {
  const configStatus = getSupabaseConfigStatus();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (!isSupabaseConfigured) {
        throw new Error(
          "App is not connected to Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy."
        );
      }
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = err.message || "";
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
        setError(
          "Cannot reach Supabase. Check: (1) Vercel env vars are set correctly, (2) you redeployed after adding them, (3) Supabase project is not paused in the dashboard."
        );
      } else {
        setError(msg || "Could not sign in. Check your email and password.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: C.cream,
      color: C.ink,
      fontFamily: "Poppins, sans-serif",
      maxWidth: 460,
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      padding: "32px 24px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Poppins:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input { font-family: Poppins, sans-serif; }
        button { font-family: Poppins, sans-serif; cursor: pointer; }
      `}</style>

      <div style={{ background: C.brown, color: C.cream, borderRadius: 20, padding: "28px 24px 32px" }}>
        <div style={{ fontSize: 9.5, letterSpacing: 3, textTransform: "uppercase", color: C.gold, fontWeight: 600 }}>
          The Poodle Specialist
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>
          Grooming Board
        </div>
        <p style={{ fontSize: 13, color: "rgba(244,239,231,0.7)", marginTop: 8, lineHeight: 1.45 }}>
          Staff sign-in only. Ask your manager for an invite if you don&apos;t have an account.
        </p>
      </div>

      {!isSupabaseConfigured && (
        <div style={{
          background: C.rose + "18",
          border: "1px solid " + C.rose + "44",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 13,
          color: C.rose,
          marginTop: 20,
          lineHeight: 1.45,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Supabase not configured in this build</div>
          {configStatus.issues.map((issue) => (
            <div key={issue}>• {issue}</div>
          ))}
          <div style={{ marginTop: 8 }}>
            In Vercel → Environment Variables, enable both vars for <strong>Production and Preview</strong> (Preview deploys ignore Production-only vars). Then Redeploy without build cache.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{
            width: "100%",
            border: "1px solid " + C.line,
            borderRadius: 12,
            padding: "14px 16px",
            fontSize: 15,
            background: C.paper,
            marginBottom: 16,
            outline: "none",
          }}
        />

        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Password</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{
            width: "100%",
            border: "1px solid " + C.line,
            borderRadius: 12,
            padding: "14px 16px",
            fontSize: 15,
            background: C.paper,
            marginBottom: 20,
            outline: "none",
          }}
        />

        {error && (
          <div style={{
            background: C.rose + "18",
            border: "1px solid " + C.rose + "44",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 13,
            color: C.rose,
            marginBottom: 16,
            lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            background: submitting ? C.slate : C.brown,
            color: C.cream,
            border: "none",
            borderRadius: 14,
            padding: "15px",
            fontSize: 15,
            fontWeight: 700,
            opacity: submitting ? 0.8 : 1,
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
