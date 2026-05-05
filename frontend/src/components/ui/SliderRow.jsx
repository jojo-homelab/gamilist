/**
 * SliderRow.jsx — Labelled range slider with value display
 *
 * Encapsulates the repeated pattern in the Settings Dimensions panel of:
 *   label + optional description + range input + formatted value badge.
 *
 * Extracted pattern from App.jsx Settings → Cards → Dimensions section:
 *   <div key={label} style={{ flex: 1, minWidth: 0 }}>
 *     <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
 *       <div ...>{label}</div>
 *       <span ...>{value.toFixed(2)}×</span>
 *     </div>
 *     <div ...>{desc}</div>
 *     <input type="range" ... />
 *   </div>
 *
 * Used in: Settings tab (card Dimensions, Favourite card size sliders).
 */

/**
 * A flex-1 column containing a label, optional description, range slider,
 * and a formatted current-value badge.
 *
 * @param {Object} props
 * @param {string} props.label - Short uppercase label (e.g. "Width", "Height").
 * @param {string} [props.desc] - One-line description shown below the label.
 * @param {number} props.value - Current slider value.
 * @param {function(number): void} props.onChange - Called with the new numeric value.
 * @param {number} props.min - Slider minimum.
 * @param {number} props.max - Slider maximum.
 * @param {number} props.step - Slider step increment.
 * @param {string} [props.color="#7c6ef7"] - Accent color for the slider thumb and value badge.
 * @param {function(number): string} [props.fmt] - Value formatter; defaults to `v.toFixed(2)+"×"`.
 * @returns {JSX.Element}
 */
export function SliderRow({ label, desc, value, onChange, min, max, step, color = "#7c6ef7", fmt }) {
  // Default formatter: two decimal places with a × suffix
  const display = fmt ? fmt(value) : `${value.toFixed(2)}×`;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Label + value on the same row */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
        <div style={{ fontSize: 10, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
        <span style={{ fontSize: 10, color, fontWeight: 700 }}>{display}</span>
      </div>

      {/* Optional description */}
      {desc && <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>{desc}</div>}

      {/* Range input */}
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: color, cursor: "pointer" }}
      />
    </div>
  );
}
