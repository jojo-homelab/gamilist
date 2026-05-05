/**
 * StarRating.jsx — Read-only star rating display
 *
 * Renders a 5-star row where the filled portion corresponds to the given
 * rating (0–5 scale). The overlay technique uses `overflow:hidden` on the
 * coloured star span to achieve fractional fills without SVG clipping.
 *
 * Used in: GameCard (RAWG community rating display), MetadataModal.
 */

/**
 * Renders a partial star strip representing a 0–5 rating.
 * Returns null when rating is falsy (0 or missing) — no empty stars shown.
 *
 * @param {Object} props
 * @param {number} props.rating - Rating value between 0 and 5.
 * @returns {JSX.Element|null}
 */
export function StarRating({ rating }) {
  if (!rating) return null;
  // Convert 0–5 scale to a CSS percentage for the overlay width
  const pct = (rating / 5) * 100;
  return (
    <span style={{ position: "relative", display: "inline-block", fontSize: 12, letterSpacing: 1 }}>
      {/* Grey "empty" stars sit underneath */}
      <span style={{ color: "#2a2a3a" }}>★★★★★</span>
      {/* Coloured stars overflow-clipped to the appropriate fill percentage */}
      <span style={{ position: "absolute", left: 0, top: 0, overflow: "hidden", width: `${pct}%`, color: "#e6a63a", whiteSpace: "nowrap" }}>★★★★★</span>
    </span>
  );
}
