import React, { useEffect, useRef, useState } from "react";
import {
  addChipToList,
  chipIsSelected,
  joinChips,
  parseChips,
  toggleChipInList,
} from "../lib/chipValue.js";

// Chip-only field: tap presets to select, add custom via input, selected chips shown below.
export function EditField({
  label,
  value,
  onChange,
  placeholder,
  accent,
  presets,
  editKey,
  onEditStart,
  onEditEnd,
  colors,
}) {
  const C = colors;
  const accentColor = accent || C.gold;
  const [selected, setSelected] = useState(() => parseChips(value));
  const [customDraft, setCustomDraft] = useState("");
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const parsed = parseChips(value);
    if (joinChips(selectedRef.current) !== joinChips(parsed)) {
      setSelected(parsed);
    }
  }, [value]);

  const commit = (next) => {
    setSelected(next);
    onChange(joinChips(next));
  };

  const withEditGuard = (fn) => {
    onEditStart?.(editKey);
    fn();
    onEditEnd?.(editKey);
  };

  const toggle = (chip) => {
    withEditGuard(() => commit(toggleChipInList(selected, chip)));
  };

  const addCustom = () => {
    const v = customDraft.trim();
    if (!v) return;
    withEditGuard(() => {
      commit(addChipToList(selected, v));
      setCustomDraft("");
    });
  };

  const availablePresets = (presets || []).filter((p) => !chipIsSelected(selected, p));

  const chipBtn = (chip, { active, onClick }) => (
    <button
      key={chip}
      type="button"
      onClick={onClick}
      style={{
        background: active ? accentColor : C.paper,
        color: active ? "#fff" : C.ink,
        border: "1px solid " + (active ? accentColor : C.line),
        borderRadius: 999,
        padding: "8px 14px",
        fontSize: 12.5,
        fontWeight: active ? 700 : 500,
      }}
    >
      {active ? "✓ " : ""}
      {chip}
    </button>
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        {accent && (
          <span style={{ width: 9, height: 9, borderRadius: 3, background: accent }} />
        )}
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      </div>

      {availablePresets.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
          {availablePresets.map((chip) =>
            chipBtn(chip, { active: false, onClick: () => toggle(chip) })
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: selected.length ? 12 : 0 }}>
        <input
          value={customDraft}
          onChange={(e) => setCustomDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          placeholder={placeholder || "Add a chip…"}
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
          onClick={addCustom}
          disabled={!customDraft.trim()}
          style={{
            background: customDraft.trim() ? accentColor : C.line,
            color: customDraft.trim() ? "#fff" : C.slate,
            border: "none",
            borderRadius: 12,
            padding: "0 18px",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Add
        </button>
      </div>

      {selected.length > 0 && (
        <div
          style={{
            background: C.paper,
            border: "1px solid " + C.line,
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 700,
              color: C.slate,
              marginBottom: 8,
            }}
          >
            Selected · tap to remove
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {selected.map((chip) =>
              chipBtn(chip, { active: true, onClick: () => toggle(chip) })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
