/**
 * RatingInput.jsx — Inline click-to-edit user rating widget
 *
 * Displays the current rating as "★ N" and switches to a text input on
 * click. Accepts values in the 0–10 range (one decimal place). Commits on
 * blur or Enter; cancels on Escape.
 *
 * Used in: GameCard (inline rating), MetadataModal rating row.
 */

import { useState, useRef, useEffect } from "react";

/**
 * Click-to-edit rating widget supporting values from 0 to 10.
 * Shows a "+ Rate" placeholder when no rating has been set.
 *
 * @param {Object} props
 * @param {number|null} props.value - Current rating, or null if unrated.
 * @param {function(number|null): void} props.onChange - Called with the new value (or null to clear).
 * @param {number} [props.size=11] - Base font size for the display text (px).
 * @param {string} [props.starColor="#e6a63a"] - Color of the ★ glyph.
 * @param {string} [props.textColor="#e6a63a"] - Color of the numeric rating text.
 * @returns {JSX.Element}
 */
export function RatingInput({ value, onChange, size = 11, starColor = "#e6a63a", textColor = "#e6a63a" }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput]     = useState("");
  const ref = useRef();

  // Auto-focus the text field when entering edit mode
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  /** Validate and commit the typed value, then return to display mode. */
  const commit = () => {
    const v = parseFloat(input);
    // Round to one decimal, clamp to 0–10; clear if invalid
    onChange(!isNaN(v) ? Math.min(10, Math.max(0, Math.round(v * 10) / 10)) : null);
    setEditing(false);
  };

  if (editing) return (
    <input ref={ref} value={input} onChange={e => setInput(e.target.value)}
      onClick={e => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      placeholder="0–10"
      style={{ width: 52, background: "#080814", border: "1px solid #7c6ef7", borderRadius: 4, color: "#e0e0f0", fontSize: 12, padding: "2px 5px", outline: "none", fontFamily: "inherit" }} />
  );

  return value != null
    ? <span onClick={e => { e.stopPropagation(); setInput(String(value)); setEditing(true); }}
        style={{ cursor: "pointer", fontSize: size + 2, fontWeight: 800, whiteSpace: "nowrap", userSelect: "none", letterSpacing: 0.2, display: "inline-flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ color: starColor }}>★</span><span style={{ color: textColor }}>{value}</span>
      </span>
    : <span onClick={e => { e.stopPropagation(); setInput(""); setEditing(true); }}
        style={{ cursor: "pointer", fontSize: size, color: "#444", border: "1px solid #1e1e35", borderRadius: 4, padding: "2px 7px", background: "#080814", whiteSpace: "nowrap", userSelect: "none" }}>
        + Rate
      </span>;
}
