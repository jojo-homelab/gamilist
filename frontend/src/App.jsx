/**
 * GamiList — React Frontend (single-file SPA)
 *
 * Tabs:
 *   My List    — games the user has added, filterable by status
 *   Favourites — starred games, drag-and-drop orderable, top-3 glow effects
 *   Search     — RAWG-powered game search
 *   Settings   — card size, columns, upload button, glow, Steam integration
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// VITE_API_URL="" means "use relative paths" (production via ingress).
// Falls back to localhost:5001 only when the var is not set at all (local dev).
const API = (import.meta.env.VITE_API_URL ?? "http://localhost:5001") + "/api";

const STATUSES = [
  { id: 0, label: "Playing",        color: "#7c6ef7", bg: "#1a1730" },
  { id: 1, label: "Played",         color: "#4caf80", bg: "#112418" },
  { id: 2, label: "Next To Play",   color: "#e6a63a", bg: "#261d0a" },
  { id: 3, label: "Backlog",        color: "#e05c7a", bg: "#2a0f18" },
  { id: 4, label: "Replaying",      color: "#38bdf8", bg: "#0a1e2a" },
  { id: 5, label: "Plan to Replay", color: "#a78bfa", bg: "#1a1430" },
  { id: 6, label: "Dropped",        color: "#888",    bg: "#141414" },
];

const rawgImgSrc = (url) => url ? `${API}/image-proxy?url=${encodeURIComponent(url)}` : null;
const coverSrc   = (id)  => `${API}/list/${id}/cover`;

async function apiFetch(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
    } finally { setUploading(false); e.target.value = ""; }
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <button onClick={() => ref.current.click()} disabled={uploading}
        style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.7)", border: "1px solid #333", borderRadius: 6, padding: `${3*sizeMult}px ${8*sizeMult}px`, color: uploading ? "#555" : "#aaa", cursor: "pointer", fontSize: Math.round(10*sizeMult), fontFamily: "inherit" }}>
        {uploading ? "…" : (btnText || "📷")}
      </button>
    </>
  );
}

/**
 * GameCard — uniform height is achieved by making the outer div a flex column
 * and inserting a flex-grow spacer before the status button. This ensures the
 * status dropdown is always at the same vertical position in every card
 * regardless of how many optional fields (rating bar, genres, score) are present.
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

  const cover = hasCover ? `${coverSrc(game.id)}?v=${coverKey}` : rawgImgSrc(game.background_image);
  const handleCoverUploaded = () => { setCoverKey(k => k + 1); onCoverUploaded(game.id); };

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
        borderRadius: 12, overflow: "visible", position: "relative",
        display: "flex", flexDirection: "column",          // ← flex column so body stretches to fill grid row height
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
        transform: hover ? "translateY(-4px)" : "none",
        ...glowStyle,
      }}>

      {/* Cover image — fixed height */}
      <div style={{ height: cardH, borderRadius: "12px 12px 0 0", overflow: "hidden", background: "#080814", position: "relative", flexShrink: 0 }}>
        {cover && !imgErr
          ? <img src={cover} alt={game.name} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 36 }}>🎮</span>
              <span style={{ fontSize: 11, color: "#333", textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>{game.name}</span>
            </div>}
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

      {/* Card body — flex column; spacer pushes status button to the bottom */}
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#eeeeff", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={game.name}>{game.name}</div>

        {(game.rating > 0 || game.released) && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            {game.rating > 0 && <><StarRating rating={game.rating} /><span style={{ fontSize: 11, color: "#555" }}>{game.rating.toFixed(1)}</span></>}
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

        {/* Spacer — pushes the status dropdown to the bottom of the card body */}
        <div style={{ flex: 1 }} />

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

function Spinner({ text = "Loading…" }) {
  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <div style={{ display: "inline-block", width: 36, height: 36, border: "3px solid #1a1a30", borderTop: "3px solid #7c6ef7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "#555", fontSize: 13, marginTop: 14 }}>{text}</div>
    </div>
  );
}

function Grid({ games, myList, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, emptyMsg, cardW, cardH, uploadBtnMult, uploadBtnText, effectiveCardCount }) {
  if (!games.length) return <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>{emptyMsg}</div>;
  const cols = effectiveCardCount > 0 ? `repeat(${effectiveCardCount}, 1fr)` : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20 }}>
      {games.map(g => (
        <GameCard key={g.id} game={g} listEntry={myList[g.id] || null} cardH={cardH} uploadBtnMult={uploadBtnMult} uploadBtnText={uploadBtnText}
          onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate} onCoverUploaded={onCoverUploaded} />
      ))}
    </div>
  );
}

