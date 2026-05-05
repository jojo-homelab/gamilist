/**
 * Grid.jsx — Responsive game card grids
 *
 * Exports two grid components:
 *
 *   Grid     — Standard auto-fill or fixed-column grid for My List and Search.
 *              Uses a ResizeObserver to report the actual rendered card width
 *              back to the parent (so MetadataModal can match it exactly).
 *
 *   FavGrid  — Specialised grid for the Favourites tab with:
 *              - Top-3 cards with configurable size multipliers and glow borders
 *              - Drag-and-drop reordering (HTML5 drag API)
 *              - Same ResizeObserver card-width reporting as Grid
 */

import { useState, useRef, useEffect } from "react";
import { GameCard } from "./GameCard.jsx";
import { normName } from "../../utils.js";

/**
 * Standard responsive game grid.
 * Shows an empty-state message when the game list is empty.
 *
 * @param {Object} props
 * @param {Object[]} props.games - Array of RAWG-shaped game objects to display.
 * @param {Object} props.myList - Map of gameId → list entry (for status/rating display).
 * @param {Object} [props.importedNameMap] - Normalised-name → entry map for PSN/Steam matching.
 * @param {function} props.onAdd - Add/change status handler passed to GameCard.
 * @param {function} props.onRemove - Remove handler passed to GameCard.
 * @param {function} props.onToggleFav - Favourite toggle handler.
 * @param {function} props.onRate - Rating handler.
 * @param {function} props.onOpenMetadata - Open metadata modal handler.
 * @param {function} props.onTogglePlatform - Platform toggle handler.
 * @param {function} props.getPlatformColor - Platform accent color resolver.
 * @param {function} props.getStatusProps - Custom status color resolver.
 * @param {string} props.emptyMsg - Message shown when games array is empty.
 * @param {number} props.cardW - Card width in pixels (base, before column fit).
 * @param {number} props.cardH - Card height in pixels.
 * @param {number} props.cardH2 - Alternate card height for altCardMode even indices.
 * @param {boolean} props.altCardMode - Alternate heights on even-indexed cards.
 * @param {number} props.effectiveCardCount - Fixed column count (0 = auto).
 * @param {boolean} props.showGalleryNav - Show screenshot gallery arrows and dots.
 * @param {boolean} [props.hideMenu=false] - Hide the status dropdown on each card.
 * @param {boolean} [props.listMode=false] - Show only played platforms on each card.
 * @param {number} [props.statsTextSize=11] - Base font size passed to GameCard.
 * @param {number} [props.nameOffset=0] - Title font size offset passed to GameCard.
 * @param {boolean} [props.autoFitTitle=false] - Enable FitTitle on cards.
 * @param {function(number): void} [props.onActualCardW] - Callback with measured card width.
 * @param {Object} [props.ratingColors={}] - Custom rating color map.
 * @returns {JSX.Element}
 */
