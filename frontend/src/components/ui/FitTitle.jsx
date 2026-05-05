/**
 * FitTitle.jsx — Auto-shrinking single-line title component
 *
 * Starts at `targetSize` px and decreases in 0.5 px steps until the text
 * fits within its container without overflowing. Uses a layout effect so
 * the font shrink happens synchronously before the browser paints —
 * preventing a visible flash of overflowing text.
 *
 * Used in: GameCard (when autoFitTitle is enabled), Settings text preview.
 */

import { useRef, useLayoutEffect } from "react";

/**
 * Renders children in a single-line div that shrinks its font size until
 * the content fits. Stops shrinking at 8 px to remain readable.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Text content to display.
 * @param {number} props.targetSize - Starting font size in pixels.
 * @param {React.CSSProperties} [props.style] - Additional styles merged onto the wrapper div.
 * @returns {JSX.Element}
 */
export function FitTitle({ children, targetSize, style }) {
  const ref = useRef();

  // Runs synchronously after every render (no deps array) because the available
  // width may change without a React state update (e.g. grid resize).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reset to target size before measuring to catch cases where the container
    // grew wider and can now accommodate a larger font.
    el.style.fontSize = targetSize + "px";
    let size = targetSize;

    // Step down until content fits or we hit the minimum readable size
    while (el.scrollWidth > el.clientWidth && size > 8) {
      size -= 0.5;
      el.style.fontSize = size + "px";
    }
  });

  return (
    <div ref={ref} style={{ whiteSpace: "nowrap", overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}
