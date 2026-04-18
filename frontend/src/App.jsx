/**
 * GamiList — React Frontend (single-file SPA)
 *
 * A game tracking app backed by Flask + PostgreSQL.
 * All API calls go through the VITE_API_URL environment variable which is
 * baked into the static bundle at Docker build time (see Dockerfile).
 *
 * Tabs:
 *   My List   — games the user has added, filterable by status
 *   Favourites — starred games
 *   Search    — RAWG-powered game search
 *   Settings  — card size, column count, and upload button size sliders (persisted in the database via Save button)
 */

import { useState, useRef, useEffect, useCallback } from "react";

// Base API URL — set VITE_API_URL at build time for production.
// Falls back to localhost:5001 for running the frontend locally with `npm run dev`.
const API = (import.meta.env.VITE_API_URL || "http://localhost:5001") + "/api";

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

  // Auto-focus the input when entering edit mode
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => {
    const v = parseFloat(input);
    // Clamp to [0, 10] and round to 1 decimal place; null if invalid
    onChange(!isNaN(v) ? Math.min(10, Math.max(0, Math.round(v * 10) / 10)) : null);
    setEditing(false);
  };

  if (editing) return (
    <input ref={ref} value={input} onChange={e => setInput(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      placeholder="0–10"
      style={{ width: 52, background: "#0a0a14", border: "1px solid #7c6ef7", borderRadius: 4, color: "#e0e0f0", fontSize: 12, padding: "2px 5px", outline: "none" }} />
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
 * Renders as a camera button overlaid on the bottom-right of the card image.
 * After a successful upload, calls onUploaded() so the parent can refresh the cover.
 *
 * Props:
 *   gameId      — ID of the game entry to attach the cover to
 *   onUploaded  — callback fired after a successful upload
 *   sizeMult    — multiplier controlling the button's font size and padding (default 1)
 */
function CoverUpload({ gameId, onUploaded, sizeMult = 1 }) {
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
      e.target.value = ""; // reset so the same file can be re-uploaded
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
        }}>
        {uploading ? "…" : ""}
      </button>
    </>
  );
}

/**
 * Single game card displayed in a grid.
 *
 * Shows:
 *   - Cover image (custom upload takes priority over RAWG artwork)
 *   - Favourite star toggle (top-left, only when in list)
 *   - Status badge (top-right, only when in list)
 *   - Game title, RAWG community rating, release year, genres
 *   - Personal rating input (only when in list)
 *   - Status dropdown / "Add to list" button
 *   - Cover upload button (only when in list)
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
 */
