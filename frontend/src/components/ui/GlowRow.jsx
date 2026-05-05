/**
 * GlowRow.jsx — Single row in the Favourites Glow settings panel
 *
 * Renders a rank badge, label, color picker, and toggle switch for one of
 * the top-3 favourite glow slots. Used exclusively in the Settings → Colors
 * → Glow section of App.jsx.
 */

/**
 * One glow configuration row (rank badge + label + color picker + toggle).
 *
 * @param {Object} props
 * @param {string|number} props.rank - Rank label shown inside the badge (e.g. "1").
 * @param {string} props.label - Descriptive text (e.g. "1st place").
 * @param {boolean} props.enabled - Whether the glow is currently active.
 * @param {string} props.color - Hex color string for the glow.
 * @param {function(): void} props.onToggle - Called when the toggle switch is clicked.
 * @param {function(string): void} props.onColor - Called with the new hex color when the picker changes.
 * @returns {JSX.Element}
 */
export function GlowRow({ rank, label, enabled, color, onToggle, onColor }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      {/* Rank badge — glows in the selected color when enabled */}
      <div style={{
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
        background: enabled ? `${color}22` : "var(--theme-border)",
        border: `2px solid ${enabled ? color : "#333"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800,
        color: enabled ? color : "#444",
        transition: "all 0.2s",
      }}>{rank}</div>

      <span style={{ fontSize: 12, color: "#888", flex: 1 }}>{label}</span>

      {/* Native color picker input */}
      <input type="color" value={color} onChange={e => onColor(e.target.value)} title="Pick glow color"
        style={{ width: 34, height: 26, border: "1px solid #2a2a40", borderRadius: 5, cursor: "pointer", background: "none", padding: 2 }} />

      {/* Pill toggle */}
      <button onClick={onToggle} title={enabled ? "Disable" : "Enable"}
        style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: enabled ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: enabled ? 19 : 3, transition: "left 0.2s" }} />
      </button>
    </div>
  );
}
