/**
 * GameCard.jsx — Individual game tile component
 *
 * Renders a single game as a card with:
 *   - Cover image (lazy screenshot gallery on hover, custom extra images)
 *   - Platform badges (clickable to toggle "played on" state)
 *   - User rating, playtime, and replay count
 *   - Status dropdown (Add to list / change status / remove)
 *   - Favourite star button
 *   - Glow border effect for top-3 favourites
 *
 * Uniform height is achieved by inserting a flex-grow spacer before the
 * status dropdown. This ensures the button is always at the same vertical
 * position regardless of how many optional fields are visible.
 *
 * Screenshots are lazy-loaded on first hover for RAWG games, then cached in
 * local state. The gallery auto-cycles every 2.2 s while hovered (paused
 * when hovering the arrow buttons to avoid accidental skips).
 */

import { useState, useRef, useEffect } from "react";
import { API, apiFetch } from "../../api.js";
import { STATUSES, STATUSES_DISPLAY, PLATFORM_SHORT, ALL_PLATFORMS } from "../../constants.js";
import { rawgImgSrc, coverSrc, formatPlaytime } from "../../utils.js";
import { FitTitle } from "../ui/FitTitle.jsx";
import { RatingInput } from "../ui/RatingInput.jsx";

/**
 * Game card tile component used in both the main grid and the favourites grid.
 *
 * @param {Object} props
 * @param {Object} props.game - RAWG-shaped game object (id, name, background_image, platforms, …).
 * @param {Object|null} props.listEntry - User's list entry for this game, or null if not in list.
 * @param {function(Object, number): void} props.onAdd - Add/change status: onAdd(game, statusId).
 * @param {function(number): void} props.onRemove - Remove from list by game id.
 * @param {function(number): void} props.onToggleFav - Toggle favourite by game id.
 * @param {function(number, number|null): void} props.onRate - Set user rating: onRate(gameId, value).
 * @param {function(number): void} [props.onOpenMetadata] - Open metadata modal by game id.
 * @param {function(number, string): void} [props.onTogglePlatform] - Toggle a platform slug for a game.
 * @param {function(string): string} [props.getPlatformColor] - Returns hex color for a platform slug.
 * @param {function(number): {color:string, bg:string}} [props.getStatusProps] - Custom status colors.
 * @param {number} [props.cardH=255] - Cover image height in pixels.
 * @param {string|null} [props.glowColor=null] - Hex color for the glow border effect, or null.
 * @param {boolean} [props.showGalleryNav=true] - Show arrow/dot screenshot navigation on hover.
 * @param {boolean} [props.hideMenu=false] - Hide the status dropdown (read-only mode).
 * @param {boolean} [props.listMode=false] - Show only platforms the user has played (vs all).
 * @param {boolean} [props.hideFav=false] - Hide the favourite star button.
 * @param {number} [props.statsTextSize=11] - Base font size for stats, platforms, playtime.
 * @param {number} [props.nameOffset=0] - Extra px added to stats size for the title font.
 * @param {boolean} [props.autoFitTitle=false] - Use FitTitle to shrink long titles.
 * @param {Object} [props.ratingColors={}] - Custom color map keyed by rating string.
 * @param {function(number): void} [props.onActualCardW] - Not used in GameCard (Grid uses this).
 * @returns {JSX.Element}
 */
