/**
 * GamiList — React Frontend (single-file SPA)
 *
 * A game tracking app backed by Flask + PostgreSQL.
 * All API calls go through the VITE_API_URL environment variable which is
 * baked into the static bundle at Docker build time (see Dockerfile).
 *
 * Tabs:
 *   My List    — games the user has added, filterable by status
 *   Favourites — starred games, drag-and-drop orderable, top-3 glow effects
 *   Search     — RAWG-powered game search
 *   Settings   — card size, columns, upload button, glow config (persisted in DB)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// Base API URL — set VITE_API_URL at build time for production.
// Falls back to localhost:5001 for running the frontend locally with `npm run dev`.
// VITE_API_URL="" means "use relative paths" (production/k8s via ingress).
// Falls back to localhost:5001 only when the env var is not set at all (local dev).
const API = (import.meta.env.VITE_API_URL ?? "http://localhost:5001") + "/api";

/**
 * Game list status definitions.
 * The `id` field maps to the integer stored in the database `status` column.
 * `color` and `bg` are used for status badges and filter cards in the UI.
 */
const STATUSES = [
  { id: 0, label: "Playing",        color: "#7c6ef7", bg: "#1a1730" },
  { id: 1, label: "Played",         color: "#4caf80", bg: "#112418" },
  { id: 2, label: "Next To Play",   color: "#e6a63a", bg: "#261d0a" },
  { id: 3, label: "Backlog",        color: "#e05c7a", bg: "#2a0f18" },
  { id: 4, label: "Replaying",      color: "#38bdf8", bg: "#0a1e2a" },
  { id: 5, label: "Plan to Replay", color: "#a78bfa", bg: "#1a1430" },
  { id: 6, label: "Dropped",        color: "#888",    bg: "#141414" },
];

/**
 * Build the URL for a RAWG image, routed through the backend image proxy.
 * This avoids CORS and mixed-content issues when loading external images.
 */
const rawgImgSrc = (url) => url ? `${API}/image-proxy?url=${encodeURIComponent(url)}` : null;

/**
 * Build the URL for a user-uploaded custom cover stored in the database.
 * A cache-busting `?v=N` param is appended by callers after an upload.
 */
const coverSrc = (id) => `${API}/list/${id}/cover`;

/**
 * Thin wrapper around fetch that throws on non-2xx responses.
 * Used for all API calls so error handling is centralised.
 */