function FavGrid({ entries, glowConfig, myList, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, cardW, cardH, uploadBtnMult, uploadBtnText, effectiveCardCount, onReorder }) {
  const [dragOverId, setDragOverId] = useState(null);
  const dragId = useRef(null);
  if (!entries.length) return <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>No favourites yet. Add games to your list and star them!</div>;
  const cols = effectiveCardCount > 0 ? `repeat(${effectiveCardCount}, 1fr)` : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20 }}>
      {entries.map((e, i) => {
        const glow = i < 3 && glowConfig[i]?.enabled ? glowConfig[i].color : null;
        return (
          <div key={e.game.id} draggable
            onDragStart={() => { dragId.current = e.game.id; }}
            onDragEnd={() => { dragId.current = null; setDragOverId(null); }}
            onDragOver={ev => { ev.preventDefault(); if (dragId.current !== e.game.id) setDragOverId(e.game.id); }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={() => { setDragOverId(null); if (dragId.current != null && dragId.current !== e.game.id) onReorder(dragId.current, e.game.id); }}
            style={{ opacity: dragOverId === e.game.id ? 0.5 : 1, outline: dragOverId === e.game.id ? "2px dashed #7c6ef755" : "none", borderRadius: 12, cursor: "grab", transition: "opacity 0.15s" }}>
            <GameCard game={e.game} listEntry={e} cardH={cardH} uploadBtnMult={uploadBtnMult} uploadBtnText={uploadBtnText} glowColor={glow}
              onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate} onCoverUploaded={onCoverUploaded} />
          </div>
        );
      })}
    </div>
  );
}

function Toast({ msg, ok, onDone }) {
  return (
    <div onAnimationEnd={onDone} style={{ position: "fixed", top: 24, right: 28, zIndex: 1000, background: ok ? "#1a3a1a" : "#2a0a0a", border: `1px solid ${ok ? "#4caf8066" : "#ff606066"}`, color: ok ? "#4caf80" : "#ff8080", borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 700, boxShadow: "0 4px 24px rgba(0,0,0,0.6)", animation: "toastIn 0.2s ease, toastOut 0.3s ease 2.5s forwards", fontFamily: "inherit" }}>
      {ok ? "✓ " : "✗ "}{msg}
    </div>
  );
}

