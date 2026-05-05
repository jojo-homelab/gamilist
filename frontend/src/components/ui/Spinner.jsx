/**
 * Spinner.jsx — Loading indicator
 *
 * A simple centred CSS-animated spinner with optional label text.
 * Used during initial list load, search, and Steam/PSN library sync.
 */

/**
 * Full-width centred loading spinner.
 *
 * @param {Object} props
 * @param {string} [props.text="Loading…"] - Label displayed beneath the spinner circle.
 * @returns {JSX.Element}
 */
export function Spinner({ text = "Loading…" }) {
  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      {/* CSS animation is declared globally in App.jsx's <style> block */}
      <div style={{ display: "inline-block", width: 36, height: 36, border: "3px solid #2a2a40", borderTop: "3px solid #7c6ef7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "#555", fontSize: 13, marginTop: 14 }}>{text}</div>
    </div>
  );
}