async function apiFetch(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Renders a 5-star visual rating bar (read-only).
 * Fills the stars proportionally based on a 0–5 scale from RAWG.
 */
function StarRating({ rating }) {
  if (!rating) return null;
  const pct = (rating / 5) * 100;
  return (
    <span style={{ position: "relative", display: "inline-block", fontSize: 12, letterSpacing: 1 }}>
      <span style={{ color: "#2a2a3a" }}>★★★★★</span>
      <span style={{ position: "absolute", left: 0, top: 0, overflow: "hidden", width: `${pct}%`, color: "#e6a63a", whiteSpace: "nowrap" }}>★★★★★</span>
    </span>
  );
}

/**
 * Inline editable rating input for the user's personal score (0–10).
 *
 * Renders as a "+ Rate" badge when no rating exists, or "⭐ X/10" when set.
 * Clicking switches to a text input; committing on blur or Enter clamps
 * the value to one decimal place in the 0–10 range.
 */
function RatingInput({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput]     = useState("");
  const ref = useRef();

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => {
    const v = parseFloat(input);
    onChange(!isNaN(v) ? Math.min(10, Math.max(0, Math.round(v * 10) / 10)) : null);
    setEditing(false);
  };

  if (editing) return (
    <input ref={ref} value={input} onChange={e => setInput(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      placeholder="0–10"
      style={{ width: 52, background: "#0a0a14", border: "1px solid #7c6ef7", borderRadius: 4, color: "#e0e0f0", fontSize: 12, padding: "2px 5px", outline: "none", fontFamily: "inherit" }} />
  );

  return (
    <span onClick={() => { setInput(value != null ? String(value) : ""); setEditing(true); }}
      style={{ cursor: "pointer", fontSize: 12, color: value != null ? "#e6a63a" : "#444", border: "1px solid #222", borderRadius: 4, padding: "2px 7px", background: "#0a0a14", whiteSpace: "nowrap", userSelect: "none" }}>
      {value != null ? `⭐ ${value}/10` : "+ Rate"}
    </span>
  );
}

/**
 * Hidden file input that uploads a custom cover image to the backend.
 * Renders as a button overlaid on the bottom-right of the card image.
 * After a successful upload, calls onUploaded() so the parent can refresh the cover.
 *
 * Props:
 *   gameId     — ID of the game entry to attach the cover to
 *   onUploaded — callback fired after a successful upload
 *   sizeMult   — multiplier controlling the button's font size and padding (default 1)
 *   btnText    — optional custom label; shows 📷 when empty
 */
function CoverUpload({ gameId, onUploaded, sizeMult = 1, btnText = "" }) {
  const ref = useRef();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("cover", file);
    try {
      await fetch(`${API}/list/${gameId}/cover`, { method: "POST", body: fd });
      onUploaded();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <button onClick={() => ref.current.click()} disabled={uploading}
        style={{
          position: "absolute", bottom: 8, right: 8,
          background: "rgba(0,0,0,0.7)", border: "1px solid #333", borderRadius: 6,
          padding: `${3 * sizeMult}px ${8 * sizeMult}px`,
          color: uploading ? "#555" : "#aaa", cursor: "pointer",
          fontSize: Math.round(10 * sizeMult),
          fontFamily: "inherit",
        }}>
        {uploading ? "…" : (btnText || "📷")}
      </button>
    </>
  );
}

/**
 * Single game card displayed in a grid.
 *
 * Props:
 *   game            — RAWG game object
 *   listEntry       — user's list entry for this game, or null if not in list
 *   onAdd           — (game, statusId) => void
 *   onRemove        — (gameId) => void
 *   onToggleFav     — (gameId) => void
 *   onRate          — (gameId, rating) => void
 *   onCoverUploaded — (gameId) => void
 *   cardH           — card image height in pixels
 *   uploadBtnMult   — size multiplier forwarded to CoverUpload
 *   uploadBtnText   — optional label text forwarded to CoverUpload
 *   glowColor       — hex color string for the glow effect, or null for no glow
 */
function GameCard({ game, listEntry, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, cardH = 255, uploadBtnMult = 1, uploadBtnText = "", glowColor = null }) {
  const [hover, setHover]       = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [imgErr, setImgErr]     = useState(false);
  const [coverKey, setCoverKey] = useState(0);

  const menuRef = useRef();
  const status   = listEntry?.status ?? null;
  const isFav    = listEntry?.favourite || false;
  const hasCover = listEntry?.hasCover || false;

  useEffect(() => {
    if (!showMenu) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMenu]);

  const cover = hasCover
    ? `${coverSrc(game.id)}?v=${coverKey}`
    : rawgImgSrc(game.background_image);

  const handleCoverUploaded = () => {
    setCoverKey(k => k + 1);
    onCoverUploaded(game.id);
  };

  // Glow: glowing border + soft background tint + outer glow shadow
  const glowStyle = glowColor ? {
    border:     `1px solid ${glowColor}99`,
    boxShadow:  `0 0 14px ${glowColor}88, 0 0 32px ${glowColor}44${hover ? ", 0 8px 30px rgba(0,0,0,0.5)" : ""}`,
    background: `linear-gradient(160deg, #10101e 60%, ${glowColor}18)`,
  } : {
    border:    `1px solid ${hover ? "#2e2e50" : "#1a1a2e"}`,
    boxShadow: hover ? "0 8px 30px rgba(0,0,0,0.5)" : "none",
    background: "#10101e",
  };

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 12, overflow: "visible",
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
        transform: hover ? "translateY(-4px)" : "none",
        position: "relative",
        ...glowStyle,
      }}>

      {/* Cover image area */}
      <div style={{ height: cardH, borderRadius: "12px 12px 0 0", overflow: "hidden", background: "#080814", position: "relative" }}>
        {cover && !imgErr
          ? <img src={cover} alt={game.name} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 36 }}>🎮</span>
              <span style={{ fontSize: 11, color: "#333", textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>{game.name}</span>
            </div>
        }

        {listEntry && (
          <button onClick={e => { e.stopPropagation(); onToggleFav(game.id); }}
            style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: isFav ? "#e6a63a" : "#666" }}>
            {isFav ? "★" : "☆"}
          </button>
        )}

        {status !== null && (
          <div style={{ position: "absolute", top: 8, right: 8, background: STATUSES[status].color + "dd", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
            {STATUSES[status].label}
          </div>
        )}

        {listEntry && <CoverUpload gameId={game.id} onUploaded={handleCoverUploaded} sizeMult={uploadBtnMult} btnText={uploadBtnText} />}
      </div>

      {/* Card body */}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#eeeeff", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={game.name}>{game.name}</div>

        {(game.rating > 0 || game.released) && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            {game.rating > 0 && <>
              <StarRating rating={game.rating} />
              <span style={{ fontSize: 11, color: "#555" }}>{game.rating.toFixed(1)}</span>
            </>}
            {game.released && <span style={{ fontSize: 11, color: "#3a3a5a", marginLeft: "auto" }}>{game.released.slice(0,4)}</span>}
          </div>
        )}

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {game.genres?.slice(0,2).map((g,i) => (
            <span key={i} style={{ fontSize: 10, background: "#161628", color: "#5555aa", borderRadius: 4, padding: "2px 7px" }}>{g.name}</span>
          ))}
        </div>

        {listEntry && (
          <div style={{ marginBottom: 10 }}>
            <RatingInput value={listEntry.userRating ?? null} onChange={v => onRate(game.id, v)} />
          </div>
        )}

        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setShowMenu(v => !v)}
            style={{ width: "100%", padding: "7px 11px", borderRadius: 8, border: `1px solid ${status !== null ? STATUSES[status].color + "44" : "#1e1e35"}`, background: status !== null ? STATUSES[status].bg : "#0a0a14", color: status !== null ? STATUSES[status].color : "#555", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "inherit" }}>
            <span>{status !== null ? STATUSES[status].label : "＋ Add to list"}</span>
            <span style={{ opacity: 0.6, fontSize: 9 }}>▾</span>
          </button>

          {showMenu && (
            <div style={{ position: "absolute", bottom: "calc(100% + 5px)", left: 0, right: 0, background: "#10101e", border: "1px solid #2a2a40", borderRadius: 10, overflow: "hidden", zIndex: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>
              {STATUSES.map(s => (
                <button key={s.id} onClick={() => { onAdd(game, s.id); setShowMenu(false); }}
                  style={{ width: "100%", padding: "8px 14px", border: "none", background: status === s.id ? s.bg : "transparent", color: s.color, cursor: "pointer", fontSize: 12, textAlign: "left", fontWeight: status === s.id ? 700 : 400, display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
                  <span style={{ fontSize: 10, opacity: status === s.id ? 1 : 0 }}>✓</span>{s.label}
                </button>
              ))}

              {status !== null && <>
                <div style={{ height: 1, background: "#1a1a30" }} />
                <button onClick={() => { onRemove(game.id); setShowMenu(false); }}
                  style={{ width: "100%", padding: "8px 14px", border: "none", background: "transparent", color: "#ff6060", cursor: "pointer", fontSize: 12, textAlign: "left", fontFamily: "inherit" }}>
                  Remove from list
                </button>
              </>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Full-page loading spinner shown while the list is fetching from the API. */
function Spinner({ text = "Loading…" }) {
  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <div style={{ display: "inline-block", width: 36, height: 36, border: "3px solid #1a1a30", borderTop: "3px solid #7c6ef7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ color: "#555", fontSize: 13, marginTop: 14 }}>{text}</div>
    </div>
  );
}

/**
 * Responsive grid of GameCards.
 * cardCount === 0 → auto-fill columns based on cardW (responsive)
 * cardCount  >  0 → fixed column count, capped at what physically fits the viewport
 */
function Grid({ games, myList, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, emptyMsg, cardW, cardH, uploadBtnMult, uploadBtnText, effectiveCardCount }) {
  if (!games.length) return <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>{emptyMsg}</div>;
  const cols = effectiveCardCount > 0
    ? `repeat(${effectiveCardCount}, 1fr)`
    : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20 }}>
      {games.map(g => (
        <GameCard key={g.id} game={g} listEntry={myList[g.id] || null} cardH={cardH} uploadBtnMult={uploadBtnMult} uploadBtnText={uploadBtnText}
          onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate} onCoverUploaded={onCoverUploaded} />
      ))}
    </div>
  );
}

/**
 * Favourites grid with HTML5 drag-and-drop reordering.
 * The first three cards receive a glowing border/background if enabled in settings.
 *
 * Props:
 *   entries         — ordered array of list entries (already sorted)
 *   glowConfig      — array of 3 { enabled, color } objects for ranks 1–3
 *   onReorder       — (fromId, toId) => void — called when a card is dropped onto another
 *   effectiveCardCount — capped column count (0 = auto-fill)
 */
function FavGrid({ entries, glowConfig, myList, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, cardW, cardH, uploadBtnMult, uploadBtnText, effectiveCardCount, onReorder }) {
  const [dragOverId, setDragOverId] = useState(null);
  const dragId = useRef(null);

  if (!entries.length) return (
    <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>
      No favourites yet. Add games to your list and star them!
    </div>
  );

  const cols = effectiveCardCount > 0
    ? `repeat(${effectiveCardCount}, 1fr)`
    : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;

  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20 }}>
      {entries.map((e, i) => {
        const glow = i < 3 && glowConfig[i]?.enabled ? glowConfig[i].color : null;
        const isDragTarget = dragOverId === e.game.id;
        return (
          <div key={e.game.id}
            draggable
            onDragStart={() => { dragId.current = e.game.id; }}
            onDragEnd={() => { dragId.current = null; setDragOverId(null); }}
            onDragOver={ev => { ev.preventDefault(); if (dragId.current !== e.game.id) setDragOverId(e.game.id); }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={() => {
              setDragOverId(null);
              if (dragId.current != null && dragId.current !== e.game.id) onReorder(dragId.current, e.game.id);
            }}
            style={{
              opacity:    isDragTarget ? 0.5 : 1,
              outline:    isDragTarget ? "2px dashed #7c6ef755" : "none",
              borderRadius: 12,
              cursor:     "grab",
              transition: "opacity 0.15s",
            }}>
            <GameCard game={e.game} listEntry={e} cardH={cardH} uploadBtnMult={uploadBtnMult} uploadBtnText={uploadBtnText}
              glowColor={glow}
              onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate} onCoverUploaded={onCoverUploaded} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Fixed-position toast notification that auto-dismisses.
 * Appears top-right with a green (success) or red (error) style.
 */
function Toast({ msg, ok, onDone }) {
  return (
    <div onAnimationEnd={onDone} style={{
      position: "fixed", top: 24, right: 28, zIndex: 1000,
      background: ok ? "#1a3a1a" : "#2a0a0a",
      border: `1px solid ${ok ? "#4caf8066" : "#ff606066"}`,
      color: ok ? "#4caf80" : "#ff8080",
      borderRadius: 10, padding: "12px 20px",
      fontSize: 13, fontWeight: 700,
      boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
      animation: "toastIn 0.2s ease, toastOut 0.3s ease 2.5s forwards",
      fontFamily: "inherit",
    }}>
      <style>{`
        @keyframes toastIn  { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
        @keyframes toastOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
      {ok ? "✓ " : "✗ "}{msg}
    </div>
  );
}

/**
 * A single row in the Glow Settings panel.
 * Shows rank badge, label, a color picker, and an enable/disable toggle.
 */
function GlowRow({ rank, label, enabled, color, onToggle, onColor }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      {/* Rank badge */}
      <div style={{
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
        background: enabled ? `${color}22` : "#1a1a2e",
        border: `2px solid ${enabled ? color : "#333"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, color: enabled ? color : "#444",
        transition: "all 0.2s",
      }}>{rank}</div>

      <span style={{ fontSize: 12, color: "#888", flex: 1 }}>{label}</span>

      {/* Native color picker */}
      <input type="color" value={color} onChange={e => onColor(e.target.value)}
        title="Pick glow color"
        style={{ width: 34, height: 26, border: "1px solid #2a2a40", borderRadius: 5, cursor: "pointer", background: "none", padding: 2 }} />

      {/* Toggle switch */}
      <button onClick={onToggle} title={enabled ? "Disable glow" : "Enable glow"}
        style={{
          width: 38, height: 22, borderRadius: 11, border: "none",
          background: enabled ? "#7c6ef7" : "#2a2a3a",
          cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0,
        }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3,
          left: enabled ? 19 : 3,
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App component
// ---------------------------------------------------------------------------

/**
 * Root component — owns all state and orchestrates API calls.
 */
export default function App() {
  const [tab, setTab]                     = useState("mylist");
  const [cardWMult, setCardWMult]         = useState(1.5);
  const [cardHMult, setCardHMult]         = useState(1.5);
  const [uploadBtnMult, setUploadBtnMult] = useState(1.0);
  const [uploadBtnText, setUploadBtnText] = useState("");
  const [cardCount, setCardCount]         = useState(0);
  const [glow1Enabled, setGlow1Enabled]   = useState(true);
  const [glow1Color,   setGlow1Color]     = useState("#FFD700");
  const [glow2Enabled, setGlow2Enabled]   = useState(true);
  const [glow2Color,   setGlow2Color]     = useState("#C0C0C0");
  const [glow3Enabled, setGlow3Enabled]   = useState(true);
  const [glow3Color,   setGlow3Color]     = useState("#CD7F32");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState(null);
  const [statusFilter, setStatusFilter]   = useState(null);

  // Track window width so we can cap column count to what actually fits
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Drag-and-drop order for favourites tab (persisted in localStorage)
  const [favOrder, setFavOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gamilist-fav-order") || "[]"); }
    catch { return []; }
  });

  // Tracks the last-saved DB state so Cancel can revert to it
  const dbSettings = useRef({
    cardWMult: 1.5, cardHMult: 1.5, uploadBtnMult: 1.0, uploadBtnText: "", cardCount: 0,
    glow1Enabled: true, glow1Color: "#FFD700",
    glow2Enabled: true, glow2Color: "#C0C0C0",
    glow3Enabled: true, glow3Color: "#CD7F32",
  });

  const [query, setQuery]               = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]   = useState(null);
  const [searched, setSearched]         = useState(false);
  const [myList, setMyList]             = useState({});
  const [listLoading, setListLoading]   = useState(true);
  const [backendOk, setBackendOk]       = useState(null);

  // Load settings and game list from the database on first render
  useEffect(() => {
    apiFetch("/settings")
      .then(s => {
        const loaded = {
          cardWMult:     s.cardWMult     ?? 1.5,
          cardHMult:     s.cardHMult     ?? 1.5,
          uploadBtnMult: s.uploadBtnMult ?? 1.0,
          uploadBtnText: s.uploadBtnText ?? "",
          cardCount:     s.cardCount     ?? 0,
          glow1Enabled:  s.glow1Enabled  ?? true,
          glow1Color:    s.glow1Color    ?? "#FFD700",
          glow2Enabled:  s.glow2Enabled  ?? true,
          glow2Color:    s.glow2Color    ?? "#C0C0C0",
          glow3Enabled:  s.glow3Enabled  ?? true,
          glow3Color:    s.glow3Color    ?? "#CD7F32",
        };
        setCardWMult(loaded.cardWMult);
        setCardHMult(loaded.cardHMult);
        setUploadBtnMult(loaded.uploadBtnMult);
        setUploadBtnText(loaded.uploadBtnText);
        setCardCount(loaded.cardCount);
        setGlow1Enabled(loaded.glow1Enabled);
        setGlow1Color(loaded.glow1Color);
        setGlow2Enabled(loaded.glow2Enabled);
        setGlow2Color(loaded.glow2Color);
        setGlow3Enabled(loaded.glow3Enabled);
        setGlow3Color(loaded.glow3Color);
        dbSettings.current = loaded;
      })
      .catch(() => {});

    apiFetch("/list")
      .then(data => { setMyList(data); setBackendOk(true); })
      .catch(() => setBackendOk(false))
      .finally(() => setListLoading(false));
  }, []);

  /**
   * Persist all current settings to the database.
   * Shows a progress bar while saving; button greys out on success.
   */
  const saveSettings = useCallback(async (w, h, btn, btnText, count, g1e, g1c, g2e, g2c, g3e, g3c) => {
    setSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardWMult: w, cardHMult: h, uploadBtnMult: btn, uploadBtnText: btnText, cardCount: count,
          glow1Enabled: g1e, glow1Color: g1c,
          glow2Enabled: g2e, glow2Color: g2c,
          glow3Enabled: g3e, glow3Color: g3c,
        }),
      });
      dbSettings.current = { cardWMult: w, cardHMult: h, uploadBtnMult: btn, uploadBtnText: btnText, cardCount: count, glow1Enabled: g1e, glow1Color: g1c, glow2Enabled: g2e, glow2Color: g2c, glow3Enabled: g3e, glow3Color: g3c };
      setSettingsDirty(false);
    } catch (e) {
      console.error("Failed to save settings", e);
      setToast({ msg: "Failed to save settings", ok: false });
    } finally {
      setSaving(false);
    }
  }, []);

  /** Revert all settings state to the last-saved DB values. */
  const cancelSettings = useCallback(() => {
    const s = dbSettings.current;
    setCardWMult(s.cardWMult);
    setCardHMult(s.cardHMult);
    setUploadBtnMult(s.uploadBtnMult);
    setUploadBtnText(s.uploadBtnText);
    setCardCount(s.cardCount);
    setGlow1Enabled(s.glow1Enabled);
    setGlow1Color(s.glow1Color);
    setGlow2Enabled(s.glow2Enabled);
    setGlow2Color(s.glow2Color);
    setGlow3Enabled(s.glow3Enabled);
    setGlow3Color(s.glow3Color);
    setSettingsDirty(false);
  }, []);

  const persist = useCallback(async (gameId, entry) => {
    try {
      const updated = await apiFetch(`/list/${gameId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      setMyList(p => ({ ...p, [gameId]: { ...p[gameId], ...updated } }));
    } catch (e) {
      console.error("Failed to save entry", e);
    }
  }, []);

  const addToList = (game, status) => {
    const existing = myList[game.id] || {};
    const next = { ...existing, game, status };
    setMyList(p => ({ ...p, [game.id]: next }));
    persist(game.id, next);
  };

  const removeFromList = async (id) => {
    setMyList(p => { const n = { ...p }; delete n[id]; return n; });
    await apiFetch(`/list/${id}`, { method: "DELETE" });
  };

  const toggleFav = (id) => {
    const entry = myList[id];
    if (!entry) return;
    const starring = !entry.favourite;
    const next = {
      ...entry,
      favourite:  starring,
      status:     starring ? 1 : entry.status,
      userRating: starring && entry.userRating == null ? 10 : entry.userRating,
    };
    setMyList(p => ({ ...p, [id]: next }));
    persist(id, next);
  };

  const rateGame = (id, v) => {
    const entry = myList[id];
    const next = { ...entry, userRating: v, status: v != null ? 1 : entry.status };
    setMyList(p => ({ ...p, [id]: next }));
    persist(id, next);
  };

  const handleCoverUploaded = (id) => {
    setMyList(p => ({ ...p, [id]: { ...p[id], hasCover: true } }));
  };

  const doSearch = async () => {
    if (!query.trim()) return;
    setTab("search");
    setSearched(true);
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const games = await apiFetch(`/games/search?q=${encodeURIComponent(query)}`);
      if (!games.length) throw new Error("No results found.");
      setSearchResults(games);
    } catch {
      setSearchError("Could not reach the backend. Is backend.py running on port 5001?");
    } finally {
      setSearchLoading(false);
    }
  };

  // Derived list views
  const allEntries  = Object.values(myList);
  const favEntries  = allEntries.filter(e => e.favourite);
  const listEntries = statusFilter === null ? allEntries : allEntries.filter(e => e.status === statusFilter);

  /**
   * Favourites entries in drag-and-drop order.
   * IDs in favOrder that are still favourites come first (in order),
   * then any newly starred entries appended at the end.
   */
  const orderedFavEntries = useMemo(() => {
    if (!favOrder.length) return favEntries;
    const favMap = Object.fromEntries(favEntries.map(e => [String(e.game.id), e]));
    const ordered  = favOrder.map(id => favMap[String(id)]).filter(Boolean);
    const orderedIds = new Set(favOrder.map(String));
    const extras   = favEntries.filter(e => !orderedIds.has(String(e.game.id)));
    return [...ordered, ...extras];
  }, [favEntries, favOrder]);

  /** Called by FavGrid when a card is dragged onto another — reorders the list. */
  const reorderFavs = (fromId, toId) => {
    const allIds = orderedFavEntries.map(e => String(e.game.id));
    const from   = allIds.indexOf(String(fromId));
    const to     = allIds.indexOf(String(toId));
    if (from === -1 || to === -1 || from === to) return;
    const next = [...allIds];
    next.splice(from, 1);
    next.splice(to, 0, String(fromId));
    localStorage.setItem("gamilist-fav-order", JSON.stringify(next));
    setFavOrder(next);
  };

  const TABS = [
    { id: "mylist",   label: `My List${allEntries.length ? ` (${allEntries.length})` : ""}` },
    { id: "favs",     label: `Favourites${favEntries.length ? ` (${favEntries.length})` : ""}` },
    { id: "search",   label: "Search" },
    { id: "settings", label: "⚙ Settings" },
  ];

  // Pixel dimensions derived from the multipliers set in Settings
  const cardW = Math.round(210 * cardWMult);
  const cardH = Math.round(170 * cardHMult);

  /**
   * Maximum columns that physically fit given the current card width and viewport.
   * Formula: floor((containerWidth + gap) / (cardW + gap))
   * Container = windowWidth - 56px padding. Gap = 20px.
   */
  const maxFitCols = Math.max(1, Math.floor((windowWidth - 56 + 20) / (cardW + 20)));

  /**
   * Effective column count used in grids.
   * When cardCount is set to a number higher than fits, silently cap it so cards
   * remain equal-width rather than overflowing or shrinking below the card width.
   */
  const effectiveCardCount = cardCount > 0 ? Math.min(cardCount, maxFitCols) : 0;

  // Settings updaters — apply change live and mark dirty
  const updateW          = (v) => { setCardWMult(v);       setSettingsDirty(true); };
  const updateH          = (v) => { setCardHMult(v);       setSettingsDirty(true); };
  const updateBtn        = (v) => { setUploadBtnMult(v);   setSettingsDirty(true); };
  const updateCount      = (v) => { setCardCount(v);       setSettingsDirty(true); };
  const updateBtnText    = (v) => { setUploadBtnText(v);   setSettingsDirty(true); };
  const updateGlow1E     = (v) => { setGlow1Enabled(v);    setSettingsDirty(true); };
  const updateGlow1C     = (v) => { setGlow1Color(v);      setSettingsDirty(true); };
  const updateGlow2E     = (v) => { setGlow2Enabled(v);    setSettingsDirty(true); };
  const updateGlow2C     = (v) => { setGlow2Color(v);      setSettingsDirty(true); };
  const updateGlow3E     = (v) => { setGlow3Enabled(v);    setSettingsDirty(true); };
  const updateGlow3C     = (v) => { setGlow3Color(v);      setSettingsDirty(true); };

  // Glow config array passed to FavGrid — index 0 = 1st place, etc.
  const glowConfig = [
    { enabled: glow1Enabled, color: glow1Color },
    { enabled: glow2Enabled, color: glow2Color },
    { enabled: glow3Enabled, color: glow3Color },
  ];

  // Shared props passed to every Grid / FavGrid
  const gridProps = { myList, onAdd: addToList, onRemove: removeFromList, onToggleFav: toggleFav, onRate: rateGame, onCoverUploaded: handleCoverUploaded, cardW, cardH, uploadBtnMult, uploadBtnText, effectiveCardCount };

  // Games used in the Settings preview — favourites first, fall back to all entries
  const previewEntries = orderedFavEntries.length ? orderedFavEntries : allEntries;

  return (
    <div style={{ minHeight: "100vh", background: "#080814", color: "#e0e0f0", fontFamily: "'Nunito', 'system-ui', sans-serif" }}>

      {/* Global styles */}
      <style>{`
        @keyframes progressFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastIn  { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
        @keyframes toastOut { from { opacity: 1; } to { opacity: 0; } }
        * { box-sizing: border-box; }
        input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type=color]::-webkit-color-swatch { border: none; border-radius: 3px; }
      `}</style>

      {/* ── Toast notification (errors only now) ── */}
      {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}

      {/* ── Sticky header ── */}
      <div style={{ background: "#0c0c1c", borderBottom: "1px solid #16162a", padding: "0 28px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", height: 62, gap: 20 }}>
          <span style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 20, color: "#7c6ef7", whiteSpace: "nowrap" }}>GamiList</span>
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: tab===t.id ? "#7c6ef722" : "transparent", color: tab===t.id ? "#7c6ef7" : "#555", cursor: "pointer", fontWeight: tab===t.id ? 700 : 400, fontSize: 13, whiteSpace: "nowrap", fontFamily: "inherit" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder="Search any game…"
              style={{ width: 230, background: "#12121e", border: "1px solid #1e1e35", borderRadius: 8, padding: "8px 14px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <button onClick={doSearch} disabled={searchLoading}
              style={{ padding: "8px 18px", background: "#7c6ef7", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: searchLoading ? "not-allowed" : "pointer", opacity: searchLoading ? 0.6 : 1, whiteSpace: "nowrap", fontFamily: "inherit" }}>
              Search
            </button>
          </div>
        </div>
      </div>

      {/* ── Backend connectivity warning ── */}
      {backendOk === false && (
        <div style={{ background: "#1a0c0c", borderBottom: "1px solid #ff333333", padding: "10px 28px", fontSize: 13, color: "#ff8080" }}>
          ⚠ Backend not detected. Run <code style={{ background: "#2a1010", padding: "1px 6px", borderRadius: 4 }}>python backend.py</code> then refresh.
        </div>
      )}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "30px 28px 70px" }}>

        {/* ── My List tab ── */}
        {tab === "mylist" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 20 }}>My List</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 28 }}>
              {STATUSES.map(s => {
                const cnt    = allEntries.filter(e => e.status === s.id).length;
                const active = statusFilter === s.id;
                return (
                  <div key={s.id} onClick={() => setStatusFilter(active ? null : s.id)}
                    style={{ background: active ? s.bg : "#0c0c1c", border: `1px solid ${active ? s.color + "66" : "#1a1a2e"}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", transition: "all 0.15s", userSelect: "none" }}>
                    <div style={{ fontSize: 10, color: s.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{cnt}</div>
                  </div>
                );
              })}
            </div>

            {statusFilter !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 13, color: STATUSES[statusFilter].color, fontWeight: 700 }}>Filtering: {STATUSES[statusFilter].label}</span>
                <button onClick={() => setStatusFilter(null)} style={{ fontSize: 11, color: "#555", background: "transparent", border: "1px solid #1e1e30", borderRadius: 5, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
              </div>
            )}

            {listLoading
              ? <Spinner text="Loading your list…" />
              : <Grid games={listEntries.map(e => e.game)} {...gridProps} emptyMsg="Nothing here yet — search for games to add them!" />
            }
          </>
        )}

        {/* ── Favourites tab ── */}
        {tab === "favs" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 4 }}>Favourites</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 28 }}>
              Star ★ any game from your list to add it here. Drag cards to reorder them.
            </div>
            <FavGrid entries={orderedFavEntries} glowConfig={glowConfig} {...gridProps} onReorder={reorderFavs} />
          </>
        )}

        {/* ── Settings tab ── */}
        {tab === "settings" && (
          <>
            {/* Header row: title + save/cancel buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: saving ? 8 : 28, flexWrap: "wrap" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff" }}>Settings</div>

              <button
                onClick={() => saveSettings(cardWMult, cardHMult, uploadBtnMult, uploadBtnText, cardCount, glow1Enabled, glow1Color, glow2Enabled, glow2Color, glow3Enabled, glow3Color)}
                disabled={!settingsDirty || saving}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13,
                  cursor: settingsDirty && !saving ? "pointer" : "not-allowed",
                  background: settingsDirty && !saving ? "#7c6ef7" : "#1a1a2e",
                  color:      settingsDirty && !saving ? "#fff"    : "#444",
                  transition: "background 0.2s, color 0.2s",
                  fontFamily: "inherit",
                }}>
                {saving ? "Saving…" : "Save Settings"}
              </button>

              {settingsDirty && !saving && (
                <button onClick={cancelSettings}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                  Cancel
                </button>
              )}

              {settingsDirty && !saving && (
                <span style={{ fontSize: 12, color: "#444" }}>Unsaved changes</span>
              )}
            </div>

            {/* Progress bar — shown while the save API call is in flight */}
            {saving && (
              <div style={{ height: 3, background: "#1a1a2e", borderRadius: 2, marginBottom: 28, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: "100%",
                  background: "linear-gradient(90deg, #7c6ef7, #a78bfa)",
                  transformOrigin: "left",
                  animation: "progressFill 0.5s ease-out forwards",
                }} />
              </div>
            )}

            {/* Settings panels row */}
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 40 }}>

              {/* ── Card Settings panel ── */}
              <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Card Settings</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                  Control card dimensions and grid layout. Width and Height scale each card from a
                  base size. Columns sets a fixed column count — set to Auto to fill based on width.
                  The column limit adjusts automatically to fit your screen.
                </div>

                {[
                  { label: "Width",  value: cardWMult, onChange: updateW, color: "#7c6ef7" },
                  { label: "Height", value: cardHMult, onChange: updateH, color: "#38bdf8" },
                ].map(({ label, value, onChange, color }) => (
                  <div key={label} style={{ marginBottom: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
                      <span style={{ fontSize: 12, color, fontWeight: 700 }}>{value.toFixed(1)}×</span>
                    </div>
                    <input type="range" min="0.25" max="5" step="0.05" value={value}
                      onChange={e => onChange(parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                      {["0.25×","1×","2×","3×","5×"].map(m => <span key={m}>{m}</span>)}
                    </div>
                  </div>
                ))}

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Columns</span>
                    <span style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700 }}>
                      {cardCount === 0 ? "Auto" : `${effectiveCardCount}${effectiveCardCount < cardCount ? ` (max ${maxFitCols})` : ""}`}
                    </span>
                  </div>
                  <input type="range" min="0" max={maxFitCols} step="1" value={Math.min(cardCount, maxFitCols)}
                    onChange={e => updateCount(parseInt(e.target.value))}
                    style={{ width: "100%", accentColor: "#a78bfa", cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                    <span>Auto</span>
                    <span style={{ marginLeft: "auto" }}>Max {maxFitCols}</span>
                  </div>
                </div>
              </div>

              {/* ── Cover Upload Button panel ── */}
              <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Cover Upload Button</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                  Adjusts the size and label of the upload button on the bottom-right of each card.
                  Leave the label field empty to show the default 📷 icon.
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Size</span>
                    <span style={{ fontSize: 12, color: "#e6a63a", fontWeight: 700 }}>{uploadBtnMult.toFixed(1)}×</span>
                  </div>
                  <input type="range" min="0.5" max="4" step="0.05" value={uploadBtnMult}
                    onChange={e => updateBtn(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#e6a63a", cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                    <span>0.5×</span><span>1×</span><span>2×</span><span>3×</span><span>4×</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Button Label</div>
                  <input
                    type="text"
                    value={uploadBtnText}
                    onChange={e => updateBtnText(e.target.value)}
                    placeholder="Leave empty to show 📷 icon"
                    maxLength={24}
                    style={{ width: "100%", background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "7px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit" }}
                  />
                </div>
              </div>

              {/* ── Glow Settings panel ── */}
              <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Top Favourites Glow</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                  The first three cards in your Favourites list get a glowing border and background.
                  Pick a color and toggle each rank on or off independently.
                </div>

                <GlowRow rank="1" label="1st place"
                  enabled={glow1Enabled} color={glow1Color}
                  onToggle={() => updateGlow1E(!glow1Enabled)}
                  onColor={updateGlow1C} />
                <GlowRow rank="2" label="2nd place"
                  enabled={glow2Enabled} color={glow2Color}
                  onToggle={() => updateGlow2E(!glow2Enabled)}
                  onColor={updateGlow2C} />
                <GlowRow rank="3" label="3rd place"
                  enabled={glow3Enabled} color={glow3Color}
                  onToggle={() => updateGlow3E(!glow3Enabled)}
                  onColor={updateGlow3C} />

                <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 14, marginTop: 2 }}>
                  <div style={{ fontSize: 11, color: "#333", lineHeight: 1.6 }}>
                    Reorder Favourites by dragging cards on the Favourites tab.
                  </div>
                </div>
              </div>

            </div>

            {/* ── Full-width preview at the bottom ── */}
            <div style={{ borderTop: "1px solid #16162a", paddingTop: 28 }}>
              <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
                Preview {effectiveCardCount > 0 ? `— ${effectiveCardCount} column${effectiveCardCount > 1 ? "s" : ""}` : "— Auto columns"}
              </div>
              {previewEntries.length > 0
                ? (() => {
                    const count = effectiveCardCount > 0 ? effectiveCardCount : Math.min(4, maxFitCols);
                    const entries = Array.from({ length: count }, (_, i) => previewEntries[i % previewEntries.length]);
                    const cols    = effectiveCardCount > 0 ? `repeat(${effectiveCardCount}, 1fr)` : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20 }}>
                        {entries.map((e, i) => (
                          <GameCard key={i} game={e.game} listEntry={e} cardH={cardH}
                            uploadBtnMult={uploadBtnMult} uploadBtnText={uploadBtnText}
                            glowColor={i < 3 && glowConfig[i]?.enabled ? glowConfig[i].color : null}
                            onAdd={addToList} onRemove={removeFromList} onToggleFav={toggleFav}
                            onRate={rateGame} onCoverUploaded={handleCoverUploaded} />
                        ))}
                      </div>
                    );
                  })()
                : <div style={{ padding: "60px 0", textAlign: "center", color: "#333", fontSize: 13, border: "1px dashed #1a1a2e", borderRadius: 12 }}>
                    Add games to your list to see a preview here
                  </div>
              }
            </div>
          </>
        )}

        {/* ── Search tab ── */}
        {tab === "search" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>
              {searched ? `Results for "${query}"` : "Search Games"}
            </div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 28 }}>
              {searched && !searchLoading ? `${searchResults.length} games found` : "Type a game title, genre, or keyword above."}
            </div>
            {searchError && <div style={{ color: "#ff6060", background: "#1e0c0c", border: "1px solid #ff333322", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 13 }}>{searchError}</div>}
            {searchLoading
              ? <Spinner text="Searching games…" />
              : <Grid games={searchResults} {...gridProps} emptyMsg="Use the search bar above to find games." />
            }
          </>
        )}

      </div>
    </div>
  );
}
