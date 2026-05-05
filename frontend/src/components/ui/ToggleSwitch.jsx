/**
 * ToggleSwitch.jsx — Pill-shaped boolean toggle switch
 *
 * Replaces the repeated inline toggle button pattern used throughout the
 * Settings tab. The pill slides its white dot left (off) or right (on)
 * with a CSS transition.
 *
 * Extracted from App.jsx where the following pattern appeared many times:
 *   <button style={{ width:38, height:22, borderRadius:11, border:"none",
 *     background: value ? "#7c6ef7" : "#2a2a3a", ... }}>
 *     <div style={{ ... left: value ? 19 : 3 }} />
 *   </button>
 *
 * Used in: Settings tab (Alternating Heights, Gallery Nav, Auto-fit Title, etc.),
 *          MetadataModal (Custom Images Only toggle).
 */

/**
 * Animated pill toggle switch.
 *
 * @param {Object} props
 * @param {boolean} props.value - Current on/off state.
 * @param {function(boolean): void} props.onChange - Called with the new state when clicked.
 * @param {string} [props.accentColor="#7c6ef7"] - Background color when the switch is ON.
 * @returns {JSX.Element}
 */
export function ToggleSwitch({ value, onChange, accentColor = "#7c6ef7" }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 38, height: 22, borderRadius: 11,
        border: "none",
        background: value ? accentColor : "#2a2a3a",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}>
      {/* White dot slides from left (off) to right (on) */}
      <div style={{
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff",
        position: "absolute", top: 3,
        left: value ? 19 : 3,
        transition: "left 0.2s",
      }} />
    </button>
  );
}
