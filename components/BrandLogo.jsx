export const LOGO_SRC = "/tps-board-icon-v3.png";

export function BrandLogo({ maxWidth = 280, style = {} }) {
  return (
    <img
      src={LOGO_SRC}
      alt="The Poodle Specialist"
      style={{
        width: "100%",
        maxWidth,
        height: "auto",
        display: "block",
        margin: "0 auto",
        borderRadius: "22%",
        boxShadow: "0 6px 24px rgba(42,36,32,0.10)",
        ...style,
      }}
    />
  );
}

export function AppLoadingScreen({ message = "Loading board…" }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F4EFE7",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        fontFamily: "Poppins, sans-serif",
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes brandload { 0%, 100% { opacity: 0.45 } 50% { opacity: 1 } }
        .brandload-msg { animation: brandload 1.6s ease-in-out infinite; }
      `}</style>
      <BrandLogo maxWidth={260} style={{ marginBottom: 28 }} />
      <div className="brandload-msg" style={{ fontSize: 14, color: "#9A9087", fontWeight: 500 }}>
        {message}
      </div>
    </div>
  );
}