function GameCard({ game, listEntry, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, cardH = 255, uploadBtnMult = 1 }) {
  const [hover, setHover]       = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [imgErr, setImgErr]     = useState(false);

  // Incremented after a cover upload to bust the browser's image cache
  const [coverKey, setCoverKey] = useState(0);

  const menuRef = useRef();
  const status   = listEntry?.status ?? null;
  const isFav    = listEntry?.favourite || false;
  const hasCover = listEntry?.hasCover || false;

  // Close the status dropdown when clicking outside the card
  useEffect(() => {
    if (!showMenu) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMenu]);

  // Prefer custom cover; fall back to RAWG image proxied through the backend
  const cover = hasCover
    ? `${coverSrc(game.id)}?v=${coverKey}`
    : rawgImgSrc(game.background_image);

  const handleCoverUploaded = () => {
    setCoverKey(k => k + 1); // force img re-fetch
    onCoverUploaded(game.id);
  };

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ borderRadius: 12, overflow: "visible", background: "#10101e", border: `1px solid ${hover ? "#2e2e50" : "#1a1a2e"}`, transition: "transform 0.15s, box-shadow 0.15s", transform: hover ? "translateY(-4px)" : "none", boxShadow: hover ? "0 8px 30px rgba(0,0,0,0.5)" : "none", position: "relative" }}>

      {/* Cover image area */}
      <div style={{ height: cardH, borderRadius: "12px 12px 0 0", overflow: "hidden", background: "#080814", position: "relative" }}>
        {cover && !imgErr
          ? <img src={cover} alt={game.name} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 36 }}>🎮</span>
              <span style={{ fontSize: 11, color: "#333", textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>{game.name}</span>
            </div>
        }

        {/* Favourite star — only visible for games in the list */}
        {listEntry && (
          <button onClick={e => { e.stopPropagation(); onToggleFav(game.id); }}
            style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: isFav ? "#e6a63a" : "#666" }}>
            {isFav ? "★" : "☆"}
          </button>
        )}

        {/* Status badge — top-right corner */}
        {status !== null && (
          <div style={{ position: "absolute", top: 8, right: 8, background: STATUSES[status].color + "dd", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
            {STATUSES[status].label}
          </div>
        )}

        {/* Cover upload button — bottom-right corner, only for listed games */}
        {listEntry && <CoverUpload gameId={game.id} onUploaded={handleCoverUploaded} sizeMult={uploadBtnMult} />}
      </div>

      {/* Card body */}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#eeeeff", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={game.name}>{game.name}</div>

        {/* RAWG community rating + release year */}
        {(game.rating > 0 || game.released) && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            {game.rating > 0 && <>
              <StarRating rating={game.rating} />
              <span style={{ fontSize: 11, color: "#555" }}>{game.rating.toFixed(1)}</span>
            </>}
            {game.released && <span style={{ fontSize: 11, color: "#3a3a5a", marginLeft: "auto" }}>{game.released.slice(0,4)}</span>}
          </div>
        )}

        {/* Genre tags — capped at 2 to keep the card compact */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {game.genres?.slice(0,2).map((g,i) => (
            <span key={i} style={{ fontSize: 10, background: "#161628", color: "#5555aa", borderRadius: 4, padding: "2px 7px" }}>{g.name}</span>
          ))}
        </div>

        {/* Personal rating input — only visible for listed games */}
        {listEntry && (
          <div style={{ marginBottom: 10 }}>
            <RatingInput value={listEntry.userRating ?? null} onChange={v => onRate(game.id, v)} />
          </div>
        )}

        {/* Status dropdown — doubles as "Add to list" button for unlisted games */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setShowMenu(v => !v)}
            style={{ width: "100%", padding: "7px 11px", borderRadius: 8, border: `1px solid ${status !== null ? STATUSES[status].color + "44" : "#1e1e35"}`, background: status !== null ? STATUSES[status].bg : "#0a0a14", color: status !== null ? STATUSES[status].color : "#555", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>{status !== null ? STATUSES[status].label : "＋ Add to list"}</span>
            <span style={{ opacity: 0.6, fontSize: 9 }}>▾</span>
          </button>

          {/* Status menu — opens upward to avoid clipping at the bottom of the viewport */}
          {showMenu && (
            <div style={{ position: "absolute", bottom: "calc(100% + 5px)", left: 0, right: 0, background: "#10101e", border: "1px solid #2a2a40", borderRadius: 10, overflow: "hidden", zIndex: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>
              {STATUSES.map(s => (
                <button key={s.id} onClick={() => { onAdd(game, s.id); setShowMenu(false); }}
                  style={{ width: "100%", padding: "8px 14px", border: "none", background: status === s.id ? s.bg : "transparent", color: s.color, cursor: "pointer", fontSize: 12, textAlign: "left", fontWeight: status === s.id ? 700 : 400, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, opacity: status === s.id ? 1 : 0 }}>✓</span>{s.label}
                </button>
              ))}

              {/* Remove from list option — only shown when the game is already listed */}
              {status !== null && <>
                <div style={{ height: 1, background: "#1a1a30" }} />
                <button onClick={() => { onRemove(game.id); setShowMenu(false); }}
                  style={{ width: "100%", padding: "8px 14px", border: "none", background: "transparent", color: "#ff6060", cursor: "pointer", fontSize: 12, textAlign: "left" }}>
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
 * Renders an empty-state message when the games array is empty.
 *
 * cardCount === 0 → auto-fill columns based on cardW (responsive)
 * cardCount  >  0 → fixed number of columns regardless of viewport width
 */
function Grid({ games, myList, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, emptyMsg, cardW, cardH, uploadBtnMult, cardCount }) {
  if (!games.length) return <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>{emptyMsg}</div>;
  const cols = cardCount > 0
    ? `repeat(${cardCount}, 1fr)`
    : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20 }}>
      {games.map(g => (
        <GameCard key={g.id} game={g} listEntry={myList[g.id] || null} cardH={cardH} uploadBtnMult={uploadBtnMult}
          onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate} onCoverUploaded={onCoverUploaded} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App component
// ---------------------------------------------------------------------------

/**
 * Root component — owns all state and orchestrates API calls.
 *
 * State:
 *   tab           — active tab ("mylist" | "favs" | "search" | "settings")
 *   cardWMult     — card width multiplier (persisted in DB via /api/settings)
 *   cardHMult     — card height multiplier (persisted in DB via /api/settings)
 *   uploadBtnMult — cover upload button size multiplier (persisted in DB)
 *   cardCount     — fixed column count; 0 = auto-fill (persisted in DB)
 *   settingsDirty — true when sliders have been moved but not yet saved
 *   settingsSaved — brief "Saved ✓" flash state after a successful save
 *   statusFilter  — integer status ID to filter My List, or null for all
 *   query         — current search input value
 *   searchResults — array of RAWG game objects from the last search
 *   myList        — object keyed by game_id, values are list entries from the API
 *   backendOk     — null (loading) | true | false — drives the warning banner
 */
export default function App() {
  const [tab, setTab]                     = useState("mylist");
  const [cardWMult, setCardWMult]         = useState(1.5);
  const [cardHMult, setCardHMult]         = useState(1.5);
  const [uploadBtnMult, setUploadBtnMult] = useState(1.0);
  const [cardCount, setCardCount]         = useState(0);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [statusFilter, setStatusFilter]   = useState(null);
  const [query, setQuery]               = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]   = useState(null);
  const [searched, setSearched]         = useState(false);
  const [myList, setMyList]             = useState({});
  const [listLoading, setListLoading]   = useState(true);
  const [backendOk, setBackendOk]       = useState(null);

  // Ref used to clear the "Saved ✓" flash timeout on unmount
  const savedTimer = useRef(null);

  // Load settings and game list from the database on first render
  useEffect(() => {
    apiFetch("/settings")
      .then(s => {
        setCardWMult(s.cardWMult);
        setCardHMult(s.cardHMult);
        setUploadBtnMult(s.uploadBtnMult);
        setCardCount(s.cardCount ?? 0);
      })
      .catch(() => {}); // non-fatal — defaults are already set in state

    apiFetch("/list")
      .then(data => { setMyList(data); setBackendOk(true); })
      .catch(() => setBackendOk(false))
      .finally(() => setListLoading(false));

    return () => { if (savedTimer.current) clearTimeout(savedTimer.current); };
  }, []);

  /**
   * Persist all current settings to the database.
   * Called explicitly when the user clicks the Save button.
   * Shows a "Saved ✓" flash for 2 seconds after a successful save.
   */
  const saveSettings = useCallback(async (w, h, btn, count) => {
    try {
      await apiFetch("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardWMult: w, cardHMult: h, uploadBtnMult: btn, cardCount: count }),
      });
      setSettingsDirty(false);
      setSettingsSaved(true);
      savedTimer.current = setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  }, []);

  /**
   * Persist a list entry to the database and merge the returned row back into
   * local state. Wrapped in useCallback so it can be passed to child components
   * without causing unnecessary re-renders.
   */
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

  /** Add a game to the list with the given status, or change its status. */
  const addToList = (game, status) => {
    const existing = myList[game.id] || {};
    const next = { ...existing, game, status };
    setMyList(p => ({ ...p, [game.id]: next })); // optimistic update
    persist(game.id, next);
  };

  /** Remove a game from the list (optimistic delete, then API call). */
  const removeFromList = async (id) => {
    setMyList(p => { const n = { ...p }; delete n[id]; return n; });
    await apiFetch(`/list/${id}`, { method: "DELETE" });
  };

  /**
   * Toggle the favourite flag on a list entry.
   * When starring (not un-starring):
   *   - Status is automatically set to Played (1) since favouriting implies completion.
   *   - Rating is set to 10 if none exists yet, as a convenience default.
   */
  const toggleFav = (id) => {
    const entry = myList[id];
    if (!entry) return;
    const wasFav = entry.favourite;
    const starring = !wasFav;
    const next = {
      ...entry,
      favourite: starring,
      status:    starring ? 1 : entry.status,           // auto-Played when starring
      userRating: starring && entry.userRating == null ? 10 : entry.userRating,
    };
    setMyList(p => ({ ...p, [id]: next }));
    persist(id, next);
  };

  /**
   * Update the user's personal rating for a listed game.
   * Setting any non-null rating automatically marks the game as Played (1),
   * since rating implies the user has experience with the game.
   */
  const rateGame = (id, v) => {
    const entry = myList[id];
    const next = {
      ...entry,
      userRating: v,
      status: v != null ? 1 : entry.status,  // auto-Played when a rating is set
    };
    setMyList(p => ({ ...p, [id]: next }));
    persist(id, next);
  };

  /** Called by CoverUpload after a successful upload to flip hasCover to true in local state. */
  const handleCoverUploaded = (id) => {
    setMyList(p => ({ ...p, [id]: { ...p[id], hasCover: true } }));
  };

  /** Execute a RAWG game search and switch to the Search tab. */
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

  const TABS = [
    { id: "mylist",   label: `My List${allEntries.length ? ` (${allEntries.length})` : ""}` },
    { id: "favs",     label: `Favourites${favEntries.length ? ` (${favEntries.length})` : ""}` },
    { id: "search",   label: "Search" },
    { id: "settings", label: "⚙ Settings" },
  ];

  // Pixel dimensions derived from the multipliers set in Settings
  const cardW = Math.round(210 * cardWMult);
  const cardH = Math.round(170 * cardHMult);

  // Slider updaters — update live state immediately; mark dirty so Save button appears
  const updateW   = (v) => { setCardWMult(v);       setSettingsDirty(true); };
  const updateH   = (v) => { setCardHMult(v);       setSettingsDirty(true); };
  const updateBtn = (v) => { setUploadBtnMult(v);   setSettingsDirty(true); };
  const updateCount = (v) => { setCardCount(v);     setSettingsDirty(true); };

  // First favourited game (or any listed game) used as the Settings preview card
  const previewFav = favEntries[0] || allEntries[0] || null;

  // Shared props passed to every Grid to avoid prop drilling
  const gridProps = { myList, onAdd: addToList, onRemove: removeFromList, onToggleFav: toggleFav, onRate: rateGame, onCoverUploaded: handleCoverUploaded, cardW, cardH, uploadBtnMult, cardCount };

  return (
    <div style={{ minHeight: "100vh", background: "#080814", color: "#e0e0f0", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Sticky header with nav tabs and search bar ── */}
      <div style={{ background: "#0c0c1c", borderBottom: "1px solid #16162a", padding: "0 28px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", height: 62, gap: 20 }}>
          <span style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 20, color: "#7c6ef7", whiteSpace: "nowrap" }}>GamiList</span>
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: tab===t.id ? "#7c6ef722" : "transparent", color: tab===t.id ? "#7c6ef7" : "#555", cursor: "pointer", fontWeight: tab===t.id ? 600 : 400, fontSize: 13, whiteSpace: "nowrap" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder="Search any game…"
              style={{ width: 230, background: "#12121e", border: "1px solid #1e1e35", borderRadius: 8, padding: "8px 14px", color: "#e0e0f0", fontSize: 13, outline: "none" }} />
            <button onClick={doSearch} disabled={searchLoading}
              style={{ padding: "8px 18px", background: "#7c6ef7", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: searchLoading ? "not-allowed" : "pointer", opacity: searchLoading ? 0.6 : 1, whiteSpace: "nowrap" }}>
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
            <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff", marginBottom: 20 }}>My List</div>

            {/* Status filter cards — click to filter the grid, click again to clear */}
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
                <span style={{ fontSize: 13, color: STATUSES[statusFilter].color, fontWeight: 600 }}>Filtering: {STATUSES[statusFilter].label}</span>
                <button onClick={() => setStatusFilter(null)} style={{ fontSize: 11, color: "#555", background: "transparent", border: "1px solid #1e1e30", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>Clear</button>
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
            <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff", marginBottom: 6 }}>Favourites</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 28 }}>Star ★ any game from your list to add it here.</div>
            <Grid games={favEntries.map(e => e.game)} {...gridProps} emptyMsg="No favourites yet. Add games to your list and star them!" />
          </>
        )}

        {/* ── Settings tab ── */}
        {tab === "settings" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff" }}>Settings</div>
              {/* Save button — only active when sliders have been moved */}
              <button
                onClick={() => saveSettings(cardWMult, cardHMult, uploadBtnMult, cardCount)}
                disabled={!settingsDirty}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: settingsDirty ? "pointer" : "not-allowed",
                  background: settingsSaved ? "#1a3a1a" : settingsDirty ? "#7c6ef7" : "#1a1a2e",
                  color:      settingsSaved ? "#4caf80" : settingsDirty ? "#fff"    : "#333",
                  transition: "all 0.2s",
                }}>
                {settingsSaved ? "Saved ✓" : "Save Settings"}
              </button>
              {settingsDirty && !settingsSaved && (
                <span style={{ fontSize: 12, color: "#555" }}>Unsaved changes</span>
              )}
            </div>

            <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>

              {/* ── Card Settings panel ── */}
              <div style={{ background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px", minWidth: 340 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#eeeeff", marginBottom: 6 }}>Card Settings</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 20 }}>
                  Control the dimensions of each game card and how many columns appear in the grid.
                  Width and Height scale from a base size; Columns overrides the responsive layout
                  with a fixed count (0 = auto-fill based on width).
                </div>

                {[
                  { label: "Width",  value: cardWMult,  onChange: updateW,   color: "#7c6ef7", min: "0.25", max: "5",   step: "0.05", marks: ["0.25×","1×","2×","3×","5×"] },
                  { label: "Height", value: cardHMult,  onChange: updateH,   color: "#38bdf8", min: "0.25", max: "5",   step: "0.05", marks: ["0.25×","1×","2×","3×","5×"] },
                ].map(({ label, value, onChange, color, min, max, step, marks }) => (
                  <div key={label} style={{ marginBottom: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
                      <span style={{ fontSize: 12, color, fontWeight: 700 }}>{value.toFixed(1)}×</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={value}
                      onChange={e => onChange(parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                      {marks.map(m => <span key={m}>{m}</span>)}
                    </div>
                  </div>
                ))}

                {/* Columns slider — 0 means auto */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Columns</span>
                    <span style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700 }}>
                      {cardCount === 0 ? "Auto" : cardCount}
                    </span>
                  </div>
                  <input type="range" min="0" max="8" step="1" value={cardCount}
                    onChange={e => updateCount(parseInt(e.target.value))}
                    style={{ width: "100%", accentColor: "#a78bfa", cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                    <span>Auto</span><span>2</span><span>4</span><span>6</span><span>8</span>
                  </div>
                </div>
              </div>

              {/* ── Cover Upload Button panel ── */}
              <div style={{ background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px", minWidth: 340 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#eeeeff", marginBottom: 6 }}>Cover Upload Button</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 20 }}>
                  Adjusts the size of the  button that appears on the bottom-right of each card.
                  Increase it if the default is too small to tap comfortably.
                </div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Size</span>
                    <span style={{ fontSize: 12, color: "#e6a63a", fontWeight: 700 }}>{uploadBtnMult.toFixed(1)}×</span>
                  </div>
                  <input type="range" min="0.5" max="4" step="0.05" value={uploadBtnMult}
                    onChange={e => updateBtn(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#e6a63a", cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                    <span>0.5×</span><span>1×</span><span>2×</span><span>3×</span><span>4×</span>
                  </div>
                </div>
              </div>

              {/* ── Live preview — reflects all current slider values ── */}
              <div>
                <div style={{ fontSize: 12, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Preview</div>
                <div style={{ width: cardW }}>
                  {previewFav
                    ? <GameCard game={previewFav.game} listEntry={previewFav} cardH={cardH} uploadBtnMult={uploadBtnMult}
                        onAdd={addToList} onRemove={removeFromList} onToggleFav={toggleFav} onRate={rateGame} onCoverUploaded={handleCoverUploaded} />
                    : <div style={{ height: cardH + 120, background: "#0c0c1c", border: "1px dashed #1a1a2e", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 12 }}>
                        Add a game to your list to preview
                      </div>
                  }
                </div>
              </div>

            </div>
          </>
        )}

        {/* ── Search tab ── */}
        {tab === "search" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff", marginBottom: 6 }}>
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