export function Grid({
  games, myList, importedNameMap,
  onAdd, onRemove, onToggleFav, onRate, onOpenMetadata, onTogglePlatform,
  getPlatformColor, getStatusProps,
  emptyMsg, cardW, cardH, cardH2, altCardMode, effectiveCardCount, showGalleryNav,
  hideMenu = false, listMode = false,
  statsTextSize = 11, nameOffset = 0, autoFitTitle = false,
  onActualCardW, ratingColors = {},
}) {
  if (!games.length) return (
    <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>{emptyMsg}</div>
  );

  // Fixed-column or auto-fill CSS template
  const cols = effectiveCardCount > 0
    ? `repeat(${effectiveCardCount}, 1fr)`
    : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;

  const gridRef = useRef();

  /**
   * Measure the actual rendered card width and report it via onActualCardW.
   * This is used to size MetadataModal so its preview panel matches exactly.
   * A ResizeObserver re-runs whenever the grid container width changes.
   */
  useEffect(() => {
    if (!gridRef.current || !onActualCardW) return;
    const gap = 20;
    const measure = () => {
      const containerW = gridRef.current.offsetWidth;
      const colCount = effectiveCardCount > 0
        ? effectiveCardCount
        : Math.max(1, Math.floor((containerW + gap) / (cardW + gap)));
      onActualCardW(Math.floor((containerW - (colCount - 1) * gap) / colCount));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [effectiveCardCount, cardW, onActualCardW]);

  return (
    <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: cols, gap: 20, alignItems: "start" }}>
      {games.map((g, i) => (
        <GameCard
          key={g.id}
          game={g}
          // Prefer the list entry by ID; fall back to the normalised-name map for imports
          listEntry={myList[g.id] || importedNameMap?.[normName(g.name)] || null}
          cardH={altCardMode && i % 2 === 1 ? cardH2 : cardH}
          onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate}
          onOpenMetadata={onOpenMetadata} onTogglePlatform={onTogglePlatform}
          getPlatformColor={getPlatformColor} getStatusProps={getStatusProps}
          showGalleryNav={showGalleryNav}
          hideMenu={hideMenu} listMode={listMode}
          statsTextSize={statsTextSize} nameOffset={nameOffset} autoFitTitle={autoFitTitle}
          ratingColors={ratingColors}
        />
      ))}
    </div>
  );
}

/**
 * Favourites grid with drag-and-drop reordering and top-3 glow/size effects.
 *
 * The first three entries receive:
 *   - An optional glow border (from glowConfig[i])
 *   - A column span based on favMults[i] (rounded, capped to maxCols)
 *   - A proportionally taller card height
 *
 * Drag-and-drop uses the native HTML5 drag API. The dragged card's id is
 * stored in a ref (not state) to avoid triggering re-renders during drag.
 *
 * @param {Object} props
 * @param {Object[]} props.entries - Ordered favourite list entries (include `game` object).
 * @param {Array<{enabled:boolean, color:string}>} props.glowConfig - Glow settings for top 3.
 * @param {Object} props.myList - Map of gameId → list entry.
 * @param {function} props.onAdd - Add/change status handler.
 * @param {function} props.onRemove - Remove handler.
 * @param {function} props.onToggleFav - Favourite toggle handler.
 * @param {function} props.onRate - Rating handler.
 * @param {function} props.onOpenMetadata - Open metadata modal handler.
 * @param {function} props.onTogglePlatform - Platform toggle handler.
 * @param {function} props.getPlatformColor - Platform accent color resolver.
 * @param {function} props.getStatusProps - Custom status color resolver.
 * @param {number} props.cardW - Card width in pixels.
 * @param {number} props.cardH - Card height in pixels.
 * @param {number} props.cardH2 - Alternate card height for even indices.
 * @param {boolean} props.altCardMode - Alternate heights on even-indexed cards.
 * @param {number} props.effectiveCardCount - Fixed column count (0 = auto).
 * @param {number[]} [props.favMults=[2,2,2]] - Column span multipliers for top 3 favourites.
 * @param {function(number, number): void} props.onReorder - Called with (fromId, toId) after a drop.
 * @param {boolean} props.showGalleryNav - Show screenshot gallery navigation.
 * @param {boolean} [props.hideMenu=false] - Hide the status dropdown.
 * @param {boolean} [props.listMode=false] - Show only played platforms.
 * @param {boolean} [props.hideFav=false] - Hide the favourite star.
 * @param {number} [props.statsTextSize=11] - Base font size.
 * @param {number} [props.nameOffset=0] - Title font size offset.
 * @param {boolean} [props.autoFitTitle=false] - Enable FitTitle on cards.
 * @param {function(number): void} [props.onActualCardW] - Callback with measured card width.
 * @param {Object} [props.ratingColors={}] - Custom rating color map.
 * @returns {JSX.Element}
 */
