import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

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

export default function SetPassword() {
  const { setPassword, authIntent } = useAuth();
  const [password, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRecovery = authIntent === "recovery";
  const title = isRecovery ? "Reset your password" : "Set your password";
  const subtitle = isRecovery
    ? "Choose a new password for your staff account."
    : "Choose a password to finish setting up your staff account.";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await setPassword(password);
    } catch (err) {
      setError(err.message || "Could not save password. Try the email link again.");
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
          {isRecovery ? "Password reset" : "Welcome"}
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600, marginTop: 4 }}>
          {title}
        </div>
        <p style={{ fontSize: 13, color: "rgba(244,239,231,0.7)", marginTop: 8, lineHeight: 1.45 }}>
          {subtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          {isRecovery ? "New password" : "Password"}
        </label>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPass(e.target.value)}
          placeholder="At least 8 characters"
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

        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Confirm password</label>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat password"
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
          {submitting ? "Saving…" : "Save password & continue"}
        </button>
      </form>
    </div>
  );
}