export function GameCard({
  game, listEntry, onAdd, onRemove, onToggleFav, onRate, onOpenMetadata,
  onTogglePlatform, getPlatformColor, getStatusProps,
  cardH = 255, glowColor = null, showGalleryNav = true, hideMenu = false,
  listMode = false, hideFav = false,
  statsTextSize = 11, nameOffset = 0, autoFitTitle = false, ratingColors = {},
}) {
  // Derive the color for a given rating value from the custom map or built-in defaults
  const ratingKeyFor = v => (v < 5 ? "lt5" : String(v));
  const ratingStarColor = v => ratingColors[ratingKeyFor(v)] || {
    "10":"#FFD700","9.5":"#f0c020","9":"#e8b030","8.5":"#e0a040","8":"#d89050",
    "7.5":"#cc8060","7":"#c07070","6.5":"#aa6080","6":"#9060a0","5.5":"#7050b0",
    "5":"#6040c0","lt5":"#e05c7a",
  }[ratingKeyFor(v)] || "#e6a63a";
  const ratingTextColor = v => ratingStarColor(v);

  // Fall back to raw STATUSES if no custom getStatusProps is provided
  const statusProps = (id) => getStatusProps ? getStatusProps(id) : (STATUSES[id] || STATUSES[6]);

  const [hover, setHover]           = useState(false);
  const [arrowHover, setArrowHover] = useState(false);
  const [showMenu, setShowMenu]     = useState(false);
  const [imgErr, setImgErr]         = useState(false);
  // null = not yet fetched; [] = fetching or no results; [...] = loaded screenshots
  const [screenshots, setScreenshots] = useState(null);
  const [imgIndex, setImgIndex]     = useState(0);
  const menuRef = useRef();

  const status   = listEntry?.status ?? null;
  const isFav    = listEntry?.favourite || false;
  const hasCover = listEntry?.hasCover || false;

  // Close the status dropdown when clicking outside it
  useEffect(() => {
    if (!showMenu) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMenu]);

  // ── Image list construction ──────────────────────────────────────────────
  const customImagesOnly = listEntry?.customImagesOnly || false;
  // Extra images stored in the DB as image IDs, converted to full URLs
  const extraImageUrls = (listEntry?.extraImageIds || []).map(id => `${API}/images/${id}`);
  // Cache-busted cover URL if the user has uploaded a custom cover
  const coverUrl = hasCover ? `${coverSrc(game.id)}?v=${listEntry?.coverVersion ?? 0}` : null;
  const rawgCover = rawgImgSrc(game.background_image);

  let baseImages;
  if (customImagesOnly && (hasCover || extraImageUrls.length > 0)) {
    // Skip RAWG cover entirely — only show user-uploaded images
    baseImages = [coverUrl, ...extraImageUrls].filter(Boolean);
  } else {
    // Show cover (custom first, then RAWG fallback) plus extra images
    baseImages = [coverUrl || rawgCover, ...extraImageUrls].filter(Boolean);
  }

  // Don't mix in hover-loaded RAWG screenshots when custom extra images exist
  // (avoids duplicates and respects the user's gallery curation)
  const hoverScreenshots = extraImageUrls.length > 0 ? [] : (screenshots || []).map(u => rawgImgSrc(u));
  const allImages = [...baseImages, ...hoverScreenshots].filter(Boolean);
  const displayImg = allImages[imgIndex] || coverUrl || rawgCover;

  /** Lazy-load RAWG screenshots on first hover (skips Steam/PSN imports and Dropped games). */
  const handleMouseEnter = async () => {
    setHover(true);
    if (
      screenshots === null &&
      game.id &&
      !(game.slug || "").startsWith("steam-") &&
      listEntry?.status !== 6 &&
      !(listEntry?.extraImageIds?.length > 0)
    ) {
      setScreenshots([]); // sentinel: loading in progress
      try {
        const shots = await apiFetch(`/games/${game.id}/screenshots`);
        setScreenshots(shots);
      } catch { setScreenshots([]); }
    }
  };

  // Auto-cycle gallery images every 2.2 s while hovered; pause when hovering arrows
  useEffect(() => {
    if (!hover || arrowHover || allImages.length <= 1) return;
    const timer = setInterval(() => setImgIndex(i => (i + 1) % allImages.length), 2200);
    return () => clearInterval(timer);
  }, [hover, arrowHover, allImages.length]);

  // ── Glow / shadow style ──────────────────────────────────────────────────
  const glowStyle = glowColor ? {
    border:     `1px solid ${glowColor}99`,
    boxShadow:  `0 0 14px ${glowColor}88, 0 0 32px ${glowColor}44${hover ? ", 0 8px 30px rgba(0,0,0,0.5)" : ""}`,
    background: `linear-gradient(160deg, var(--card-fill) 60%, ${glowColor}18)`,
  } : {
    border:    `1px solid ${hover ? "#2e2e50" : "#1a1a2e"}`,
    boxShadow: hover ? "0 8px 30px rgba(0,0,0,0.5)" : "none",
    background: "var(--card-fill)",
  };

  /**
   * Open the metadata modal. If the game is not yet in the list, auto-add
   * it as Backlog first so the modal has an entry to display. React batches
   * both state updates so the modal sees the new entry immediately.
   */
  const openMeta = (e) => {
    if (!onOpenMetadata) return;
    e.stopPropagation();
    if (listEntry) {
      onOpenMetadata(game.id);
    } else if (onAdd) {
      onAdd(game, 3); // 3 = Backlog
      onOpenMetadata(game.id);
    }
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => { setHover(false); setImgIndex(0); }}
      onClick={openMeta}
      style={{
        borderRadius: 12, overflow: "visible", position: "relative",
        display: "flex", flexDirection: "column",
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
        transform: hover ? "translateY(-4px)" : "none",
        cursor: onOpenMetadata ? "pointer" : "default",
        ...glowStyle,
      }}>

      {/* Cover image — fixed height with screenshot gallery navigation */}
      <div style={{ height: cardH, borderRadius: "12px 12px 0 0", overflow: "hidden", background: "var(--card-fill)", position: "relative", flexShrink: 0 }}>
        {displayImg && !imgErr
          ? <img
              src={displayImg}
              alt={game.name}
              onError={() => setImgErr(true)}
              style={{
                width: "100%", height: "100%",
                objectFit: listEntry?.imgFit ?? "cover",
                objectPosition: `${listEntry?.imgPosX ?? 50}% ${listEntry?.imgPosY ?? 50}%`,
                display: "block", transition: "opacity 0.2s",
              }} />
          : /* Fallback when no image or load error */
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 36 }}>🎮</span>
              <span style={{ fontSize: 11, color: "#333", textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>{listEntry?.customName || game.name}</span>
            </div>
        }

        {/* Screenshot navigation dots (bottom bar) */}
        {allImages.length > 1 && hover && showGalleryNav && (
          <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5, zIndex: 10 }} onClick={e => e.stopPropagation()}>
            {allImages.map((_, i) => (
              <div key={i} onClick={e => { e.stopPropagation(); setImgIndex(i); }}
                style={{ width: i === imgIndex ? 18 : 6, height: 6, borderRadius: 3, background: i === imgIndex ? "#fff" : "rgba(255,255,255,0.45)", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }} />
            ))}
          </div>
        )}

        {/* Side arrow buttons for manual navigation */}
        {allImages.length > 1 && hover && showGalleryNav && (
          <>
            <button
              onMouseEnter={() => setArrowHover(true)} onMouseLeave={() => setArrowHover(false)}
              onClick={e => { e.stopPropagation(); setImgIndex(i => (i - 1 + allImages.length) % allImages.length); }}
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, lineHeight: 1 }}>‹</button>
            <button
              onMouseEnter={() => setArrowHover(true)} onMouseLeave={() => setArrowHover(false)}
              onClick={e => { e.stopPropagation(); setImgIndex(i => (i + 1) % allImages.length); }}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, lineHeight: 1 }}>›</button>
          </>
        )}

        {/* Favourite star — top-left, shown only for list entries */}
        {listEntry && !hideFav && (
          <button onClick={e => { e.stopPropagation(); onToggleFav(game.id); }}
            style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: isFav ? "#e6a63a" : "#555" }}>
            {isFav ? "★" : "☆"}
          </button>
        )}

        {/* Status badge — top-right */}
        {status !== null && (
          <div style={{ position: "absolute", top: 8, right: 8, background: statusProps(status).color + "dd", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
            {STATUSES[status].label}
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", flex: 1 }}>
        {/* Game title */}
        {autoFitTitle
          ? <FitTitle targetSize={statsTextSize + nameOffset} style={{ fontWeight: 700, color: "#eeeeff", marginBottom: 4 }} title={listEntry?.customName || game.name}>{listEntry?.customName || game.name}</FitTitle>
          : <div style={{ fontSize: statsTextSize + nameOffset, fontWeight: 700, color: "#eeeeff", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={listEntry?.customName || game.name}>{listEntry?.customName || game.name}</div>
        }

        {/* Platform badges — clickable to toggle "played on" when in list mode */}
        {(() => {
          const played = listEntry?.platformsPlayed || [];
          const gameSlugs = (game.platforms || []).map(p => p.platform.slug);
          // Extra slugs the user added that are not in the RAWG platform list for this game
          const extraPlayedSlugs = played.filter(s => !gameSlugs.includes(s));
          // In list mode: only show platforms the user has marked as played
          const badgeSlugs = listMode
            ? played
            : [...gameSlugs, ...extraPlayedSlugs];
          if (!badgeSlugs.length) return null;
          // A single-platform game with no explicit selection defaults to "active"
          const isDefault = !listMode && played.length === 0 && gameSlugs.length === 1;
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }} onClick={e => e.stopPropagation()}>
              {badgeSlugs.map(slug => {
                const pInfo = (game.platforms || []).find(p => p.platform.slug === slug)?.platform
                           || ALL_PLATFORMS.find(p => p.slug === slug)
                           || { name: slug };
                const active = listMode || played.includes(slug) || (isDefault && gameSlugs[0] === slug);
                const pc = getPlatformColor ? getPlatformColor(slug) : "#7c6ef7";
                return (
                  <span key={slug} title={pInfo.name}
                    onClick={e => { e.stopPropagation(); if (listEntry && onTogglePlatform) onTogglePlatform(game.id, slug); }}
                    style={{
                      fontSize: Math.max(7, statsTextSize - 2), fontWeight: 700,
                      padding: "2px 5px", borderRadius: 3,
                      background: active ? pc + "28" : "#141420",
                      border: `1px solid ${active ? pc + "77" : "#222238"}`,
                      color: active ? pc : "#444",
                      cursor: listEntry ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap",
                    }}>
                    {PLATFORM_SHORT[slug] || pInfo.name?.slice(0, 4)}
                  </span>
                );
              })}
            </div>
          );
        })()}

        {/* Rating, playtime, replay count — only shown for list entries */}
        {listEntry && (
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
            <RatingInput
              value={listEntry.userRating ?? null}
              onChange={v => onRate(game.id, v)}
              size={statsTextSize}
              starColor={listEntry.userRating != null ? ratingStarColor(listEntry.userRating) : "#e6a63a"}
              textColor={listEntry.userRating != null ? ratingTextColor(listEntry.userRating) : "#e6a63a"}
            />
            {formatPlaytime(listEntry.playtimeMinutes) && <>
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: statsTextSize + 1, userSelect: "none" }}>|</span>
              <span style={{ fontSize: statsTextSize, color: "#eeeeff", fontWeight: 700, whiteSpace: "nowrap" }}>⏱ {formatPlaytime(listEntry.playtimeMinutes)}</span>
            </>}
            {listEntry.replayCount > 0 && <>
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: statsTextSize + 1, userSelect: "none" }}>|</span>
              <span style={{ fontSize: statsTextSize, color: "#eeeeff", fontWeight: 700, whiteSpace: "nowrap" }}>↺ ×{listEntry.replayCount}</span>
            </>}
          </div>
        )}

        {/* Spacer — pushes the status dropdown to the card bottom for alignment */}
        <div style={{ flex: 1 }} />

        {/* Status dropdown */}
        {!hideMenu && (
          <div ref={menuRef} style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
            <button onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
              style={{ width: "100%", padding: "7px 11px", borderRadius: 8, border: `1px solid ${status !== null ? statusProps(status).color + "44" : "#1e1e35"}`, background: status !== null ? statusProps(status).bg : "var(--card-fill)", color: status !== null ? statusProps(status).color : "#555", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "inherit" }}>
              <span>{status !== null ? STATUSES[status].label : "＋ Add to list"}</span>
              <span style={{ opacity: 0.6, fontSize: 9 }}>▾</span>
            </button>

            {showMenu && (
              <div style={{ position: "absolute", bottom: "calc(100% + 5px)", left: 0, right: 0, background: "var(--card-fill)", border: "1px solid #2a2a40", borderRadius: 10, overflow: "hidden", zIndex: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>
                {STATUSES_DISPLAY.map(s => {
                  const sp = statusProps(s.id);
                  return (
                    <button key={s.id} onClick={e => { e.stopPropagation(); onAdd(game, s.id); setShowMenu(false); }}
                      style={{ width: "100%", padding: "8px 14px", border: "none", background: status === s.id ? sp.bg : "transparent", color: sp.color, cursor: "pointer", fontSize: 12, textAlign: "left", fontWeight: status === s.id ? 700 : 400, display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
                      <span style={{ fontSize: 10, opacity: status === s.id ? 1 : 0 }}>✓</span>{s.label}
                    </button>
                  );
                })}
                {status !== null && <>
                  <div style={{ height: 1, background: "#12121e" }} />
                  <button onClick={e => { e.stopPropagation(); onRemove(game.id); setShowMenu(false); }}
                    style={{ width: "100%", padding: "8px 14px", border: "none", background: "transparent", color: "#ff6060", cursor: "pointer", fontSize: 12, textAlign: "left", fontFamily: "inherit" }}>
                    Remove from list
                  </button>
                </>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
