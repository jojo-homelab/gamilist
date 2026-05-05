/**
 * CollapseSection.jsx — Collapsible content section with a toggle button
 *
 * A lightweight accordion used inside MetadataModal to hide/show secondary
 * content (e.g. image gallery, framing controls). The toggle button renders
 * a full-width header with an up/down arrow indicator.
 *
 * Used in: MetadataModal (Images, Framing collapse sections).
 */

import { useState } from "react";

/**
 * Collapsible section with a bordered separator and a text toggle.
 *
 * @param {Object} props
 * @param {string} props.title - Heading text shown in the toggle button.
 * @param {React.ReactNode} props.children - Content revealed when open.
 * @param {boolean} [props.defaultOpen=false] - Whether the section starts expanded.
 * @returns {JSX.Element}
 */
export function CollapseSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "2px solid rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 2 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "none", border: "none", padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#eeeeff" }}>{title}</span>
        <span style={{ fontSize: 9, color: "#555" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}
