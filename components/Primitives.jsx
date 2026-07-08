import React from "react";

export function Pill({ text, warn, colors: C }) {
  const col = warn ? C.amber : C.green;
  return <span style={{ background: col + "14", color: col, border: "1px solid " + col + "33", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 600 }}>{text}</span>;
}

export function SectionLabel({ children, style, colors: C }) {
  return <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, color: C.goldDeep, marginBottom: 8, ...style }}>{children}</div>;
}

export function Hint({ children }) {
  return <p style={{ fontSize: 13, color: "#9A9087", margin: "0 0 14px", lineHeight: 1.45 }}>{children}</p>;
}

export function Quote({ children, colors: C }) {
  return <div style={{ background: C.paper, border: "1px solid " + C.line, borderRadius: 13, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.45, fontStyle: "italic" }}>"{children}"</div>;
}

export function ChipRow({ items, selected, onPick, colors: C }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {items.map((it) => {
        const active = selected === it;
        return <button key={it} onClick={() => onPick(it)} style={{ background: active ? C.gold : C.paper, color: active ? "#fff" : C.ink, border: "1px solid " + (active ? C.gold : C.line), borderRadius: 999, padding: "9px 15px", fontSize: 13.5, fontWeight: active ? 700 : 500 }}>{active ? "✓ " : ""}{it}</button>;
      })}
    </div>
  );
}

export function Sheet({ children, onClose, colors: C }) {
  const [dragY, setDragY] = React.useState(0);
  const startY = React.useRef(null);

  const onStart = (y) => { startY.current = y; };
  const onMove = (y) => {
    if (startY.current == null) return;
    const dy = y - startY.current;
    if (dy > 0) setDragY(dy);
  };
  const onEnd = () => {
    if (dragY > 110) onClose();
    else setDragY(0);
    startY.current = null;
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(42,36,32,0.5)", zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.cream, width: "100%", maxWidth: 460, borderRadius: "24px 24px 0 0", maxHeight: "94vh", overflowY: "auto", padding: "8px 20px 28px", transform: `translateY(${dragY}px)`, transition: startY.current == null ? "transform .25s cubic-bezier(.2,.8,.2,1)" : "none" }}
      >
        <div
          onTouchStart={(e) => onStart(e.touches[0].clientY)}
          onTouchMove={(e) => onMove(e.touches[0].clientY)}
          onTouchEnd={onEnd}
          onMouseDown={(e) => onStart(e.clientY)}
          onMouseMove={(e) => startY.current != null && onMove(e.clientY)}
          onMouseUp={onEnd}
          onMouseLeave={() => startY.current != null && onEnd()}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: "8px 0 12px", cursor: "grab", touchAction: "none" }}
        >
          <div style={{ width: 44, height: 5, background: C.line, borderRadius: 4 }} />
          <div style={{ fontSize: 11, color: C.slate, marginTop: 6 }}>Swipe down to close</div>
        </div>
        {children}
      </div>
    </div>
  );
}
