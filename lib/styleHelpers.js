export const bigBtn = (color) => ({
  flex: 1,
  background: color,
  color: "#fff",
  border: "none",
  borderRadius: 13,
  padding: "14px",
  fontSize: 14.5,
  fontWeight: 700,
});

// For two-state buttons (active/inactive), pass the color and it'll compute based on C
export const makeTwoBtn = (C) => (active, color) => ({
  flex: 1,
  background: active ? color : C.paper,
  color: active ? "#fff" : C.ink,
  border: "1px solid " + (active ? color : C.line),
  borderRadius: 12,
  padding: "13px",
  fontSize: 14,
  fontWeight: 700,
});

export const menuRowStyle = (C) => ({
  display: "block",
  padding: "14px 16px",
  fontSize: 14,
  fontWeight: 600,
  color: C.ink,
  textDecoration: "none",
  borderBottom: "1px solid " + C.line,
  fontFamily: "Poppins, sans-serif",
});
