import React, { useState, useRef } from "react";

export function PresetEditor({ label, accent, chips, onAdd, onRemove, colors }) {
  const C = colors;
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        {accent && (
          <span style={{ width: 9, height: 9, borderRadius: 3, background: accent }} />
        )}
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>
        {chips.map((c) => (
          <span
            key={c}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: C.paper,
              border: "1px solid " + C.line,
              borderRadius: 999,
              padding: "6px 7px 6px 13px",
              fontSize: 12.5,
            }}
          >
            {c}
            <button
              type="button"
              onClick={() => onRemove(c)}
              style={{
                background: C.line,
                border: "none",
                borderRadius: 999,
                width: 19,
                height: 19,
                fontSize: 13,
                color: C.brown,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Add a chip…"
          style={{
            flex: 1,
            border: "1px solid " + C.line,
            borderRadius: 12,
            padding: "10px 13px",
            fontSize: 14,
            background: "#fff",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={submit}
          style={{
            background: accent || C.gold,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "0 20px",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