export function FavGrid({
  entries, glowConfig, myList,
  onAdd, onRemove, onToggleFav, onRate, onOpenMetadata, onTogglePlatform,
  getPlatformColor, getStatusProps,
  cardW, cardH, cardH2, altCardMode, effectiveCardCount,
  favMults = [2, 2, 2], onReorder, showGalleryNav,
  hideMenu = false, listMode = false, hideFav = false,
  statsTextSize = 11, nameOffset = 0, autoFitTitle = false,
  onActualCardW, ratingColors = {},
}) {
  // Track which card is being dragged over (for visual drop-target feedback)
  const [dragOverId, setDragOverId] = useState(null);
  // The id of the card currently being dragged (ref avoids render on drag)
  const dragId = useRef(null);
  const gridRef = useRef();

  // Same ResizeObserver pattern as Grid to report actual card width
  useEffect(() => {
    if (!gridRef.current || !onActualCardW) return;
    const gap = 20;
    const measure = () => {
      const containerW = gridRef.current.offsetWidth;
      const colCount = effectiveCardCount > 0
        ? effectiveCardCount
        : Math.max(1, Math.floor((containerW + gap) / (cardW + gap)));
      onActualCardW(Math.floor((containerW - (colCount - 1) * gap) / colCount));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [effectiveCardCount, cardW, onActualCardW]);

  if (!entries.length) return (
    <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>
      No favourites yet. Add games to your list and star them!
    </div>
  );

  const cols = effectiveCardCount > 0
    ? `repeat(${effectiveCardCount}, 1fr)`
    : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;

  // Max column span to avoid overflowing a narrow 1-column layout
  const maxCols = effectiveCardCount > 0 ? effectiveCardCount : 12;

  return (
    <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: cols, gap: 20, alignItems: "start" }}>
      {entries.map((e, i) => {
        // Glow applies only to top-3 entries when enabled in settings
        const glow = i < 3 && glowConfig[i]?.enabled ? glowConfig[i].color : null;
        // Column span for top-3: multiply and round the favMult, capped to maxCols
        const mult = i < 3 ? (favMults[i] ?? 2) : 1;
        const span = i < 3 ? Math.max(1, Math.min(Math.round(mult), maxCols)) : 1;
        // Proportionally taller for top-3; use altCardMode for the rest
        const thisCardH = i < 3
          ? Math.round(cardH * mult)
          : (altCardMode && i % 2 === 1 ? cardH2 : cardH);

        return (
          <div
            key={e.game.id}
            draggable
            onDragStart={() => { dragId.current = e.game.id; }}
            onDragEnd={() => { dragId.current = null; setDragOverId(null); }}
            onDragOver={ev => { ev.preventDefault(); if (dragId.current !== e.game.id) setDragOverId(e.game.id); }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={() => {
              setDragOverId(null);
              if (dragId.current != null && dragId.current !== e.game.id) {
                onReorder(dragId.current, e.game.id);
              }
            }}
            style={{
              gridColumn: span > 1 ? `span ${span}` : undefined,
              opacity: dragOverId === e.game.id ? 0.5 : 1,
              outline: dragOverId === e.game.id ? "2px dashed #7c6ef755" : "none",
              borderRadius: 12, cursor: "grab", transition: "opacity 0.15s",
            }}>
            <GameCard
              game={e.game} listEntry={e} cardH={thisCardH} glowColor={glow}
              onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate}
              onOpenMetadata={onOpenMetadata} onTogglePlatform={onTogglePlatform}
              getPlatformColor={getPlatformColor} getStatusProps={getStatusProps}
              showGalleryNav={showGalleryNav}
              hideMenu={hideMenu} listMode={listMode} hideFav={hideFav}
              statsTextSize={statsTextSize} nameOffset={nameOffset} autoFitTitle={autoFitTitle}
              ratingColors={ratingColors}
            />
          </div>
        );
      })}
    </div>
  );
}