function GlowRow({ rank, label, enabled, color, onToggle, onColor }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: enabled ? `${color}22` : "#1a1a2e", border: `2px solid ${enabled ? color : "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: enabled ? color : "#444", transition: "all 0.2s" }}>{rank}</div>
      <span style={{ fontSize: 12, color: "#888", flex: 1 }}>{label}</span>
      <input type="color" value={color} onChange={e => onColor(e.target.value)} title="Pick glow color"
        style={{ width: 34, height: 26, border: "1px solid #2a2a40", borderRadius: 5, cursor: "pointer", background: "none", padding: 2 }} />
      <button onClick={onToggle} title={enabled ? "Disable" : "Enable"}
        style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: enabled ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: enabled ? 19 : 3, transition: "left 0.2s" }} />
      </button>
    </div>
  );
}

/**
 * Single row in the Steam category mapping table.
 * Pattern can include "(N)" to indicate the number in parentheses is a rating.
 * "Skip" marks games in this category to be ignored during import.
 */
function MappingRow({ mapping, onChange, onDelete }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px auto auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <input type="text" value={mapping.pattern} onChange={e => onChange({ ...mapping, pattern: e.target.value })}
        placeholder="e.g. Played (8)  or  Will Not Play"
        style={{ background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "6px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
      <select value={mapping.skip ? "__skip__" : (mapping.status ?? 1)} disabled={mapping.skip}
        onChange={e => onChange({ ...mapping, status: parseInt(e.target.value) })}
        style={{ background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "6px 8px", color: mapping.skip ? "#444" : "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit" }}>
        {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <label title="Skip — ignore games in this category during import"
        style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#666", cursor: "pointer", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={mapping.skip || false} onChange={e => onChange({ ...mapping, skip: e.target.checked })} />
        Skip
      </label>
      <button onClick={onDelete} style={{ background: "transparent", border: "1px solid #2a2a40", borderRadius: 5, color: "#555", cursor: "pointer", padding: "4px 8px", fontSize: 12, fontFamily: "inherit" }}>×</button>
    </div>
  );
}

/**
 * Steam library import panel.
 * Shows all owned Steam games, highlights which are already in GamiList,
 * and lets the user import the rest with a chosen status/rating.
 * Status is pre-filled based on playtime (>0 → Played, 0 → Backlog).
 * The "(N)" pattern in the user's mapping list is used to auto-fill ratings.
 */
function SteamLibrarySection({ library, steamMappings, myList, onImport, onRefresh }) {
  const [filter, setFilter]           = useState("new");  // "new" | "all"
  const [selections, setSelections]   = useState({});
  const [importing, setImporting]     = useState(false);

  // Initialise selections whenever the library changes
  useEffect(() => {
    if (!library) return;
    const init = {};
    for (const g of library.games) {
      if (!g.gamilist_id) {
        init[g.appid] = { checked: true, status: g.playtime_forever > 0 ? 1 : 3, rating: null };
      }
    }
    setSelections(init);
  }, [library]);

  if (!library) return null;

  const displayed = filter === "new"
    ? library.games.filter(g => !g.gamilist_id)
    : library.games;

  const checkedCount = Object.values(selections).filter(s => s.checked).length;

  const handleImport = async () => {
    setImporting(true);
    const toImport = library.games
      .filter(g => selections[g.appid]?.checked)
      .map(g => ({ ...g, ...selections[g.appid] }));
    await onImport(toImport);
    setImporting(false);
    onRefresh();
  };

  const setAll = (key, val) => {
    setSelections(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = { ...next[k], [key]: val };
      return next;
    });
  };

  const applyMapping = (mapping) => {
    const ratingMatch = mapping.pattern.match(/\((\d+(?:\.\d+)?)\)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
    setSelections(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = { ...next[k], status: mapping.status };
        if (rating !== null) next[k] = { ...next[k], rating };
      }
      return next;
    });
  };

  const formatHours = (mins) => {
    if (!mins) return "0h";
    const h = Math.round(mins / 60);
    return h < 1 ? `${mins}m` : `${h}h`;
  };

  return (
    <div style={{ marginTop: 24 }}>
      {/* Summary bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#888" }}>
          {library.total} games total · {library.games.filter(g => g.gamilist_id).length} already in GamiList · {library.games.filter(g => !g.gamilist_id).length} new
        </span>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {["new", "all"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: filter === f ? "#7c6ef733" : "transparent", color: filter === f ? "#7c6ef7" : "#555", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              {f === "new" ? "New only" : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Import controls */}
      {filter === "new" && displayed.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "10px 14px", background: "#0c0c1c", borderRadius: 8, border: "1px solid #1a1a2e" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", cursor: "pointer" }}>
            <input type="checkbox" checked={checkedCount === displayed.length} onChange={e => setAll("checked", e.target.checked)} />
            Select all
          </label>
          <span style={{ fontSize: 12, color: "#555" }}>{checkedCount} selected</span>
          <select onChange={e => setAll("status", parseInt(e.target.value))}
            style={{ background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "5px 8px", color: "#e0e0f0", fontSize: 12, fontFamily: "inherit", outline: "none" }}>
            <option value="" disabled>Set status for all…</option>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {steamMappings.filter(m => !m.skip).length > 0 && (
            <select defaultValue="" onChange={e => { const i = parseInt(e.target.value); if (!isNaN(i)) applyMapping(steamMappings[i]); e.target.value = ""; }}
              style={{ background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "5px 8px", color: "#e0e0f0", fontSize: 12, fontFamily: "inherit", outline: "none" }}>
              <option value="" disabled>Apply mapping…</option>
              {steamMappings.map((m, i) => !m.skip && (
                <option key={i} value={i}>{m.pattern} → {STATUSES[m.status]?.label}</option>
              ))}
            </select>
          )}
          <button onClick={handleImport} disabled={importing || checkedCount === 0}
            style={{ marginLeft: "auto", padding: "6px 18px", background: checkedCount > 0 ? "#7c6ef7" : "#1a1a2e", border: "none", borderRadius: 7, color: checkedCount > 0 ? "#fff" : "#444", fontWeight: 700, fontSize: 12, cursor: checkedCount > 0 ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {importing ? "Importing…" : `Import ${checkedCount}`}
          </button>
        </div>
      )}

      {/* Game list */}
      <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid #1a1a2e", borderRadius: 8 }}>
        {displayed.length === 0
          ? <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>All Steam games are already in your GamiList!</div>
          : displayed.map(g => {
              const inList   = !!g.gamilist_id;
              const sel      = selections[g.appid] || {};
              const iconUrl  = g.img_icon_url
                ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
                : null;
              return (
                <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid #0e0e1e", background: inList ? "#0a120a" : "transparent" }}>
                  {!inList && (
                    <input type="checkbox" checked={sel.checked || false}
                      onChange={e => setSelections(p => ({ ...p, [g.appid]: { ...p[g.appid], checked: e.target.checked } }))} />
                  )}
                  {inList && <span style={{ fontSize: 11, color: "#4caf80", width: 14, textAlign: "center" }}>✓</span>}
                  {iconUrl && <img src={iconUrl} alt="" style={{ width: 24, height: 24, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}
                  <span style={{ flex: 1, fontSize: 13, color: inList ? "#4caf8099" : "#e0e0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                  <span style={{ fontSize: 11, color: "#444", whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }}>{formatHours(g.playtime_forever)}</span>
                  {!inList && (
                    <>
                      {steamMappings.filter(m => !m.skip).length > 0 && (
                        <select defaultValue="" onChange={e => {
                          const i = parseInt(e.target.value);
                          if (isNaN(i)) return;
                          const m = steamMappings[i];
                          const rm = m.pattern.match(/\((\d+(?:\.\d+)?)\)/);
                          const rating = rm ? parseFloat(rm[1]) : undefined;
                          setSelections(p => ({ ...p, [g.appid]: { ...p[g.appid], status: m.status, ...(rating !== undefined ? { rating } : {}) } }));
                          e.target.value = "";
                        }} style={{ background: "#0a0a14", border: "1px solid #2a2a50", borderRadius: 5, padding: "3px 6px", color: "#7c6ef7", fontSize: 11, fontFamily: "inherit", outline: "none" }}>
                          <option value="" disabled>Category…</option>
                          {steamMappings.map((m, i) => !m.skip && <option key={i} value={i}>{m.pattern}</option>)}
                        </select>
                      )}
                      <select value={sel.status ?? 1}
                        onChange={e => setSelections(p => ({ ...p, [g.appid]: { ...p[g.appid], status: parseInt(e.target.value) } }))}
                        style={{ background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 5, padding: "3px 6px", color: STATUSES[sel.status ?? 1]?.color || "#e0e0f0", fontSize: 11, fontFamily: "inherit", outline: "none" }}>
                        {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <input type="number" min="0" max="10" step="0.5" placeholder="–" value={sel.rating ?? ""}
                        onChange={e => setSelections(p => ({ ...p, [g.appid]: { ...p[g.appid], rating: e.target.value ? parseFloat(e.target.value) : null } }))}
                        style={{ width: 46, background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 5, padding: "3px 6px", color: "#e6a63a", fontSize: 11, fontFamily: "inherit", outline: "none" }} />
                    </>
                  )}
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App component
// ---------------------------------------------------------------------------

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
  const [steamApiKey, setSteamApiKey]     = useState("");
  const [steamId, setSteamId]             = useState("");
  const [steamMappings, setSteamMappings] = useState([]);
  const [steamLibrary, setSteamLibrary]   = useState(null);
  const [steamSyncing, setSteamSyncing]   = useState(false);
  const [steamError, setSteamError]       = useState(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState(null);
  const [statusFilter, setStatusFilter]   = useState(null);
  const [windowWidth, setWindowWidth]     = useState(window.innerWidth);

  const [favOrder, setFavOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gamilist-fav-order") || "[]"); }
    catch { return []; }
  });

  const dbSettings = useRef({
    cardWMult: 1.5, cardHMult: 1.5, uploadBtnMult: 1.0, uploadBtnText: "", cardCount: 0,
    glow1Enabled: true, glow1Color: "#FFD700", glow2Enabled: true, glow2Color: "#C0C0C0", glow3Enabled: true, glow3Color: "#CD7F32",
    steamApiKey: "", steamId: "", steamMappings: [],
  });

  const [query, setQuery]               = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]   = useState(null);
  const [searched, setSearched]         = useState(false);
  const [myList, setMyList]             = useState({});
  const [listLoading, setListLoading]   = useState(true);
  const [backendOk, setBackendOk]       = useState(null);

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    apiFetch("/settings").then(s => {
      const loaded = {
        cardWMult:     s.cardWMult     ?? 1.5,
        cardHMult:     s.cardHMult     ?? 1.5,
        uploadBtnMult: s.uploadBtnMult ?? 1.0,
        uploadBtnText: s.uploadBtnText ?? "",
        cardCount:     s.cardCount     ?? 0,
        glow1Enabled:  s.glow1Enabled  ?? true,  glow1Color: s.glow1Color ?? "#FFD700",
        glow2Enabled:  s.glow2Enabled  ?? true,  glow2Color: s.glow2Color ?? "#C0C0C0",
        glow3Enabled:  s.glow3Enabled  ?? true,  glow3Color: s.glow3Color ?? "#CD7F32",
        steamApiKey:   s.steamApiKey   ?? "",
        steamId:       s.steamId       ?? "",
        steamMappings: s.steamMappings ?? [],
      };
      setCardWMult(loaded.cardWMult);   setCardHMult(loaded.cardHMult);
      setUploadBtnMult(loaded.uploadBtnMult); setUploadBtnText(loaded.uploadBtnText);
      setCardCount(loaded.cardCount);
      setGlow1Enabled(loaded.glow1Enabled); setGlow1Color(loaded.glow1Color);
      setGlow2Enabled(loaded.glow2Enabled); setGlow2Color(loaded.glow2Color);
      setGlow3Enabled(loaded.glow3Enabled); setGlow3Color(loaded.glow3Color);
      setSteamApiKey(loaded.steamApiKey); setSteamId(loaded.steamId);
      setSteamMappings(loaded.steamMappings);
      dbSettings.current = loaded;
    }).catch(() => {});

    apiFetch("/list")
      .then(data => { setMyList(data); setBackendOk(true); })
      .catch(() => setBackendOk(false))
      .finally(() => setListLoading(false));
  }, []);

  const saveSettings = useCallback(async (vals) => {
    setSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
      dbSettings.current = vals;
      setSettingsDirty(false);
    } catch (e) {
      console.error("Failed to save settings", e);
      setToast({ msg: "Failed to save settings", ok: false });
    } finally {
      setSaving(false);
    }
  }, []);

  const cancelSettings = useCallback(() => {
    const s = dbSettings.current;
    setCardWMult(s.cardWMult);   setCardHMult(s.cardHMult);
    setUploadBtnMult(s.uploadBtnMult); setUploadBtnText(s.uploadBtnText);
    setCardCount(s.cardCount);
    setGlow1Enabled(s.glow1Enabled); setGlow1Color(s.glow1Color);
    setGlow2Enabled(s.glow2Enabled); setGlow2Color(s.glow2Color);
    setGlow3Enabled(s.glow3Enabled); setGlow3Color(s.glow3Color);
    setSteamApiKey(s.steamApiKey); setSteamId(s.steamId);
    setSteamMappings(s.steamMappings);
    setSettingsDirty(false);
  }, []);

  const handleSave = () => saveSettings({
    cardWMult, cardHMult, uploadBtnMult, uploadBtnText, cardCount,
    glow1Enabled, glow1Color, glow2Enabled, glow2Color, glow3Enabled, glow3Color,
    steamApiKey, steamId, steamMappings,
  });

  const persist = useCallback(async (gameId, entry) => {
    try {
      const updated = await apiFetch(`/list/${gameId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      setMyList(p => ({ ...p, [gameId]: { ...p[gameId], ...updated } }));
    } catch (e) { console.error("Failed to save entry", e); }
  }, []);

  const addToList = (game, status, userRating = undefined) => {
    const existing = myList[game.id] || {};
    const next = { ...existing, game, status, userRating: userRating !== undefined ? userRating : (existing.userRating ?? null) };
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
    const next = { ...entry, favourite: starring, status: starring ? 1 : entry.status, userRating: starring && entry.userRating == null ? 10 : entry.userRating };
    setMyList(p => ({ ...p, [id]: next }));
    persist(id, next);
  };

  const rateGame = (id, v) => {
    const entry = myList[id];
    const next = { ...entry, userRating: v, status: v != null ? 1 : entry.status };
    setMyList(p => ({ ...p, [id]: next }));
    persist(id, next);
  };

  const handleCoverUploaded = (id) => setMyList(p => ({ ...p, [id]: { ...p[id], hasCover: true } }));

  const doSearch = async () => {
    if (!query.trim()) return;
    setTab("search"); setSearched(true); setSearchLoading(true); setSearchError(null); setSearchResults([]);
    try {
      const games = await apiFetch(`/games/search?q=${encodeURIComponent(query)}`);
      if (!games.length) throw new Error("No results.");
      setSearchResults(games);
    } catch { setSearchError("Could not reach the backend."); }
    finally { setSearchLoading(false); }
  };

  // Steam library sync
  const syncSteam = useCallback(async () => {
    setSteamSyncing(true);
    setSteamError(null);
    try {
      const data = await apiFetch("/steam/library");
      setSteamLibrary(data);
    } catch (e) {
      const msg = e.message.includes("400") ? "Check your Steam API Key and Steam ID / Vanity URL." : e.message.includes("404") ? "No games found — make sure your Steam profile and game details are set to Public." : "Failed to fetch Steam library.";
      setSteamError(msg);
    } finally { setSteamSyncing(false); }
  }, []);

  /** Import selected Steam games as list entries using Steam header art. */
  const importSteamGames = useCallback(async (games) => {
    for (const g of games) {
      const gameData = {
        id:               g.appid,
        name:             g.name,
        background_image: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
        genres:           [],
        rating:           0,
        released:         null,
        slug:             `steam-${g.appid}`,
      };
      const entry = { game: gameData, status: g.status, userRating: g.rating ?? null, favourite: false };
      setMyList(p => ({ ...p, [g.appid]: entry }));
      await apiFetch(`/list/${g.appid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    }
  }, []);

  // Derived views
  const allEntries  = Object.values(myList);
  const favEntries  = allEntries.filter(e => e.favourite);
  const listEntries = statusFilter === null ? allEntries : allEntries.filter(e => e.status === statusFilter);

  const orderedFavEntries = useMemo(() => {
    if (!favOrder.length) return favEntries;
    const favMap = Object.fromEntries(favEntries.map(e => [String(e.game.id), e]));
    const ordered = favOrder.map(id => favMap[String(id)]).filter(Boolean);
    const orderedIds = new Set(favOrder.map(String));
    return [...ordered, ...favEntries.filter(e => !orderedIds.has(String(e.game.id)))];
  }, [favEntries, favOrder]);

  const reorderFavs = (fromId, toId) => {
    const allIds = orderedFavEntries.map(e => String(e.game.id));
    const from = allIds.indexOf(String(fromId)), to = allIds.indexOf(String(toId));
    if (from === -1 || to === -1 || from === to) return;
    const next = [...allIds];
    next.splice(from, 1); next.splice(to, 0, String(fromId));
    localStorage.setItem("gamilist-fav-order", JSON.stringify(next));
    setFavOrder(next);
  };

  const TABS = [
    { id: "mylist",   label: `My List${allEntries.length ? ` (${allEntries.length})` : ""}` },
    { id: "favs",     label: `Favourites${favEntries.length ? ` (${favEntries.length})` : ""}` },
    { id: "search",   label: "Search" },
    { id: "settings", label: "⚙ Settings" },
  ];

  const cardW = Math.round(210 * cardWMult);
  const cardH = Math.round(170 * cardHMult);
  const maxFitCols = Math.max(1, Math.floor((windowWidth - 56 + 20) / (cardW + 20)));
  const effectiveCardCount = cardCount > 0 ? Math.min(cardCount, maxFitCols) : 0;

  const markDirty = (setter) => (v) => { setter(v); setSettingsDirty(true); };
  const updateW          = markDirty(setCardWMult);
  const updateH          = markDirty(setCardHMult);
  const updateBtn        = markDirty(setUploadBtnMult);
  const updateCount      = markDirty(setCardCount);
  const updateBtnText    = markDirty(setUploadBtnText);
  const updateGlow1E     = markDirty(setGlow1Enabled);
  const updateGlow1C     = markDirty(setGlow1Color);
  const updateGlow2E     = markDirty(setGlow2Enabled);
  const updateGlow2C     = markDirty(setGlow2Color);
  const updateGlow3E     = markDirty(setGlow3Enabled);
  const updateGlow3C     = markDirty(setGlow3Color);
  const updateSteamKey   = markDirty(setSteamApiKey);
  const updateSteamId    = markDirty(setSteamId);
  const updateMappings   = markDirty(setSteamMappings);

  const glowConfig = [
    { enabled: glow1Enabled, color: glow1Color },
    { enabled: glow2Enabled, color: glow2Color },
    { enabled: glow3Enabled, color: glow3Color },
  ];

  const gridProps = { myList, onAdd: addToList, onRemove: removeFromList, onToggleFav: toggleFav, onRate: rateGame, onCoverUploaded: handleCoverUploaded, cardW, cardH, uploadBtnMult, uploadBtnText, effectiveCardCount };
  const previewEntries = orderedFavEntries.length ? orderedFavEntries : allEntries;

  const credentialsReady = steamApiKey.trim() && steamId.trim();

  // Helpers for mapping table
  const addMapping = () => updateMappings([...steamMappings, { id: Date.now(), pattern: "", status: 3, skip: false }]);
  const updateMapping = (idx, val) => updateMappings(steamMappings.map((m, i) => i === idx ? val : m));
  const deleteMapping = (idx) => updateMappings(steamMappings.filter((_, i) => i !== idx));

  return (
    <div style={{ minHeight: "100vh", background: "#080814", color: "#e0e0f0", fontFamily: "'Nunito', 'system-ui', sans-serif" }}>
      <style>{`
        @keyframes progressFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastIn  { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
        @keyframes toastOut { from { opacity: 1; } to { opacity: 0; } }
        * { box-sizing: border-box; }
        input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type=color]::-webkit-color-swatch { border: none; border-radius: 3px; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0c0c1c; } ::-webkit-scrollbar-thumb { background: #2a2a40; border-radius: 3px; }
      `}</style>

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
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder="Search any game…"
              style={{ width: 230, background: "#12121e", border: "1px solid #1e1e35", borderRadius: 8, padding: "8px 14px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <button onClick={doSearch} disabled={searchLoading}
              style={{ padding: "8px 18px", background: "#7c6ef7", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: searchLoading ? "not-allowed" : "pointer", opacity: searchLoading ? 0.6 : 1, whiteSpace: "nowrap", fontFamily: "inherit" }}>
              Search
            </button>
          </div>
        </div>
      </div>

      {backendOk === false && (
        <div style={{ background: "#1a0c0c", borderBottom: "1px solid #ff333333", padding: "10px 28px", fontSize: 13, color: "#ff8080" }}>
          ⚠ Backend not detected. Run <code style={{ background: "#2a1010", padding: "1px 6px", borderRadius: 4 }}>python backend.py</code> then refresh.
        </div>
      )}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "30px 28px 70px" }}>

        {/* ── My List ── */}
        {tab === "mylist" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 20 }}>My List</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 28 }}>
              {STATUSES.map(s => {
                const cnt = allEntries.filter(e => e.status === s.id).length;
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
            {listLoading ? <Spinner text="Loading your list…" /> : <Grid games={listEntries.map(e => e.game)} {...gridProps} emptyMsg="Nothing here yet — search for games to add them!" />}
          </>
        )}

        {/* ── Favourites ── */}
        {tab === "favs" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 4 }}>Favourites</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 28 }}>Star ★ any game to add it here. Drag cards to reorder.</div>
            <FavGrid entries={orderedFavEntries} glowConfig={glowConfig} {...gridProps} onReorder={reorderFavs} />
          </>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: saving ? 8 : 28, flexWrap: "wrap" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff" }}>Settings</div>
              <button onClick={handleSave} disabled={!settingsDirty || saving}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: settingsDirty && !saving ? "pointer" : "not-allowed", background: settingsDirty && !saving ? "#7c6ef7" : "#1a1a2e", color: settingsDirty && !saving ? "#fff" : "#444", transition: "background 0.2s, color 0.2s", fontFamily: "inherit" }}>
                {saving ? "Saving…" : "Save Settings"}
              </button>
              {settingsDirty && !saving && (
                <button onClick={cancelSettings}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                  Cancel
                </button>
              )}
              {settingsDirty && !saving && <span style={{ fontSize: 12, color: "#444" }}>Unsaved changes</span>}
            </div>

            {/* Progress bar */}
            {saving && (
              <div style={{ height: 3, background: "#1a1a2e", borderRadius: 2, marginBottom: 28, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "100%", background: "linear-gradient(90deg, #7c6ef7, #a78bfa)", transformOrigin: "left", animation: "progressFill 0.5s ease-out forwards" }} />
              </div>
            )}

            {/* Panels row */}
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 40 }}>

              {/* Card Settings */}
              <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Card Settings</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                  Control card dimensions and grid layout. Columns sets a fixed count — Auto fills based on width. The max adjusts live to fit your screen.
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
                    <input type="range" min="0.25" max="5" step="0.05" value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
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
                  <input type="range" min="0" max={maxFitCols} step="1" value={Math.min(cardCount, maxFitCols)} onChange={e => updateCount(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#a78bfa", cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                    <span>Auto</span><span style={{ marginLeft: "auto" }}>Max {maxFitCols}</span>
                  </div>
                </div>
              </div>

              {/* Cover Upload Button */}
              <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Cover Upload Button</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                  Adjusts the size and label of the upload button on the bottom-right of each card. Leave the label empty to show the default 📷 icon.
                </div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Size</span>
                    <span style={{ fontSize: 12, color: "#e6a63a", fontWeight: 700 }}>{uploadBtnMult.toFixed(1)}×</span>
                  </div>
                  <input type="range" min="0.5" max="4" step="0.05" value={uploadBtnMult} onChange={e => updateBtn(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#e6a63a", cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                    <span>0.5×</span><span>1×</span><span>2×</span><span>3×</span><span>4×</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Button Label</div>
                  <input type="text" value={uploadBtnText} onChange={e => updateBtnText(e.target.value)} placeholder="Leave empty to show 📷 icon" maxLength={24}
                    style={{ width: "100%", background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "7px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                </div>
              </div>

              {/* Glow Settings */}
              <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Top Favourites Glow</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                  The first three cards in your Favourites get a glowing border. Pick a colour and toggle each rank on or off.
                </div>
                <GlowRow rank="1" label="1st place" enabled={glow1Enabled} color={glow1Color} onToggle={() => updateGlow1E(!glow1Enabled)} onColor={updateGlow1C} />
                <GlowRow rank="2" label="2nd place" enabled={glow2Enabled} color={glow2Color} onToggle={() => updateGlow2E(!glow2Enabled)} onColor={updateGlow2C} />
                <GlowRow rank="3" label="3rd place" enabled={glow3Enabled} color={glow3Color} onToggle={() => updateGlow3E(!glow3Enabled)} onColor={updateGlow3C} />
                <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 14, marginTop: 2 }}>
                  <div style={{ fontSize: 11, color: "#333", lineHeight: 1.6 }}>Reorder Favourites by dragging cards on the Favourites tab.</div>
                </div>
              </div>

            </div>

            {/* ── Steam Integration ── */}
            <div style={{ borderTop: "1px solid #16162a", paddingTop: 28, marginBottom: 40 }}>
              <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 20 }}>Steam Integration</div>

              <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

                {/* Steam Credentials */}
                <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Steam Account</div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                    Get a free API key at <span style={{ color: "#7c6ef7" }}>steamcommunity.com/dev/apikey</span>. Steam ID can be your 17-digit SteamID64 or your vanity URL username. Your profile and game details must be set to <strong style={{ color: "#888" }}>Public</strong>.
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>API Key</div>
                    <input type="password" value={steamApiKey} onChange={e => updateSteamKey(e.target.value)} placeholder="Paste your Steam Web API key"
                      style={{ width: "100%", background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "7px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Steam ID or Vanity URL</div>
                    <input type="text" value={steamId} onChange={e => updateSteamId(e.target.value)} placeholder="e.g. 76561198000000000 or username"
                      style={{ width: "100%", background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "7px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                  </div>
                  {credentialsReady && (
                    <div style={{ marginTop: 20 }}>
                      <button onClick={syncSteam} disabled={steamSyncing}
                        style={{ width: "100%", padding: "9px 0", background: steamSyncing ? "#1a1a2e" : "#1db954", border: "none", borderRadius: 8, color: steamSyncing ? "#444" : "#fff", fontWeight: 700, fontSize: 13, cursor: steamSyncing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {steamSyncing ? "Fetching library…" : "Sync Steam Library"}
                      </button>
                      {steamError && <div style={{ marginTop: 10, fontSize: 12, color: "#ff8080", lineHeight: 1.5 }}>{steamError}</div>}
                    </div>
                  )}
                </div>

                {/* Category Mappings */}
                <div style={{ flex: 1, minWidth: 340, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Category Mappings</div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                    Map your Steam collection names to GamiList statuses. During import you can assign each game to one of these categories and the status will be applied automatically.
                    Use <strong style={{ color: "#888" }}>(N)</strong> in a pattern name (e.g. <em>Played (8)</em>) — the number is extracted as a rating.
                    Mark a row as <strong style={{ color: "#888" }}>Skip</strong> to ignore games in that category (e.g. <em>Will Not Play</em>).
                  </div>

                  {steamMappings.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px auto auto", gap: 8, marginBottom: 6 }}>
                        {["Pattern / Collection name", "Status", "Skip", ""].map((h, i) => (
                          <span key={i} style={{ fontSize: 10, color: "#444", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</span>
                        ))}
                      </div>
                      {steamMappings.map((m, i) => (
                        <MappingRow key={m.id ?? i} mapping={m} onChange={v => updateMapping(i, v)} onDelete={() => deleteMapping(i)} />
                      ))}
                    </div>
                  )}
                  <button onClick={addMapping}
                    style={{ padding: "6px 14px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 7, color: "#7c6ef7", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    + Add Mapping
                  </button>
                </div>

              </div>

              {/* Steam library results */}
              {steamLibrary && (
                <SteamLibrarySection
                  library={steamLibrary}
                  steamMappings={steamMappings}
                  myList={myList}
                  onImport={importSteamGames}
                  onRefresh={syncSteam}
                />
              )}
            </div>

            {/* ── Full-width preview ── */}
            <div style={{ borderTop: "1px solid #16162a", paddingTop: 28 }}>
              <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
                Preview {effectiveCardCount > 0 ? `— ${effectiveCardCount} column${effectiveCardCount > 1 ? "s" : ""}` : "— Auto columns"}
              </div>
              {previewEntries.length > 0
                ? (() => {
                    const count = effectiveCardCount > 0 ? effectiveCardCount : Math.min(4, maxFitCols);
                    const entries = Array.from({ length: count }, (_, i) => previewEntries[i % previewEntries.length]);
                    const cols = effectiveCardCount > 0 ? `repeat(${effectiveCardCount}, 1fr)` : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
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

        {/* ── Search ── */}
        {tab === "search" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>
              {searched ? `Results for "${query}"` : "Search Games"}
            </div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 28 }}>
              {searched && !searchLoading ? `${searchResults.length} games found` : "Type a game title, genre, or keyword above."}
            </div>
            {searchError && <div style={{ color: "#ff6060", background: "#1e0c0c", border: "1px solid #ff333322", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 13 }}>{searchError}</div>}
            {searchLoading ? <Spinner text="Searching games…" /> : <Grid games={searchResults} {...gridProps} emptyMsg="Use the search bar above to find games." />}
          </>
        )}

      </div>
    </div>
  );
}
