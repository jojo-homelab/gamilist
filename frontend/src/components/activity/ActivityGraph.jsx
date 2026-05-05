/**
 * ActivityGraph.jsx — GitHub-style contribution heatmap
 *
 * Exports two components:
 *
 *   ActivityGraph        — Full heatmap with a configurable number of weeks.
 *                         Renders a grid of coloured day cells (numWeeks × 7)
 *                         with a hover tooltip showing the date and edit count.
 *
 *   ActivityGraphPreview — Responsive wrapper that auto-calculates numWeeks
 *                         based on container width via ResizeObserver, so the
 *                         graph always fills the available space without overflow.
 *
 * Layout:
 *   Columns = weeks, newest on the right (today = col numWeeks-1, row 0).
 *   Each cell is 10 × 10 px with a 2 px gap, matching AniList's layout.
 *
 * Color tiers:
 *   empty → low (count < threshMid) → mid (count < threshHigh) → high (count ≥ threshHigh)
 */

import { useState, useRef, useEffect } from "react";

/**
 * Activity heatmap component.
 *
 * @param {Object} props
 * @param {string[]} props.activityLog - Array of ISO date strings (e.g. ["2024-01-15", …]).
 *   Duplicate entries count as multiple edits on the same day.
 * @param {Object} [props.colors={}] - Color overrides: { empty, low, mid, high, bg }.
 * @param {number} [props.numWeeks=52] - Number of week columns to render.
 * @param {number} [props.editsSize=10] - Font size for the "N edits in the last year" label.
 * @param {number} [props.editsWeight=800] - Font weight for the edits label.
 * @param {number} [props.threshMid=2] - Edit count where color transitions low → mid.
 * @param {number} [props.threshHigh=3] - Edit count where color transitions mid → high.
 * @returns {JSX.Element}
 */
export function ActivityGraph({
  activityLog, colors = {}, numWeeks = 52,
  editsSize = 10, editsWeight = 800, threshMid = 2, threshHigh = 3,
}) {
  const emptyColor = colors.empty || "#080814";
  const lowColor   = colors.low   || "#2d1f6b";
  const midColor   = colors.mid   || "#5040a0";
  const highColor  = colors.high  || "#7c6ef7";

  const [tooltip, setTooltip] = useState(null); // { label, x, y }

  // Count edits per day from the log array (duplicates = multiple edits)
  const counts = {};
  for (const d of activityLog || []) counts[d] = (counts[d] || 0) + 1;

  // Build the week/day grid: numWeeks columns × 7 rows
  // Today sits at the top of the rightmost column (col numWeeks-1, row 0)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weeks = [];
  for (let col = 0; col < numWeeks; col++) {
    const week = [];
    for (let row = 0; row < 7; row++) {
      // daysBack counts from today; top-right = 0, bottom-left = numWeeks*7-1
      const daysBack = (numWeeks - 1 - col) * 7 + row;
      const d = new Date(today);
      d.setDate(d.getDate() - daysBack);
      const iso = d.toISOString().slice(0, 10);
      week.push({ iso, count: counts[iso] || 0 });
    }
    weeks.push(week);
  }

  /** Map edit count to the appropriate tier color. */
  const cellColor = (n) => {
    if (n === 0) return emptyColor;
    if (n < threshMid) return lowColor;
    if (n < threshHigh) return midColor;
    return highColor;
  };

  /** Format an ISO date string into "Month Day, Year". */
  const formatIso = (iso) => {
    const [y, m, day] = iso.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: "inline-block", position: "relative" }}>
      {/* Fixed-position tooltip — follows mouse cursor */}
      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 12, top: tooltip.y - 32,
          background: "var(--theme-border)", border: "1px solid #2a2a40", borderRadius: 6,
          padding: "4px 10px", fontSize: 11, color: "#e0e0f0", whiteSpace: "nowrap",
          pointerEvents: "none", zIndex: 9999, boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}>
          {tooltip.label}
        </div>
      )}

      {/* The grid itself: flex row of week columns */}
      <div style={{ display: "flex", gap: 2 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {week.map((day, di) => (
              <div key={di}
                onMouseEnter={e => setTooltip({ label: `${formatIso(day.iso)} — ${day.count} edit${day.count !== 1 ? "s" : ""}`, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                onMouseLeave={() => setTooltip(null)}
                style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(day.count), flexShrink: 0, cursor: "default" }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Summary line below the grid */}
      <div style={{ fontSize: editsSize, color: "#fff", fontWeight: editsWeight, marginTop: 6 }}>
        {total} edit{total !== 1 ? "s" : ""} in the last year
      </div>
    </div>
  );
}

/**
 * Responsive wrapper around ActivityGraph.
 * Measures its container width and converts it to a numWeeks count so the
 * graph always fills the available horizontal space.
 *
 * @param {Object} props
 * @param {string[]} props.activityLog - ISO date strings (see ActivityGraph).
 * @param {Object} [props.colors={}] - Color overrides forwarded to ActivityGraph.
 * @param {number} [props.editsSize=10] - Edits label font size.
 * @param {number} [props.editsWeight=800] - Edits label font weight.
 * @param {number} [props.threshMid=2] - Mid color threshold.
 * @param {number} [props.threshHigh=3] - High color threshold.
 * @param {string} [props.themePageBg] - Fallback background color when colors.bg is not set.
 * @returns {JSX.Element}
 */
export function ActivityGraphPreview({
  activityLog, colors, editsSize, editsWeight, threshMid, threshHigh, themePageBg,
}) {
  const containerRef = useRef(null);
  const [numWeeks, setNumWeeks] = useState(30);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      // Each cell is 10 px wide + 2 px gap; subtract panel padding (20 px)
      const w = el.clientWidth - 20;
      setNumWeeks(Math.max(8, Math.floor(w / 12)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{
      marginTop: 16, padding: "10px",
      background: colors.bg || themePageBg,
      border: "1px solid var(--theme-border)",
      borderRadius: 8, overflow: "hidden",
    }}>
      <ActivityGraph
        activityLog={activityLog} colors={colors} numWeeks={numWeeks}
        editsSize={editsSize} editsWeight={editsWeight}
        threshMid={threshMid} threshHigh={threshHigh}
      />
    </div>
  );
}
