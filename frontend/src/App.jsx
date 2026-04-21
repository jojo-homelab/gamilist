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
  { id: 7, label: "Demo",           color: "#20b2aa", bg: "#0a1e1e" },
  { id: 8, label: "Paused",         color: "#f59e0b", bg: "#1e1500" },
];

// Comprehensive platform list — slug matches RAWG API platform slugs
const ALL_PLATFORMS = [
  { slug: "pc",              name: "PC",                short: "PC"   },
  { slug: "playstation5",    name: "PlayStation 5",     short: "PS5"  },
  { slug: "playstation4",    name: "PlayStation 4",     short: "PS4"  },
  { slug: "playstation3",    name: "PlayStation 3",     short: "PS3"  },
  { slug: "playstation2",    name: "PlayStation 2",     short: "PS2"  },
  { slug: "playstation",     name: "PlayStation",       short: "PS1"  },
  { slug: "xbox-series-x",   name: "Xbox Series X/S",   short: "XSX"  },
  { slug: "xbox-one",        name: "Xbox One",           short: "XB1"  },
  { slug: "xbox360",         name: "Xbox 360",           short: "360"  },
  { slug: "xbox-old",        name: "Xbox (original)",    short: "XBX"  },
  { slug: "nintendo-switch", name: "Nintendo Switch",    short: "NSW"  },
  { slug: "wii-u",           name: "Wii U",              short: "WIU"  },
  { slug: "wii",             name: "Wii",                short: "Wii"  },
  { slug: "gamecube",        name: "GameCube",           short: "GCN"  },
  { slug: "nintendo-64",     name: "Nintendo 64",        short: "N64"  },
  { slug: "super-nintendo",  name: "Super Nintendo",     short: "SNES" },
  { slug: "nes",             name: "NES",                short: "NES"  },
  { slug: "game-boy-advance",name: "Game Boy Advance",   short: "GBA"  },
  { slug: "game-boy-color",  name: "Game Boy Color",     short: "GBC"  },
  { slug: "game-boy",        name: "Game Boy",           short: "GBY"  },
  { slug: "nintendo-3ds",    name: "Nintendo 3DS",       short: "3DS"  },
  { slug: "nintendo-ds",     name: "Nintendo DS",        short: "NDS"  },
  { slug: "psp",             name: "PSP",                short: "PSP"  },
  { slug: "ps-vita",         name: "PS Vita",            short: "PSV"  },
  { slug: "ios",             name: "iOS",                short: "iOS"  },
  { slug: "android",         name: "Android",            short: "AND"  },
  { slug: "macos",           name: "macOS",              short: "Mac"  },
  { slug: "linux",           name: "Linux",              short: "Lin"  },
  { slug: "sega-genesis",    name: "Sega Genesis/MD",    short: "GEN"  },
  { slug: "sega-saturn",     name: "Sega Saturn",        short: "SAT"  },
  { slug: "sega-dreamcast",  name: "Dreamcast",          short: "DC"   },
  { slug: "game-gear",       name: "Game Gear",          short: "GGR"  },
  { slug: "sega-master-system", name: "Sega Master System", short: "SMS" },
  { slug: "atari-2600",      name: "Atari 2600",         short: "2600" },
  { slug: "atari-7800",      name: "Atari 7800",         short: "7800" },
  { slug: "jaguar",          name: "Atari Jaguar",       short: "JAG"  },
  { slug: "3do",             name: "3DO",                short: "3DO"  },
  { slug: "neo-geo",         name: "Neo Geo",            short: "NEO"  },
];

const PLATFORM_SHORT = Object.fromEntries(ALL_PLATFORMS.map(p => [p.slug, p.short]));

const rawgImgSrc = (url) => url ? `${API}/image-proxy?url=${encodeURIComponent(url)}` : null;
const coverSrc   = (id)  => `${API}/list/${id}/cover`;

async function apiFetch(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatPlaytime(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
      onClick={e => e.stopPropagation()}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      placeholder="0–10"
      style={{ width: 52, background: "#0a0a14", border: "1px solid #7c6ef7", borderRadius: 4, color: "#e0e0f0", fontSize: 12, padding: "2px 5px", outline: "none", fontFamily: "inherit" }} />
  );
  return (
    <span onClick={e => { e.stopPropagation(); setInput(value != null ? String(value) : ""); setEditing(true); }}
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
      <button onClick={e => { e.stopPropagation(); ref.current.click(); }} disabled={uploading}
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
function GameCard({ game, listEntry, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, onOpenMetadata, onTogglePlatform, getPlatformColor, getStatusProps, cardH = 255, uploadBtnMult = 1, uploadBtnText = "", glowColor = null }) {
  const statusProps = (id) => getStatusProps ? getStatusProps(id) : (STATUSES[id] || STATUSES[6]);
  const [hover, setHover]           = useState(false);
  const [showMenu, setShowMenu]     = useState(false);
  const [imgErr, setImgErr]         = useState(false);
  const [coverKey, setCoverKey]     = useState(0);
  const [screenshots, setScreenshots] = useState(null); // null=not loaded yet
  const [imgIndex, setImgIndex]     = useState(0);
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

  const handleCoverUploaded = () => { setCoverKey(k => k + 1); onCoverUploaded(game.id); };

  // Build image list with extra images and customImagesOnly support
  const customImagesOnly = listEntry?.customImagesOnly || false;
  const extraImageUrls = (listEntry?.extraImageIds || []).map(id => `${API}/images/${id}`);
  const coverUrl = hasCover ? `${coverSrc(game.id)}?v=${coverKey}` : null;
  const rawgCover = rawgImgSrc(game.background_image);

  let baseImages;
  if (customImagesOnly && (hasCover || extraImageUrls.length > 0)) {
    baseImages = [coverUrl, ...extraImageUrls].filter(Boolean);
  } else {
    baseImages = [coverUrl || rawgCover, ...extraImageUrls].filter(Boolean);
  }
  const allImages = [...baseImages, ...(screenshots || []).map(u => rawgImgSrc(u))].filter(Boolean);
  const displayImg = allImages[imgIndex] || coverUrl || rawgCover;

  const handleMouseEnter = async () => {
    setHover(true);
    // Lazy-load screenshots for RAWG games (not steam imports) on first hover
    if (screenshots === null && game.id && !(game.slug || "").startsWith("steam-")) {
      setScreenshots([]); // mark as loading
      try {
        const shots = await apiFetch(`/games/${game.id}/screenshots`);
        setScreenshots(shots);
      } catch { setScreenshots([]); }
    }
  };

  // Auto-cycle through images while hovered
  useEffect(() => {
    if (!hover || allImages.length <= 1) return;
    const timer = setInterval(() => setImgIndex(i => (i + 1) % allImages.length), 2200);
    return () => clearInterval(timer);
  }, [hover, allImages.length]);

  const glowStyle = glowColor ? {
    border:     `1px solid ${glowColor}99`,
    boxShadow:  `0 0 14px ${glowColor}88, 0 0 32px ${glowColor}44${hover ? ", 0 8px 30px rgba(0,0,0,0.5)" : ""}`,
    background: `linear-gradient(160deg, #10101e 60%, ${glowColor}18)`,
  } : {
    border:    `1px solid ${hover ? "#2e2e50" : "#1a1a2e"}`,
    boxShadow: hover ? "0 8px 30px rgba(0,0,0,0.5)" : "none",
    background: "#10101e",
  };

  const openMeta = (e) => { if (listEntry && onOpenMetadata) { e.stopPropagation(); onOpenMetadata(game.id); } };

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={() => setHover(false)}
      onClick={openMeta}
      style={{
        borderRadius: 12, overflow: "visible", position: "relative",
        display: "flex", flexDirection: "column",
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
        transform: hover ? "translateY(-4px)" : "none",
        cursor: listEntry && onOpenMetadata ? "pointer" : "default",
        ...glowStyle,
      }}>

      {/* Cover image — fixed height with screenshot gallery navigation */}
      <div style={{ height: cardH, borderRadius: "12px 12px 0 0", overflow: "hidden", background: "#080814", position: "relative", flexShrink: 0 }}>
        {displayImg && !imgErr
          ? <img src={displayImg} alt={game.name} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${listEntry?.imgPosX ?? 50}% ${listEntry?.imgPosY ?? 50}%`, display: "block", transition: "opacity 0.2s" }} />
          : <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 36 }}>🎮</span>
              <span style={{ fontSize: 11, color: "#333", textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>{game.name}</span>
            </div>}
        {/* Screenshot navigation dots */}
        {allImages.length > 1 && hover && (
          <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5, zIndex: 10 }} onClick={e => e.stopPropagation()}>
            {allImages.map((_, i) => (
              <div key={i} onClick={e => { e.stopPropagation(); setImgIndex(i); }}
                style={{ width: i === imgIndex ? 18 : 6, height: 6, borderRadius: 3, background: i === imgIndex ? "#fff" : "rgba(255,255,255,0.45)", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }} />
            ))}
          </div>
        )}
        {listEntry && (
          <button onClick={e => { e.stopPropagation(); onToggleFav(game.id); }}
            style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: isFav ? "#e6a63a" : "#666" }}>
            {isFav ? "★" : "☆"}
          </button>
        )}
        {status !== null && (
          <div style={{ position: "absolute", top: 8, right: 8, background: statusProps(status).color + "dd", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
            {STATUSES[status].label}
          </div>
        )}
        {/* CoverUpload moved to MetadataModal */}
      </div>

      {/* Card body */}
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#eeeeff", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={game.name}>{game.name}</div>

        {/* Platform badges */}
        {(() => {
          const played = listEntry?.platformsPlayed || [];
          const gameSlugs = (game.platforms || []).map(p => p.platform.slug);
          const extraPlayedSlugs = played.filter(s => !gameSlugs.includes(s));
          const allBadgeSlugs = [...gameSlugs, ...extraPlayedSlugs];
          if (!allBadgeSlugs.length) return null;
          const isDefault = played.length === 0 && gameSlugs.length === 1;
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }} onClick={e => e.stopPropagation()}>
              {allBadgeSlugs.map(slug => {
                const pInfo = (game.platforms || []).find(p => p.platform.slug === slug)?.platform
                           || ALL_PLATFORMS.find(p => p.slug === slug)
                           || { name: slug };
                const active = played.includes(slug) || (isDefault && gameSlugs[0] === slug);
                const pc = getPlatformColor ? getPlatformColor(slug) : "#7c6ef7";
                return (
                  <span key={slug} title={pInfo.name}
                    onClick={e => { e.stopPropagation(); if (listEntry && onTogglePlatform) onTogglePlatform(game.id, slug); }}
                    style={{ fontSize: 9, fontWeight: 700,
                      padding: "2px 5px", borderRadius: 3,
                      background: active ? pc + "28" : "#141420",
                      border: `1px solid ${active ? pc + "77" : "#222238"}`,
                      color: active ? pc : "#444",
                      cursor: listEntry ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                    {PLATFORM_SHORT[slug] || pInfo.name?.slice(0, 4)}
                  </span>
                );
              })}
            </div>
          );
        })()}

        {listEntry && (
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
            <RatingInput value={listEntry.userRating ?? null} onChange={v => onRate(game.id, v)} />
            {formatPlaytime(listEntry.playtimeMinutes) && (
              <span style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                ⏱ {formatPlaytime(listEntry.playtimeMinutes)}
              </span>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div ref={menuRef} style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
          <button onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
            style={{ width: "100%", padding: "7px 11px", borderRadius: 8, border: `1px solid ${status !== null ? statusProps(status).color + "44" : "#1e1e35"}`, background: status !== null ? statusProps(status).bg : "#0a0a14", color: status !== null ? statusProps(status).color : "#555", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "inherit" }}>
            <span>{status !== null ? STATUSES[status].label : "＋ Add to list"}</span>
            <span style={{ opacity: 0.6, fontSize: 9 }}>▾</span>
          </button>
          {showMenu && (
            <div style={{ position: "absolute", bottom: "calc(100% + 5px)", left: 0, right: 0, background: "#10101e", border: "1px solid #2a2a40", borderRadius: 10, overflow: "hidden", zIndex: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>
              {STATUSES.map(s => {
                const sp = statusProps(s.id);
                return (
                  <button key={s.id} onClick={e => { e.stopPropagation(); onAdd(game, s.id); setShowMenu(false); }}
                    style={{ width: "100%", padding: "8px 14px", border: "none", background: status === s.id ? sp.bg : "transparent", color: sp.color, cursor: "pointer", fontSize: 12, textAlign: "left", fontWeight: status === s.id ? 700 : 400, display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
                    <span style={{ fontSize: 10, opacity: status === s.id ? 1 : 0 }}>✓</span>{s.label}
                  </button>
                );
              })}
              {status !== null && <>
                <div style={{ height: 1, background: "#1a1a30" }} />
                <button onClick={e => { e.stopPropagation(); onRemove(game.id); setShowMenu(false); }}
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

function Grid({ games, myList, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, onOpenMetadata, onTogglePlatform, getPlatformColor, getStatusProps, emptyMsg, cardW, cardH, cardH2, altCardMode, uploadBtnMult, uploadBtnText, effectiveCardCount }) {
  if (!games.length) return <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>{emptyMsg}</div>;
  const cols = effectiveCardCount > 0 ? `repeat(${effectiveCardCount}, 1fr)` : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20, alignItems: "start" }}>
      {games.map((g, i) => (
        <GameCard key={g.id} game={g} listEntry={myList[g.id] || null} cardH={altCardMode && i % 2 === 1 ? cardH2 : cardH} uploadBtnMult={uploadBtnMult} uploadBtnText={uploadBtnText}
          onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate} onCoverUploaded={onCoverUploaded}
          onOpenMetadata={onOpenMetadata} onTogglePlatform={onTogglePlatform} getPlatformColor={getPlatformColor} getStatusProps={getStatusProps} />
      ))}
    </div>
  );
}

function FavGrid({ entries, glowConfig, myList, onAdd, onRemove, onToggleFav, onRate, onCoverUploaded, onOpenMetadata, onTogglePlatform, getPlatformColor, getStatusProps, cardW, cardH, cardH2, altCardMode, uploadBtnMult, uploadBtnText, effectiveCardCount, favMults = [2, 2, 2], onReorder }) {
  const [dragOverId, setDragOverId] = useState(null);
  const dragId = useRef(null);
  if (!entries.length) return <div style={{ textAlign: "center", color: "#333", padding: 80, fontSize: 14 }}>No favourites yet. Add games to your list and star them!</div>;
  const cols = effectiveCardCount > 0 ? `repeat(${effectiveCardCount}, 1fr)` : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
  // Max columns for capping span (avoid overflowing a 1-col layout)
  const maxCols = effectiveCardCount > 0 ? effectiveCardCount : 12;
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20, alignItems: "start" }}>
      {entries.map((e, i) => {
        const glow = i < 3 && glowConfig[i]?.enabled ? glowConfig[i].color : null;
        const mult = i < 3 ? (favMults[i] ?? 2) : 1;
        const span = i < 3 ? Math.max(1, Math.min(Math.round(mult), maxCols)) : 1;
        const thisCardH = i < 3 ? Math.round(cardH * mult) : (altCardMode && i % 2 === 1 ? cardH2 : cardH);
        return (
          <div key={e.game.id} draggable
            onDragStart={() => { dragId.current = e.game.id; }}
            onDragEnd={() => { dragId.current = null; setDragOverId(null); }}
            onDragOver={ev => { ev.preventDefault(); if (dragId.current !== e.game.id) setDragOverId(e.game.id); }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={() => { setDragOverId(null); if (dragId.current != null && dragId.current !== e.game.id) onReorder(dragId.current, e.game.id); }}
            style={{ gridColumn: span > 1 ? `span ${span}` : undefined, opacity: dragOverId === e.game.id ? 0.5 : 1, outline: dragOverId === e.game.id ? "2px dashed #7c6ef755" : "none", borderRadius: 12, cursor: "grab", transition: "opacity 0.15s" }}>
            <GameCard game={e.game} listEntry={e} cardH={thisCardH} uploadBtnMult={uploadBtnMult} uploadBtnText={uploadBtnText} glowColor={glow}
              onAdd={onAdd} onRemove={onRemove} onToggleFav={onToggleFav} onRate={onRate} onCoverUploaded={onCoverUploaded}
              onOpenMetadata={onOpenMetadata} onTogglePlatform={onTogglePlatform} getPlatformColor={getPlatformColor} getStatusProps={getStatusProps} />
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

// ---------------------------------------------------------------------------
// Activity graph — GitHub-style contribution heatmap
// ---------------------------------------------------------------------------

function ActivityGraph({ activityLog, colors = {}, numWeeks = 52 }) {
  const emptyColor = colors.empty || "#0d0d1a";
  const lowColor   = colors.low   || "#2d1f6b";
  const midColor   = colors.mid   || "#5040a0";
  const highColor  = colors.high  || "#7c6ef7";

  const [tooltip, setTooltip] = useState(null); // {label, x, y}

  const counts = {};
  for (const d of activityLog || []) counts[d] = (counts[d] || 0) + 1;

  // AniList layout: numWeeks columns × 7 rows, today at top-right (col numWeeks-1, row 0)
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const weeks = [];
  for (let col = 0; col < numWeeks; col++) {
    const week = [];
    for (let row = 0; row < 7; row++) {
      const daysBack = (numWeeks - 1 - col) * 7 + row;
      const d = new Date(today);
      d.setDate(d.getDate() - daysBack);
      const iso = d.toISOString().slice(0, 10);
      week.push({ iso, count: counts[iso] || 0 });
    }
    weeks.push(week);
  }

  const cellColor = (n) => {
    if (n === 0) return emptyColor;
    if (n === 1) return lowColor;
    if (n === 2) return midColor;
    return highColor;
  };

  const formatIso = (iso) => {
    const [y, m, day] = iso.split("-").map(Number);
    const label = new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    return label;
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: "inline-block", position: "relative" }}>
      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 12, top: tooltip.y - 32,
          background: "#1a1a2e", border: "1px solid #2a2a40", borderRadius: 6,
          padding: "4px 10px", fontSize: 11, color: "#c0c0e0", whiteSpace: "nowrap",
          pointerEvents: "none", zIndex: 9999, boxShadow: "0 2px 8px rgba(0,0,0,0.5)"
        }}>
          {tooltip.label}
        </div>
      )}
      <div style={{ display: "flex", gap: 2 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {week.map((day, di) => (
              <div key={di}
                onMouseEnter={e => setTooltip({ label: `${formatIso(day.iso)} — ${day.count} edit${day.count !== 1 ? "s" : ""}`, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                onMouseLeave={() => setTooltip(null)}
                style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(day.count), flexShrink: 0, cursor: "default" }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#555", marginTop: 6 }}>{total} edit{total !== 1 ? "s" : ""} in the last year</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata modal — playtime, replays, tags, metacritic, activity
// ---------------------------------------------------------------------------

function MetadataModal({ gameId, entry, onClose, onSave, onDelete, onSyncSteam, onSyncRawg, platformHighlightColor = "#7c6ef7", cardW = 315, cardH = 255 }) {
  const game = entry?.game;
  const [replayCount, setReplayCount]   = useState(entry?.replayCount ?? 0);
  const [tags, setTags]                 = useState(entry?.tags ?? []);
  const [tagInput, setTagInput]         = useState("");
  const [platforms, setPlatforms]       = useState(entry?.platformsPlayed ?? []);
  const origYear = game?.released ? game.released.slice(0, 4) : "";
  const [yearInput, setYearInput]       = useState(origYear);
  const [playtime, setPlaytime]         = useState(entry?.playtimeMinutes != null ? Math.round(entry.playtimeMinutes / 60 * 10) / 10 : "");
  const [customImagesOnly, setCustomImagesOnly] = useState(entry?.customImagesOnly || false);
  const [extraImageIds, setExtraImageIds]       = useState(entry?.extraImageIds || []);
  const [uploadingImg, setUploadingImg]         = useState(false);
  const [imgPosX, setImgPosX]                   = useState(entry?.imgPosX ?? 50);
  const [imgPosY, setImgPosY]                   = useState(entry?.imgPosY ?? 50);
  const [confirmDelete, setConfirmDelete]        = useState(false);
  const [syncingSteam, setSyncingSteam]          = useState(false);
  const [steamSynced, setSteamSynced]            = useState(false);
  const [syncingRawg, setSyncingRawg]            = useState(false);
  const [rawgSynced, setRawgSynced]              = useState(false);
  const [dragOverIdx, setDragOverIdx]            = useState(null);
  const dragIdxRef                               = useRef(null);
  const imageUploadRef = useRef();

  const isSteamGame = (entry?.game?.slug || "").startsWith("steam-");

  const handleSyncSteam = async () => {
    if (!onSyncSteam) return;
    setSyncingSteam(true);
    await onSyncSteam(gameId);
    setSyncingSteam(false);
    setSteamSynced(true);
    setTimeout(() => setSteamSynced(false), 2000);
  };

  const handleSyncRawg = async () => {
    if (!onSyncRawg) return;
    setSyncingRawg(true);
    const result = await onSyncRawg(gameId);
    setSyncingRawg(false);
    if (result) {
      if (result.extraImageIds) setExtraImageIds(result.extraImageIds);
      setRawgSynced(true);
      setTimeout(() => setRawgSynced(false), 2000);
    }
  };

  const handleDragStart = (idx) => { dragIdxRef.current = idx; };
  const handleDragOver  = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragEnd   = () => { dragIdxRef.current = null; setDragOverIdx(null); };
  const handleDrop      = async (e, toIdx) => {
    e.preventDefault();
    const fromIdx = dragIdxRef.current;
    dragIdxRef.current = null;
    setDragOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    const newIds = [...extraImageIds];
    const [moved] = newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, moved);
    setExtraImageIds(newIds);
    await fetch(`${API}/list/${gameId}/images/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: newIds }),
    });
  };

  // Extra platforms: slugs user added manually not in game.platforms
  const gamePlatformSlugs = (game?.platforms || []).map(gp => gp.platform.slug);
  const [extraPlatformSlugs, setExtraPlatformSlugs] = useState(() => {
    // Any slug in platformsPlayed not present in game.platforms
    return (entry?.platformsPlayed ?? []).filter(s => !gamePlatformSlugs.includes(s));
  });
  const [selectedAddPlatform, setSelectedAddPlatform] = useState("");

  if (!entry || !game) return null;

  const addTag = (t) => {
    const trimmed = t.trim();
    if (trimmed && !tags.includes(trimmed)) setTags(prev => [...prev, trimmed]);
    setTagInput("");
  };
  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t));
  const importGenres = () => {
    const genres = (game.genres || []).map(g => g.name);
    setTags(prev => [...new Set([...prev, ...genres])]);
  };

  const togglePlatform = (slug) =>
    setPlatforms(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);

  const addExtraPlatform = () => {
    if (!selectedAddPlatform) return;
    if (!extraPlatformSlugs.includes(selectedAddPlatform)) {
      setExtraPlatformSlugs(prev => [...prev, selectedAddPlatform]);
      setPlatforms(prev => prev.includes(selectedAddPlatform) ? prev : [...prev, selectedAddPlatform]);
    }
    setSelectedAddPlatform("");
  };

  const removeExtraPlatform = (slug) => {
    setExtraPlatformSlugs(prev => prev.filter(s => s !== slug));
    setPlatforms(prev => prev.filter(s => s !== slug));
  };

  // Platforms available to add (not already shown)
  const allShownSlugs = [...gamePlatformSlugs, ...extraPlatformSlugs];
  const addablePlatforms = ALL_PLATFORMS.filter(p => !allShownSlugs.includes(p.slug));

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingImg(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("image", file);
        const result = await fetch(`${API}/list/${gameId}/images`, { method: "POST", body: fd });
        const data = await result.json();
        if (data.id) setExtraImageIds(prev => [...prev, data.id]);
      }
    } finally { setUploadingImg(false); e.target.value = ""; }
  };

  const deleteExtraImage = async (imgId) => {
    await fetch(`${API}/images/${imgId}`, { method: "DELETE" });
    setExtraImageIds(prev => prev.filter(id => id !== imgId));
  };

  const handleSave = () => {
    const updatedGame = yearInput !== origYear
      ? { ...game, released: yearInput ? `${yearInput}-01-01` : null }
      : game;
    onSave(gameId, {
      game: updatedGame,
      replayCount,
      tags,
      platformsPlayed: platforms,
      playtimeMinutes: playtime !== "" ? Math.round(parseFloat(playtime) * 60) : (entry.playtimeMinutes ?? null),
      customImagesOnly,
      imgPosX,
      imgPosY,
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#0c0c1c", border: "1px solid #1e1e35", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", padding: 28, position: "relative" }}>

        {/* Header */}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", color: "#444", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#eeeeff", marginBottom: 12, paddingRight: 24 }}>{game.name}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Year + Metacritic row */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Release Year</div>
              {origYear
                ? <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: "#161622", border: "1px solid #2a2a40", color: "#888", fontSize: 14, fontWeight: 700 }}>{origYear}</span>
                : <input type="number" min="1970" max="2030" value={yearInput} onChange={e => setYearInput(e.target.value)}
                    placeholder="e.g. 2023"
                    style={{ width: 90, background: "#080814", border: "1px solid #2a2a50", borderRadius: 6, padding: "5px 8px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
              }
            </div>
            {game.metacritic > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Metacritic</div>
                <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: game.metacritic >= 75 ? "#1a3a1a" : game.metacritic >= 50 ? "#2a2a0a" : "#2a1010", border: `1px solid ${game.metacritic >= 75 ? "#4caf8066" : game.metacritic >= 50 ? "#e6a63a66" : "#ff606066"}`, color: game.metacritic >= 75 ? "#4caf80" : game.metacritic >= 50 ? "#e6a63a" : "#ff8080", fontSize: 14, fontWeight: 800 }}>
                  {game.metacritic}
                </span>
              </div>
            )}
          </div>

          {/* Playtime + Replays row */}
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Playtime (hours)</div>
              <input type="number" min="0" step="0.1" value={playtime} onChange={e => setPlaytime(e.target.value)}
                placeholder="e.g. 12.5"
                style={{ width: "100%", background: "#080814", border: "1px solid #2a2a50", borderRadius: 6, padding: "5px 8px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
              {entry.playtimeMinutes != null && <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>Stored: {formatPlaytime(entry.playtimeMinutes)}</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Replays</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setReplayCount(c => Math.max(0, c - 1))}
                  style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#eeeeff", minWidth: 24, textAlign: "center" }}>{replayCount}</span>
                <button onClick={() => setReplayCount(c => c + 1)}
                  style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Tags</span>
              {(game.genres || []).length > 0 && (
                <button onClick={importGenres} style={{ fontSize: 10, color: "#7c6ef7", background: "transparent", border: "1px solid #7c6ef744", borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontFamily: "inherit" }}>
                  + from genres
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {tags.map(t => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#161628", border: "1px solid #2a2a50", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#a0a0cc" }}>
                  {t}
                  <button onClick={() => removeTag(t)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                placeholder="Add tag…"
                style={{ flex: 1, background: "#080814", border: "1px solid #1e1e35", borderRadius: 6, padding: "5px 9px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
              <button onClick={() => addTag(tagInput)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: "#7c6ef7", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
            </div>
          </div>

          {/* Platforms — game's platforms + user-added extras */}
          <div>
            <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Platforms Played On</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              {/* Game's official platforms */}
              {(game.platforms || []).map(gp => {
                const slug = gp.platform.slug;
                const pInfo = ALL_PLATFORMS.find(ap => ap.slug === slug) || { short: slug.slice(0, 4), name: gp.platform.name };
                const active = platforms.includes(slug);
                return (
                  <span key={slug} onClick={() => togglePlatform(slug)} title={pInfo.name}
                    style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
                      background: active ? platformHighlightColor + "25" : "#0e0e1e",
                      border: `1px solid ${active ? platformHighlightColor + "99" : "#1e1e30"}`,
                      color: active ? platformHighlightColor : "#444",
                      cursor: "pointer", userSelect: "none" }}>
                    {pInfo.short}
                  </span>
                );
              })}
              {/* User-added extra platforms */}
              {extraPlatformSlugs.map(slug => {
                const pInfo = ALL_PLATFORMS.find(ap => ap.slug === slug) || { short: slug.slice(0, 4), name: slug };
                const active = platforms.includes(slug);
                return (
                  <span key={slug} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
                    background: active ? platformHighlightColor + "25" : "#0e0e1e",
                    border: `1px solid ${active ? platformHighlightColor + "99" : "#1e1e30"}`,
                    color: active ? platformHighlightColor : "#444", userSelect: "none" }}>
                    <span onClick={() => togglePlatform(slug)} style={{ cursor: "pointer" }} title={pInfo.name}>{pInfo.short}</span>
                    <button onClick={() => removeExtraPlatform(slug)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11, padding: 0, lineHeight: 1, marginLeft: 2 }}>×</button>
                  </span>
                );
              })}
            </div>
            {/* Add platform dropdown */}
            {addablePlatforms.length > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                <select value={selectedAddPlatform} onChange={e => setSelectedAddPlatform(e.target.value)}
                  style={{ flex: 1, background: "#080814", border: "1px solid #1e1e35", borderRadius: 6, padding: "4px 8px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit" }}>
                  <option value="">Add platform…</option>
                  {addablePlatforms.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                </select>
                <button onClick={addExtraPlatform} disabled={!selectedAddPlatform}
                  style={{ padding: "4px 12px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: selectedAddPlatform ? "#7c6ef7" : "#333", fontSize: 12, cursor: selectedAddPlatform ? "pointer" : "not-allowed", fontFamily: "inherit" }}>Add</button>
              </div>
            )}
          </div>

          {/* Image Framing */}
          <div>
            <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Image Framing</div>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              {/* Live preview */}
              {(() => {
                // Scale card dimensions down to fit the modal, preserving the exact aspect ratio
                const maxPreviewW = 160;
                const ratio = cardH / cardW;
                const previewW = Math.min(maxPreviewW, cardW);
                const previewH = Math.round(previewW * ratio);
                const previewSrc = entry.hasCover ? `${coverSrc(gameId)}?v=modal` : rawgImgSrc(game.background_image);
                return (
                  <div style={{ width: previewW, height: previewH, borderRadius: 6, overflow: "hidden", background: "#080814", border: "1px solid #2a2a40", flexShrink: 0 }}>
                    {previewSrc
                      ? <img src={previewSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${imgPosX}% ${imgPosY}%` }} />
                      : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎮</div>}
                  </div>
                );
              })()}
              {/* Controls */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Horizontal", value: imgPosX, set: setImgPosX, color: "#7c6ef7" },
                  { label: "Vertical",   value: imgPosY, set: setImgPosY, color: "#38bdf8" },
                ].map(({ label, value, set, color }) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "#666" }}>{label}</span>
                      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={1} value={value}
                      onChange={e => set(parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
                  </div>
                ))}
                <button onClick={() => { setImgPosX(50); setImgPosY(50); }}
                  style={{ fontSize: 10, color: "#444", background: "transparent", border: "1px solid #1e1e30", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Images */}
          <div>
            <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Images</div>

            {/* Custom images only toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "#888", flex: 1 }}>Custom images only (skip RAWG cover)</span>
              <button onClick={() => setCustomImagesOnly(v => !v)}
                style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: customImagesOnly ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: customImagesOnly ? 19 : 3, transition: "left 0.2s" }} />
              </button>
            </div>

            {/* Thumbnails: cover (fixed) + extra images (draggable) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {/* Main cover: custom blob or background_image */}
              {(() => {
                const src = entry.hasCover ? `${coverSrc(gameId)}?v=modal` : rawgImgSrc(game.background_image);
                if (!src) return null;
                return (
                  <div style={{ position: "relative" }}>
                    <img src={src} alt="cover" style={{ width: 60, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #7c6ef766" }} />
                    <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#7c6ef7", fontWeight: 700 }}>cover</div>
                  </div>
                );
              })()}
              {extraImageIds.map((id, idx) => (
                <div key={id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={e => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    position: "relative", cursor: "grab",
                    outline: dragOverIdx === idx ? "2px solid #7c6ef7" : "none",
                    borderRadius: 6,
                    opacity: dragIdxRef.current === idx ? 0.4 : 1,
                    transition: "outline 0.1s",
                  }}>
                  <img src={`${API}/images/${id}`} alt="" style={{ width: 60, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #2a2a40", display: "block" }} />
                  <button onClick={() => deleteExtraImage(id)}
                    style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "#2a0a0a", border: "1px solid #ff606066", color: "#ff6060", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>×</button>
                  <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#555" }}>#{idx + 1}</div>
                </div>
              ))}
            </div>

            {/* Upload + Steam sync */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input ref={imageUploadRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImageUpload} />
              <button onClick={() => imageUploadRef.current?.click()} disabled={uploadingImg}
                style={{ padding: "5px 14px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: uploadingImg ? "#333" : "#7c6ef7", fontSize: 12, cursor: uploadingImg ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {uploadingImg ? "Uploading…" : "+ Upload Image(s)"}
              </button>
              {isSteamGame && onSyncSteam && (
                <button onClick={handleSyncSteam} disabled={syncingSteam}
                  style={{ padding: "5px 14px", background: "transparent", border: `1px solid ${steamSynced ? "#4caf80" : "#3a4a5a"}`, borderRadius: 6, color: steamSynced ? "#4caf80" : syncingSteam ? "#333" : "#88aacc", fontSize: 12, cursor: syncingSteam ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {steamSynced ? "Synced!" : syncingSteam ? "Syncing…" : "Sync from Steam"}
                </button>
              )}
              {onSyncRawg && (
                <button onClick={handleSyncRawg} disabled={syncingRawg}
                  style={{ padding: "5px 14px", background: "transparent", border: `1px solid ${rawgSynced ? "#4caf80" : "#a78bfa44"}`, borderRadius: 6, color: rawgSynced ? "#4caf80" : syncingRawg ? "#333" : "#a78bfa", fontSize: 12, cursor: syncingRawg ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {rawgSynced ? "Synced!" : syncingRawg ? "Syncing…" : "Sync from RAWG"}
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 24, paddingTop: 16, borderTop: "1px solid #1a1a2e" }}>
          {/* Delete zone */}
          {onDelete && (
            confirmDelete
              ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#e05a5a" }}>Remove from list?</span>
                  <button onClick={() => { onDelete(gameId); onClose(); }}
                    style={{ padding: "5px 14px", background: "#e05a5a", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    Yes, delete
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    style={{ padding: "5px 12px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                  </button>
                </div>
              : <button onClick={() => setConfirmDelete(true)}
                  style={{ padding: "5px 14px", background: "transparent", border: "1px solid #e05a5a", borderRadius: 6, color: "#e05a5a", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  Delete entry
                </button>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={onClose} style={{ padding: "7px 16px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 8, color: "#666", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
            <button onClick={handleSave} style={{ padding: "7px 20px", background: "#7c6ef7", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Steam library import panel.
 * Shows owned Steam games not yet in GamiList.
 * Status is pre-filled by playtime: >0 → Played, 0 → Backlog.
 * Ratings are left blank — user sets them manually after import.
 */
function SteamLibrarySection({ library, myList, onImport, onSyncPlaytime, onRefresh }) {
  const [filter, setFilter]         = useState("new");  // "new" | "all"
  const [selections, setSelections] = useState({});
  const [importing, setImporting]   = useState(false);
  const [syncing, setSyncing]       = useState({});  // appid → true while syncing

  useEffect(() => {
    if (!library) return;
    const init = {};
    for (const g of library.games) {
      if (g.gamilist_id) continue;
      init[g.appid] = { checked: true, status: g.playtime_forever > 0 ? 1 : 3 };
    }
    setSelections(init);
  }, [library]);

  const handleSyncPlaytime = async (g) => {
    setSyncing(p => ({ ...p, [g.appid]: true }));
    await onSyncPlaytime(g.appid, g.steam_playtime_minutes);
    setSyncing(p => ({ ...p, [g.appid]: false }));
  };

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

  const formatHours = (mins) => {
    if (!mins) return "0h";
    const h = Math.round(mins / 60);
    return h < 1 ? `${mins}m` : `${h}h`;
  };

  return (
    <div style={{ flex: 1, minWidth: 340, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Steam Library</div>
      <div style={{ fontSize: 11, color: "#444", marginBottom: 16, lineHeight: 1.6 }}>
        {library.total} games total · {library.games.filter(g => g.gamilist_id).length} already in GamiList · {library.games.filter(g => !g.gamilist_id).length} new
      </div>

      {/* Filter toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["new", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: filter === f ? "#7c6ef733" : "transparent", color: filter === f ? "#7c6ef7" : "#555", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            {f === "new" ? "New only" : "All"}
          </button>
        ))}
      </div>

      {/* Import toolbar */}
      {filter === "new" && displayed.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 12px", background: "#080814", borderRadius: 8, border: "1px solid #1a1a2e" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", cursor: "pointer" }}>
            <input type="checkbox" checked={checkedCount === displayed.length} onChange={e => setAll("checked", e.target.checked)} />
            All
          </label>
          <span style={{ fontSize: 12, color: "#555" }}>{checkedCount} selected</span>
          <select onChange={e => setAll("status", parseInt(e.target.value))} defaultValue=""
            style={{ background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "4px 7px", color: "#e0e0f0", fontSize: 12, fontFamily: "inherit", outline: "none" }}>
            <option value="" disabled>Set status…</option>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={handleImport} disabled={importing || checkedCount === 0}
            style={{ marginLeft: "auto", padding: "5px 16px", background: checkedCount > 0 ? "#7c6ef7" : "#1a1a2e", border: "none", borderRadius: 7, color: checkedCount > 0 ? "#fff" : "#444", fontWeight: 700, fontSize: 12, cursor: checkedCount > 0 ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {importing ? "Importing…" : `Import ${checkedCount}`}
          </button>
        </div>
      )}

      {/* Game list */}
      <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid #1a1a2e", borderRadius: 8 }}>
        {displayed.length === 0
          ? <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>All Steam games are already in your GamiList!</div>
          : displayed.map(g => {
              const inList = !!g.gamilist_id;
              const sel    = selections[g.appid] || {};
              const iconUrl = g.img_icon_url
                ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
                : null;
              return (
                <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid #0e0e1e", background: inList ? "#0a120a" : "transparent" }}>
                  {!inList
                    ? <input type="checkbox" checked={sel.checked || false} onChange={e => setSelections(p => ({ ...p, [g.appid]: { ...p[g.appid], checked: e.target.checked } }))} />
                    : <span style={{ fontSize: 11, color: "#4caf80", width: 14, textAlign: "center" }}>✓</span>}
                  {iconUrl && <img src={iconUrl} alt="" style={{ width: 24, height: 24, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}
                  <span style={{ flex: 1, fontSize: 13, color: inList ? "#4caf8099" : "#e0e0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                  <span style={{ fontSize: 11, color: "#444", whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }}>{formatHours(g.playtime_forever)}</span>
                  {!inList && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUSES[sel.status ?? 3]?.color || "#555", whiteSpace: "nowrap", minWidth: 70, textAlign: "right" }}>
                      {STATUSES[sel.status ?? 3]?.label ?? "—"}
                    </span>
                  )}
                  {inList && g.steam_playtime_minutes > 0 && (
                    <button onClick={() => handleSyncPlaytime(g)} disabled={syncing[g.appid]}
                      style={{ fontSize: 10, padding: "2px 8px", background: "transparent", border: "1px solid #2a3a2a", borderRadius: 4, color: syncing[g.appid] ? "#333" : "#4caf8088", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                      {syncing[g.appid] ? "…" : "Sync playtime"}
                    </button>
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
  const [cardH2Mult, setCardH2Mult]       = useState(1.0);
  const [altCardMode, setAltCardMode]     = useState(false);
  const [uploadBtnMult, setUploadBtnMult] = useState(1.0);
  const [uploadBtnText, setUploadBtnText] = useState("");
  const [cardCount, setCardCount]         = useState(0);
  const [glow1Enabled, setGlow1Enabled]   = useState(true);
  const [glow1Color,   setGlow1Color]     = useState("#FFD700");
  const [glow2Enabled, setGlow2Enabled]   = useState(true);
  const [glow2Color,   setGlow2Color]     = useState("#C0C0C0");
  const [glow3Enabled, setGlow3Enabled]   = useState(true);
  const [glow3Color,   setGlow3Color]     = useState("#CD7F32");
  const [fav1Mult, setFav1Mult]           = useState(2.0);
  const [fav2Mult, setFav2Mult]           = useState(2.0);
  const [fav3Mult, setFav3Mult]           = useState(2.0);
  const [steamApiKey, setSteamApiKey] = useState("");
  const [steamId, setSteamId]         = useState("");
  const [steamLibrary, setSteamLibrary] = useState(null);
  const [steamSyncing, setSteamSyncing] = useState(false);
  const [steamError, setSteamError]   = useState(null);
  const [metadataGameId, setMetadataGameId]               = useState(null);
  const [platformDefaultColor, setPlatformDefaultColor]   = useState("#7c6ef7");
  const [platformColors, setPlatformColors]               = useState({ pc: "#ffffff" });
  const [statusColors, setStatusColors]                   = useState({});
  const [activityColors, setActivityColors]               = useState({});
  const [showMorePlatformColors, setShowMorePlatformColors] = useState(false);
  const [syncingAllPlaytime, setSyncingAllPlaytime]       = useState(false);
  const [resyncingPlatforms, setResyncingPlatforms]       = useState(false);
  const [resyncingImages, setResyncingImages]             = useState(false);
  const [resyncingSteamImages, setResyncingSteamImages]   = useState(false);
  const [pruning, setPruning]                             = useState(false);
  const [pruneThreshold, setPruneThreshold]               = useState(5);
  const [platformFilterSlugs, setPlatformFilterSlugs]     = useState([]);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState(null);
  const [statusFilter, setStatusFilter]   = useState(null);
  const [sortBy, setSortBy]               = useState("rating_desc");
  const [listSearch, setListSearch]       = useState("");
  const [windowWidth, setWindowWidth]     = useState(window.innerWidth);

  const [favOrder, setFavOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gamilist-fav-order") || "[]"); }
    catch { return []; }
  });

  const dbSettings = useRef({
    cardWMult: 1.5, cardHMult: 1.5, cardH2Mult: 1.0, altCardMode: false, uploadBtnMult: 1.0, uploadBtnText: "", cardCount: 0,
    glow1Enabled: true, glow1Color: "#FFD700", glow2Enabled: true, glow2Color: "#C0C0C0", glow3Enabled: true, glow3Color: "#CD7F32",
    steamApiKey: "", steamId: "", platformHighlightColor: "#7c6ef7", platformColors: { pc: "#ffffff" }, statusColors: {}, activityColors: {},
    fav1Mult: 2.0, fav2Mult: 2.0, fav3Mult: 2.0,
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
        cardH2Mult:    s.cardH2Mult    ?? 1.0,
        altCardMode:   s.altCardMode   ?? false,
        uploadBtnMult: s.uploadBtnMult ?? 1.0,
        uploadBtnText: s.uploadBtnText ?? "",
        cardCount:     s.cardCount     ?? 0,
        glow1Enabled:  s.glow1Enabled  ?? true,  glow1Color: s.glow1Color ?? "#FFD700",
        glow2Enabled:  s.glow2Enabled  ?? true,  glow2Color: s.glow2Color ?? "#C0C0C0",
        glow3Enabled:  s.glow3Enabled  ?? true,  glow3Color: s.glow3Color ?? "#CD7F32",
        steamApiKey:   s.steamApiKey   ?? "",
        steamId:       s.steamId       ?? "",
      };
      setCardWMult(loaded.cardWMult);   setCardHMult(loaded.cardHMult);
      setCardH2Mult(loaded.cardH2Mult); setAltCardMode(loaded.altCardMode);
      setUploadBtnMult(loaded.uploadBtnMult); setUploadBtnText(loaded.uploadBtnText);
      setCardCount(loaded.cardCount);
      setGlow1Enabled(loaded.glow1Enabled); setGlow1Color(loaded.glow1Color);
      setGlow2Enabled(loaded.glow2Enabled); setGlow2Color(loaded.glow2Color);
      setGlow3Enabled(loaded.glow3Enabled); setGlow3Color(loaded.glow3Color);
      setFav1Mult(s.fav1Mult ?? 2.0); setFav2Mult(s.fav2Mult ?? 2.0); setFav3Mult(s.fav3Mult ?? 2.0);
      setSteamApiKey(loaded.steamApiKey); setSteamId(loaded.steamId);
      setPlatformDefaultColor(s.platformHighlightColor ?? "#7c6ef7");
      setPlatformColors({ pc: "#ffffff", ...(s.platformColors || {}) });
      setStatusColors(s.statusColors || {});
      setActivityColors(s.activityColors || {});
      dbSettings.current = { ...loaded, platformHighlightColor: s.platformHighlightColor ?? "#7c6ef7", platformColors: { pc: "#ffffff", ...(s.platformColors || {}) }, statusColors: s.statusColors || {}, activityColors: s.activityColors || {} };
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
    setCardH2Mult(s.cardH2Mult ?? 1.0); setAltCardMode(s.altCardMode ?? false);
    setUploadBtnMult(s.uploadBtnMult); setUploadBtnText(s.uploadBtnText);
    setCardCount(s.cardCount);
    setGlow1Enabled(s.glow1Enabled); setGlow1Color(s.glow1Color);
    setGlow2Enabled(s.glow2Enabled); setGlow2Color(s.glow2Color);
    setGlow3Enabled(s.glow3Enabled); setGlow3Color(s.glow3Color);
    setFav1Mult(s.fav1Mult ?? 2.0); setFav2Mult(s.fav2Mult ?? 2.0); setFav3Mult(s.fav3Mult ?? 2.0);
    setSteamApiKey(s.steamApiKey); setSteamId(s.steamId);
    setPlatformDefaultColor(s.platformHighlightColor ?? "#7c6ef7");
    setPlatformColors({ pc: "#ffffff", ...(s.platformColors || {}) });
    setStatusColors(s.statusColors || {});
    setActivityColors(s.activityColors || {});
    setSettingsDirty(false);
  }, []);

  const handleSave = () => saveSettings({
    cardWMult, cardHMult, cardH2Mult, altCardMode, uploadBtnMult, uploadBtnText, cardCount,
    glow1Enabled, glow1Color, glow2Enabled, glow2Color, glow3Enabled, glow3Color,
    fav1Mult, fav2Mult, fav3Mult,
    steamApiKey, steamId, platformHighlightColor: platformDefaultColor,
    platformColors, statusColors, activityColors,
  });

  const persist = useCallback(async (gameId, entry) => {
    try {
      const updated = await apiFetch(`/list/${gameId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game:             entry.game,
          status:           entry.status,
          userRating:       entry.userRating,
          favourite:        entry.favourite,
          playtimeMinutes:  entry.playtimeMinutes ?? null,
          replayCount:      entry.replayCount ?? 0,
          tags:             entry.tags ?? [],
          platformsPlayed:  entry.platformsPlayed ?? [],
          customImagesOnly: entry.customImagesOnly ?? false,
          imgPosX:          entry.imgPosX ?? 50,
          imgPosY:          entry.imgPosY ?? 50,
        }),
      });
      setMyList(p => ({ ...p, [gameId]: { ...p[gameId], ...updated } }));
    } catch (e) { console.error("Failed to save entry", e); }
  }, []);

  const addToList = (game, status, userRating = undefined) => {
    const existing = myList[game.id] || {};
    const next = {
      ...existing, game, status,
      userRating:      userRating !== undefined ? userRating : (existing.userRating ?? null),
      playtimeMinutes: existing.playtimeMinutes ?? null,
      replayCount:     existing.replayCount ?? 0,
      tags:            existing.tags?.length ? existing.tags : (game.genres?.map(g => g.name) || []),
      platformsPlayed: existing.platformsPlayed ?? [],
    };
    setMyList(p => ({ ...p, [game.id]: next }));
    persist(game.id, next);
  };

  const removeFromList = async (id) => {
    setMyList(p => { const n = { ...p }; delete n[id]; return n; });
    await apiFetch(`/list/${id}`, { method: "DELETE" });
  };

  const syncSteamImage = async (id) => {
    const result = await apiFetch(`/list/${id}/sync-steam-image`, { method: "POST" });
    if (result.background_image) {
      setMyList(p => ({ ...p, [id]: { ...p[id], game: { ...p[id].game, background_image: result.background_image } } }));
    }
  };

  const syncRawgImage = async (id) => {
    try {
      const result = await apiFetch(`/list/${id}/sync-rawg-image`, { method: "POST" });
      if (result.background_image) {
        setMyList(p => ({
          ...p,
          [id]: {
            ...p[id],
            game: { ...p[id].game, background_image: result.background_image },
            extraImageIds: result.extraImageIds ?? p[id].extraImageIds,
          }
        }));
      }
      return result;
    } catch {
      return null;
    }
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
      const entry = {
        game: gameData, status: g.status, userRating: g.rating ?? null, favourite: false,
        playtimeMinutes: g.playtime_forever > 0 ? g.playtime_forever : null,
        replayCount: 0, tags: [],
      };
      setMyList(p => ({ ...p, [g.appid]: entry }));
      await apiFetch(`/list/${g.appid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    }
  }, []);

  const togglePlatform = useCallback((id, slug) => {
    const entry = myList[id];
    if (!entry) return;
    const current = entry.platformsPlayed || [];
    const next = { ...entry, platformsPlayed: current.includes(slug) ? current.filter(s => s !== slug) : [...current, slug] };
    setMyList(p => ({ ...p, [id]: next }));
    persist(id, next);
  }, [myList, persist]);

  const syncAllSteamPlaytime = useCallback(async () => {
    setSyncingAllPlaytime(true);
    try {
      const result = await apiFetch("/steam/sync-playtime-all", { method: "POST" });
      setToast({ msg: `Updated playtime for ${result.updated} game${result.updated !== 1 ? "s" : ""}`, ok: true });
      // Reload list to reflect updated playtime
      const data = await apiFetch("/list");
      setMyList(data);
    } catch { setToast({ msg: "Failed to sync playtime", ok: false }); }
    finally { setSyncingAllPlaytime(false); }
  }, []);

  const saveMetadata = useCallback((gameId, updates) => {
    const entry = myList[gameId];
    if (!entry) return;
    const next = { ...entry, ...updates };
    setMyList(p => ({ ...p, [gameId]: next }));
    persist(gameId, next);
  }, [myList, persist]);

  const syncPlaytime = useCallback(async (appid, playtimeMinutes) => {
    try {
      const updated = await apiFetch(`/list/${appid}/playtime`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playtimeMinutes }),
      });
      setMyList(p => ({ ...p, [appid]: { ...p[appid], ...updated } }));
      setToast({ msg: "Playtime synced", ok: true });
    } catch { setToast({ msg: "Failed to sync playtime", ok: false }); }
  }, []);

  // Derived views
  const allEntries = Object.values(myList);
  const favEntries = allEntries.filter(e => e.favourite);

  // Merge all activity logs from all entries for the global heatmap
  const globalActivityLog = useMemo(() => {
    const dates = [];
    for (const e of allEntries) for (const d of e.activityLog || []) dates.push(d);
    return dates;
  }, [allEntries]);

  // Deterministic example activity log for settings preview (seeded hash, stable)
  const exampleActivityLog = useMemo(() => {
    const log = [];
    const today = new Date();
    for (let i = 0; i < 364; i++) {
      const h = ((i * 2654435761) >>> 0) % 100;
      const count = h < 45 ? 0 : h < 65 ? 1 : h < 80 ? 2 : h < 93 ? 3 : 4;
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      for (let c = 0; c < count; c++) log.push(iso);
    }
    return log;
  }, []); // empty deps — computed once

  // Platform slugs that appear in at least one list entry (for filter UI)
  const activePlatformSlugs = useMemo(() => {
    const slugs = new Set();
    for (const e of allEntries) for (const p of e.game?.platforms || []) slugs.add(p.platform.slug);
    return [...slugs];
  }, [allEntries]);

  const listEntries = useMemo(() => {
    // Dropped (status 6) is hidden from the main list unless explicitly selected
    let filtered = statusFilter === null
      ? allEntries.filter(e => e.status !== 6)
      : allEntries.filter(e => e.status === statusFilter);
    if (platformFilterSlugs.length > 0) {
      filtered = filtered.filter(e => {
        const gameSlugs = (e.game?.platforms || []).map(p => p.platform.slug);
        return platformFilterSlugs.some(s => gameSlugs.includes(s));
      });
    }
    if (listSearch.trim()) {
      const q = listSearch.trim().toLowerCase();
      filtered = filtered.filter(e => (e.game?.name || "").toLowerCase().includes(q));
    }
    const copy = [...filtered];
    if (sortBy === "rating_desc") {
      copy.sort((a, b) => {
        if (a.userRating == null && b.userRating == null) return 0;
        if (a.userRating == null) return 1;
        if (b.userRating == null) return -1;
        return b.userRating - a.userRating;
      });
    } else if (sortBy === "rating_asc") {
      copy.sort((a, b) => {
        if (a.userRating == null && b.userRating == null) return 0;
        if (a.userRating == null) return 1;
        if (b.userRating == null) return -1;
        return a.userRating - b.userRating;
      });
    } else if (sortBy === "name_asc") {
      copy.sort((a, b) => (a.game?.name || "").localeCompare(b.game?.name || ""));
    } else if (sortBy === "name_desc") {
      copy.sort((a, b) => (b.game?.name || "").localeCompare(a.game?.name || ""));
    } else if (sortBy === "platform") {
      copy.sort((a, b) => {
        const ap = a.game?.platforms?.[0]?.platform?.name || "zzz";
        const bp = b.game?.platforms?.[0]?.platform?.name || "zzz";
        return ap.localeCompare(bp);
      });
    }
    return copy;
  }, [allEntries, statusFilter, sortBy, platformFilterSlugs, listSearch]);

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
  const cardH2 = Math.round(170 * cardH2Mult);
  const contentWidth = Math.min(windowWidth, 1280) - 56;
  const maxFitCols = Math.max(1, Math.floor((contentWidth + 20) / (cardW + 20)));
  const effectiveCardCount = cardCount > 0 ? Math.min(cardCount, maxFitCols) : 0;

  const markDirty = (setter) => (v) => { setter(v); setSettingsDirty(true); };
  const updateW          = markDirty(setCardWMult);
  const updateH          = markDirty(setCardHMult);
  const updateH2         = markDirty(setCardH2Mult);
  const updateAltMode    = markDirty(setAltCardMode);
  const updateBtn        = markDirty(setUploadBtnMult);
  const updateCount      = markDirty(setCardCount);
  const updateBtnText    = markDirty(setUploadBtnText);
  const updateGlow1E     = markDirty(setGlow1Enabled);
  const updateGlow1C     = markDirty(setGlow1Color);
  const updateGlow2E     = markDirty(setGlow2Enabled);
  const updateGlow2C     = markDirty(setGlow2Color);
  const updateGlow3E     = markDirty(setGlow3Enabled);
  const updateGlow3C     = markDirty(setGlow3Color);
  const updateFav1Mult   = markDirty(setFav1Mult);
  const updateFav2Mult   = markDirty(setFav2Mult);
  const updateFav3Mult   = markDirty(setFav3Mult);
  const updateSteamKey          = markDirty(setSteamApiKey);
  const updateSteamId           = markDirty(setSteamId);
  const updatePlatformDefault   = markDirty(setPlatformDefaultColor);
  const setPlatformColorDirty   = (slug, color) => { setPlatformColors(p => ({ ...p, [slug]: color })); setSettingsDirty(true); };
  const setStatusColorDirty     = (id, field, color) => { setStatusColors(p => ({ ...p, [id]: { ...p[id], [field]: color } })); setSettingsDirty(true); };
  const resetStatusColor        = (id) => { setStatusColors(p => { const n = { ...p }; delete n[id]; return n; }); setSettingsDirty(true); };
  const setActivityColorDirty   = (key, color) => { setActivityColors(p => ({ ...p, [key]: color })); setSettingsDirty(true); };

  const getPlatformColor = useCallback((slug) => platformColors[slug] ?? platformDefaultColor, [platformColors, platformDefaultColor]);
  const getStatusProps   = useCallback((id) => ({
    color: statusColors[id]?.color || STATUSES[id]?.color || "#888",
    bg:    statusColors[id]?.bg    || STATUSES[id]?.bg    || "#141414",
  }), [statusColors]);

  const glowConfig = [
    { enabled: glow1Enabled, color: glow1Color },
    { enabled: glow2Enabled, color: glow2Color },
    { enabled: glow3Enabled, color: glow3Color },
  ];

  const gridProps = { myList, onAdd: addToList, onRemove: removeFromList, onToggleFav: toggleFav, onRate: rateGame, onCoverUploaded: handleCoverUploaded, onOpenMetadata: setMetadataGameId, onTogglePlatform: togglePlatform, getPlatformColor, getStatusProps, cardW, cardH, cardH2, altCardMode, uploadBtnMult, uploadBtnText, effectiveCardCount };
  const previewEntries = orderedFavEntries.length ? orderedFavEntries : allEntries;

  const credentialsReady = steamApiKey.trim() && steamId.trim();

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
      {metadataGameId != null && (
        <MetadataModal
          gameId={metadataGameId}
          entry={myList[metadataGameId]}
          onClose={() => setMetadataGameId(null)}
          onSave={saveMetadata}
          onDelete={removeFromList}
          onSyncSteam={syncSteamImage}
          onSyncRawg={syncRawgImage}
          platformHighlightColor={platformDefaultColor}
          cardW={cardW}
          cardH={cardH}
        />
      )}

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
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 20, fontFamily: "'Gloria Hallelujah', cursive" }}>My List</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATUSES.length}, 1fr)`, gap: 8, marginBottom: 28 }}>
              {STATUSES.map(s => {
                const cnt = allEntries.filter(e => e.status === s.id).length;
                const active = statusFilter === s.id;
                const sp = getStatusProps(s.id);
                return (
                  <div key={s.id} onClick={() => setStatusFilter(active ? null : s.id)}
                    style={{ background: active ? sp.bg : "#0c0c1c", border: `1px solid ${active ? sp.color + "66" : "#1a1a2e"}`, borderRadius: 8, padding: "11px 10px", cursor: "pointer", transition: "all 0.15s", userSelect: "none", minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: sp.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: sp.color }}>{cnt}</div>
                  </div>
                );
              })}
            </div>
            {/* Sort + filter toolbar + Activity (same row) */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 16, marginBottom: 20 }}>
              {/* Sort + filter toolbar */}
              <div style={{ flex: 1, minWidth: 0, background: "#0c0c1c", border: "1px solid #16162a", borderRadius: 10, padding: "12px 16px" }}>
                {/* Row 1: status active + sort */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {statusFilter !== null && (
                    <>
                      <span style={{ fontSize: 12, color: getStatusProps(statusFilter).color, fontWeight: 700 }}>{STATUSES[statusFilter].label}</span>
                      <button onClick={() => setStatusFilter(null)} style={{ fontSize: 10, color: "#555", background: "transparent", border: "1px solid #1e1e30", borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontFamily: "inherit" }}>×</button>
                      <div style={{ width: 1, height: 14, background: "#1e1e30" }} />
                    </>
                  )}
                  <span style={{ fontSize: 11, color: "#444", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Sort</span>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    style={{ background: "#080814", border: "1px solid #1a1a2e", borderRadius: 5, padding: "4px 8px", color: "#a0a0cc", fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                    <option value="rating_desc">Rating ↓</option>
                    <option value="rating_asc">Rating ↑</option>
                    <option value="name_asc">Name A→Z</option>
                    <option value="name_desc">Name Z→A</option>
                    <option value="platform">Platform</option>
                  </select>
                  <div style={{ width: 1, height: 14, background: "#1e1e30" }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 120 }}>
                    <input
                      value={listSearch}
                      onChange={e => setListSearch(e.target.value)}
                      placeholder="Search my list…"
                      style={{ background: "#080814", border: "1px solid #1a1a2e", borderRadius: 5, padding: "4px 28px 4px 8px", color: "#a0a0cc", fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%" }}
                    />
                    {listSearch && (
                      <button onClick={() => setListSearch("")}
                        style={{ position: "absolute", right: 6, background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: "#333", marginLeft: "auto" }}>{listEntries.length} / {allEntries.length} games</span>
                </div>

                {/* Row 2: Platform filter (only show platforms present in list) */}
                {activePlatformSlugs.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "#444", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, minWidth: 48 }}>Platform</span>
                    {activePlatformSlugs.map(slug => {
                      const pInfo = ALL_PLATFORMS.find(p => p.slug === slug);
                      const active = platformFilterSlugs.includes(slug);
                      const pc = getPlatformColor(slug);
                      return (
                        <button key={slug} onClick={() => setPlatformFilterSlugs(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])}
                          title={pInfo?.name || slug}
                          style={{ fontSize: 10, padding: "3px 7px", borderRadius: 4, border: `1px solid ${active ? pc + "66" : "#1e1e30"}`,
                            background: active ? pc + "18" : "transparent", color: active ? pc : "#555",
                            cursor: "pointer", fontFamily: "inherit" }}>
                          {pInfo?.name || pInfo?.short || slug}
                        </button>
                      );
                    })}
                    {platformFilterSlugs.length > 0 && (
                      <button onClick={() => setPlatformFilterSlugs([])} style={{ fontSize: 10, color: "#444", background: "transparent", border: "1px solid #1e1e30", borderRadius: 4, padding: "3px 7px", cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
                    )}
                  </div>
                )}
              </div>

              {/* Global activity heatmap */}
              {allEntries.length > 0 && (
                <div style={{ flexShrink: 0, background: activityColors.bg || "#0c0c1c", border: "1px solid #16162a", borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Activity</div>
                  <ActivityGraph activityLog={globalActivityLog} colors={activityColors} />
                </div>
              )}
            </div>
            {listLoading ? <Spinner text="Loading your list…" /> : <Grid games={listEntries.map(e => e.game)} {...gridProps} emptyMsg="Nothing here yet — search for games to add them!" />}
          </>
        )}

        {/* ── Favourites ── */}
        {tab === "favs" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 4, fontFamily: "'Gloria Hallelujah', cursive" }}>Favourites</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 28 }}>Star ★ any game to add it here. Drag cards to reorder.</div>
            <FavGrid entries={orderedFavEntries} glowConfig={glowConfig} {...gridProps} favMults={[fav1Mult, fav2Mult, fav3Mult]} onReorder={reorderFavs} />
          </>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: saving ? 8 : 28, flexWrap: "wrap" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", fontFamily: "'Gloria Hallelujah', cursive" }}>Settings</div>
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
            <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap", marginBottom: 40 }}>

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

                {/* Alternating Heights */}
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #1a1a2e" }}>
                  <div style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Alternating Heights</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <span style={{ fontSize: 12, color: "#888", flex: 1 }}>Enable alternating card heights (even/odd)</span>
                    <button onClick={() => updateAltMode(!altCardMode)}
                      style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: altCardMode ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: altCardMode ? 19 : 3, transition: "left 0.2s" }} />
                    </button>
                  </div>
                  {altCardMode && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Secondary Height</span>
                        <span style={{ fontSize: 12, color: "#e05c7a", fontWeight: 700 }}>{cardH2Mult.toFixed(1)}×</span>
                      </div>
                      <input type="range" min="0.25" max="5" step="0.05" value={cardH2Mult} onChange={e => updateH2(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#e05c7a", cursor: "pointer" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                        {["0.25×","1×","2×","3×","5×"].map(m => <span key={m}>{m}</span>)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cover Upload Button */}
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #1a1a2e" }}>
                  <div style={{ fontSize: 12, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Cover Upload Button</div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#888" }}>Size</span>
                      <span style={{ fontSize: 12, color: "#e6a63a", fontWeight: 700 }}>{uploadBtnMult.toFixed(1)}×</span>
                    </div>
                    <input type="range" min="0.5" max="4" step="0.05" value={uploadBtnMult} onChange={e => updateBtn(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#e6a63a", cursor: "pointer" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                      <span>0.5×</span><span>1×</span><span>2×</span><span>3×</span><span>4×</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Button label (empty = 📷)</div>
                  <input type="text" value={uploadBtnText} onChange={e => updateBtnText(e.target.value)} placeholder="Leave empty to show 📷 icon" maxLength={24}
                    style={{ width: "100%", background: "#0a0a14", border: "1px solid #1e1e35", borderRadius: 6, padding: "7px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Colors — Glow + Platform + Status merged */}
              <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 18 }}>Colors</div>

                {/* Top Favourites Glow */}
                <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Top Favourites Glow</div>
                <GlowRow rank="1" label="1st place" enabled={glow1Enabled} color={glow1Color} onToggle={() => updateGlow1E(!glow1Enabled)} onColor={updateGlow1C} />
                <GlowRow rank="2" label="2nd place" enabled={glow2Enabled} color={glow2Color} onToggle={() => updateGlow2E(!glow2Enabled)} onColor={updateGlow2C} />
                <GlowRow rank="3" label="3rd place" enabled={glow3Enabled} color={glow3Color} onToggle={() => updateGlow3E(!glow3Enabled)} onColor={updateGlow3C} />
                <div style={{ fontSize: 10, color: "#333", marginTop: 6, marginBottom: 18 }}>Reorder Favourites by dragging cards on the Favourites tab.</div>

                {/* Top 3 card size */}
                <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 14, marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Top Favourites Size</div>
                  {[
                    { label: "1st place", value: fav1Mult, update: updateFav1Mult, color: "#FFD700" },
                    { label: "2nd place", value: fav2Mult, update: updateFav2Mult, color: "#C0C0C0" },
                    { label: "3rd place", value: fav3Mult, update: updateFav3Mult, color: "#CD7F32" },
                  ].map(({ label, value, update, color }) => (
                    <div key={label} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: "#888" }}>{label}</span>
                        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value.toFixed(1)}×</span>
                      </div>
                      <input type="range" min="1" max="4" step="0.25" value={value}
                        onChange={e => update(parseFloat(e.target.value))}
                        style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 3 }}>
                        <span>1×</span><span>2×</span><span>3×</span><span>4×</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status Colors */}
                <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 18, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Status Colors</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {STATUSES.map(s => {
                      const sp = getStatusProps(s.id);
                      const hasOverride = !!statusColors[s.id];
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: sp.color, flex: 1,
                            background: sp.bg, border: `1px solid ${sp.color}44`, borderRadius: 4,
                            padding: "3px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {s.label}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <span style={{ fontSize: 9, color: "#444" }}>Label</span>
                            <input type="color" value={sp.color} onChange={e => setStatusColorDirty(s.id, "color", e.target.value)}
                              style={{ width: 22, height: 16, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <span style={{ fontSize: 9, color: "#444" }}>BG</span>
                            <input type="color" value={sp.bg} onChange={e => setStatusColorDirty(s.id, "bg", e.target.value)}
                              style={{ width: 22, height: 16, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                          </div>
                          {hasOverride && (
                            <button onClick={() => resetStatusColor(s.id)}
                              style={{ fontSize: 10, color: "#333", background: "transparent", border: "none", cursor: "pointer", padding: "0 2px" }} title="Reset to default">↺</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Platform Colors */}
                <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 18, marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Platform Colors</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "#888", flex: 1 }}>Default</span>
                    <input type="color" value={platformDefaultColor} onChange={e => updatePlatformDefault(e.target.value)}
                      style={{ width: 26, height: 20, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                    <span style={{ fontSize: 10, color: platformDefaultColor, fontWeight: 700 }}>{platformDefaultColor}</span>
                  </div>
                  {/* Always-visible: PC, PS5, Xbox, Switch */}
                  {(() => {
                    const featured = ["pc","playstation5","xbox-series-x","nintendo-switch"];
                    const extraPlatforms = ALL_PLATFORMS.filter(p => !featured.includes(p.slug));
                    return (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {ALL_PLATFORMS.filter(p => featured.includes(p.slug)).map(p => {
                            const c = platformColors[p.slug] ?? platformDefaultColor;
                            return (
                              <div key={p.slug} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: c, minWidth: 28 }}>{p.short}</span>
                                <span style={{ fontSize: 11, color: "#666", flex: 1 }}>{p.name}</span>
                                <input type="color" value={c} onChange={e => setPlatformColorDirty(p.slug, e.target.value)}
                                  style={{ width: 22, height: 16, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                                {platformColors[p.slug] && platformColors[p.slug] !== platformDefaultColor && (
                                  <button onClick={() => { const n = { ...platformColors }; delete n[p.slug]; setPlatformColors(n); setSettingsDirty(true); }}
                                    style={{ fontSize: 10, color: "#333", background: "transparent", border: "none", cursor: "pointer", padding: "0 2px" }} title="Reset">↺</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <button onClick={() => setShowMorePlatformColors(v => !v)}
                          style={{ marginTop: 10, fontSize: 11, color: "#555", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                          {showMorePlatformColors ? "▲ Show less" : `▼ More platforms (${extraPlatforms.length})`}
                        </button>
                        {showMorePlatformColors && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                            {extraPlatforms.map(p => {
                              const c = platformColors[p.slug] ?? platformDefaultColor;
                              return (
                                <div key={p.slug} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: c, minWidth: 28 }}>{p.short}</span>
                                  <span style={{ fontSize: 11, color: "#666", flex: 1 }}>{p.name}</span>
                                  <input type="color" value={c} onChange={e => setPlatformColorDirty(p.slug, e.target.value)}
                                    style={{ width: 22, height: 16, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                                  {platformColors[p.slug] && platformColors[p.slug] !== platformDefaultColor && (
                                    <button onClick={() => { const n = { ...platformColors }; delete n[p.slug]; setPlatformColors(n); setSettingsDirty(true); }}
                                      style={{ fontSize: 10, color: "#333", background: "transparent", border: "none", cursor: "pointer", padding: "0 2px" }} title="Reset">↺</button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Activity Graph Colors */}
              <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Activity Graph</div>
                <div style={{ fontSize: 11, color: "#444", marginBottom: 16, lineHeight: 1.6 }}>
                  Customize the contribution heatmap colors shown on the My List tab.
                </div>
                {[
                  { key: "bg",    label: "Background",  default: "#0c0c1c" },
                  { key: "empty", label: "Empty cell",  default: "#0d0d1a" },
                  { key: "low",   label: "Low (1 session)", default: "#2d1f6b" },
                  { key: "mid",   label: "Mid (2 sessions)", default: "#5040a0" },
                  { key: "high",  label: "High (3+)",   default: "#7c6ef7" },
                ].map(({ key, label, default: def }) => {
                  const val = activityColors[key] || def;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, background: val, border: "1px solid #2a2a40", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#888", flex: 1 }}>{label}</span>
                      <input type="color" value={val} onChange={e => setActivityColorDirty(key, e.target.value)}
                        style={{ width: 26, height: 20, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                      {activityColors[key] && activityColors[key] !== def && (
                        <button onClick={() => setActivityColors(p => { const n = { ...p }; delete n[key]; return n; })}
                          style={{ fontSize: 10, color: "#333", background: "transparent", border: "none", cursor: "pointer", padding: "0 2px" }} title="Reset">↺</button>
                      )}
                    </div>
                  );
                })}
                {/* 13-week preview to fit within the panel */}
                <div style={{ marginTop: 14, padding: "10px", background: activityColors.bg || "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 8, overflowX: "hidden" }}>
                  <ActivityGraph activityLog={exampleActivityLog} colors={activityColors} numWeeks={20} />
                </div>
              </div>

            </div>

            {/* ── Full-width preview ── */}
            <div style={{ borderTop: "1px solid #16162a", paddingTop: 28, marginBottom: 40 }}>
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
                          <GameCard key={i} game={e.game} listEntry={e} cardH={altCardMode && i % 2 === 1 ? cardH2 : cardH}
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

            {/* ── Steam Integration ── */}
            <div style={{ borderTop: "1px solid #16162a", paddingTop: 28, marginBottom: 40 }}>
              <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 20 }}>Steam Integration</div>

              <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>

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
                    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                      <button onClick={syncSteam} disabled={steamSyncing}
                        style={{ width: "100%", padding: "9px 0", background: steamSyncing ? "#1a1a2e" : "#1db954", border: "none", borderRadius: 8, color: steamSyncing ? "#444" : "#fff", fontWeight: 700, fontSize: 13, cursor: steamSyncing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {steamSyncing ? "Fetching library…" : "Sync Steam Library"}
                      </button>
                      <button onClick={syncAllSteamPlaytime} disabled={syncingAllPlaytime}
                        style={{ width: "100%", padding: "9px 0", background: syncingAllPlaytime ? "#1a1a2e" : "#0a2a1a", border: "1px solid #1db95444", borderRadius: 8, color: syncingAllPlaytime ? "#444" : "#1db954", fontWeight: 700, fontSize: 13, cursor: syncingAllPlaytime ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {syncingAllPlaytime ? "Syncing playtime…" : "Sync All Playtime"}
                      </button>
                      {steamError && <div style={{ fontSize: 12, color: "#ff8080", lineHeight: 1.5 }}>{steamError}</div>}
                    </div>
                  )}
                </div>

                {/* Platform Data resync + RAWG image sync */}
                <div style={{ width: 340, flexShrink: 0, background: "#0c0c1c", border: "1px solid #1a1a2e", borderRadius: 12, padding: "24px 28px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Platform Data</div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 20, lineHeight: 1.6 }}>
                    Fill entries with no platform data. Blank entries (Steam imports) default to PC.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={async () => {
                      setResyncingPlatforms(true);
                      try {
                        const r = await apiFetch("/admin/resync-platforms", { method: "POST" });
                        setToast({ msg: `Filled platforms for ${r.updated} game${r.updated !== 1 ? "s" : ""}`, ok: true });
                        const data = await apiFetch("/list");
                        setMyList(data);
                      } catch { setToast({ msg: "Failed to fill platforms", ok: false }); }
                      finally { setResyncingPlatforms(false); }
                    }} disabled={resyncingPlatforms}
                      style={{ width: "100%", padding: "9px 0", background: resyncingPlatforms ? "#1a1a2e" : "#0a1a2a", border: "1px solid #38bdf844", borderRadius: 8, color: resyncingPlatforms ? "#444" : "#38bdf8", fontWeight: 700, fontSize: 13, cursor: resyncingPlatforms ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {resyncingPlatforms ? "Filling…" : "Fill Missing Platforms"}
                    </button>
                    <button onClick={async () => {
                      setResyncingPlatforms(true);
                      try {
                        const r = await apiFetch("/admin/resync-platforms?rawg=true", { method: "POST" });
                        setToast({ msg: `Updated ${r.rawg_updated} from RAWG, filled ${r.updated - r.rawg_updated} as PC`, ok: true });
                        const data = await apiFetch("/list");
                        setMyList(data);
                      } catch { setToast({ msg: "Failed to re-sync from RAWG", ok: false }); }
                      finally { setResyncingPlatforms(false); }
                    }} disabled={resyncingPlatforms}
                      style={{ width: "100%", padding: "9px 0", background: resyncingPlatforms ? "#1a1a2e" : "#0a1a14", border: "1px solid #4caf8044", borderRadius: 8, color: resyncingPlatforms ? "#444" : "#4caf80", fontWeight: 700, fontSize: 13, cursor: resyncingPlatforms ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {resyncingPlatforms ? "Syncing…" : "Re-sync Platforms from RAWG"}
                    </button>

                    {/* Image sync + prune — shared threshold */}
                    <div style={{ borderTop: "1px solid #1a1a2e", marginTop: 8, paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 11, color: "#444", lineHeight: 1.6 }}>
                        Skips Dropped games and games rated at or below the threshold. Custom covers are never touched.
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#666" }}>Rating threshold</span>
                        <input
                          type="number" min={0} max={10} step={0.5}
                          value={pruneThreshold}
                          onChange={e => setPruneThreshold(parseFloat(e.target.value) || 0)}
                          style={{ width: 52, background: "#080814", border: "1px solid #2a2a50", borderRadius: 5, padding: "3px 6px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit", textAlign: "center" }}
                        />
                        <span style={{ fontSize: 12, color: "#444" }}>/ 10</span>
                      </div>
                      <button onClick={async () => {
                        setResyncingSteamImages(true);
                        try {
                          const r = await apiFetch("/admin/sync-steam-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threshold: pruneThreshold }) });
                          setToast({ msg: `Updated Steam images for ${r.updated} game${r.updated !== 1 ? "s" : ""} (${r.skipped} skipped)`, ok: true });
                          const data = await apiFetch("/list");
                          setMyList(data);
                        } catch { setToast({ msg: "Failed to sync Steam images", ok: false }); }
                        finally { setResyncingSteamImages(false); }
                      }} disabled={resyncingSteamImages}
                        style={{ width: "100%", padding: "9px 0", background: resyncingSteamImages ? "#1a1a2e" : "#0a1a2a", border: "1px solid #38bdf844", borderRadius: 8, color: resyncingSteamImages ? "#444" : "#38bdf8", fontWeight: 700, fontSize: 13, cursor: resyncingSteamImages ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {resyncingSteamImages ? "Syncing…" : "Sync Images from Steam"}
                      </button>
                      <button onClick={async () => {
                        setResyncingImages(true);
                        try {
                          const r = await apiFetch("/admin/sync-rawg-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threshold: pruneThreshold }) });
                          setToast({ msg: `Updated images for ${r.updated} game${r.updated !== 1 ? "s" : ""} (${r.skipped} skipped)`, ok: true });
                          const data = await apiFetch("/list");
                          setMyList(data);
                        } catch { setToast({ msg: "Failed to sync RAWG images", ok: false }); }
                        finally { setResyncingImages(false); }
                      }} disabled={resyncingImages}
                        style={{ width: "100%", padding: "9px 0", background: resyncingImages ? "#1a1a2e" : "#1a0a2a", border: "1px solid #a78bfa44", borderRadius: 8, color: resyncingImages ? "#444" : "#a78bfa", fontWeight: 700, fontSize: 13, cursor: resyncingImages ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {resyncingImages ? "Syncing…" : "Sync Images from RAWG"}
                      </button>
                      <button onClick={async () => {
                        setPruning(true);
                        try {
                          const r = await apiFetch("/admin/prune-extra-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threshold: pruneThreshold }) });
                          setToast({ msg: `Deleted ${r.deleted_images} image${r.deleted_images !== 1 ? "s" : ""} across ${r.affected_games} game${r.affected_games !== 1 ? "s" : ""}`, ok: true });
                          const data = await apiFetch("/list");
                          setMyList(data);
                        } catch { setToast({ msg: "Failed to prune images", ok: false }); }
                        finally { setPruning(false); }
                      }} disabled={pruning}
                        style={{ width: "100%", padding: "9px 0", background: pruning ? "#1a1a2e" : "#1a0a0a", border: "1px solid #e05a5a44", borderRadius: 8, color: pruning ? "#444" : "#e05a5a", fontWeight: 700, fontSize: 13, cursor: pruning ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                        {pruning ? "Pruning…" : "Prune Extra Images"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Steam library — shown inline once synced */}
                {steamLibrary && (
                  <SteamLibrarySection
                    library={steamLibrary}
                    myList={myList}
                    onImport={importSteamGames}
                    onSyncPlaytime={syncPlaytime}
                    onRefresh={syncSteam}
                  />
                )}

              </div>
            </div>
          </>
        )}

        {/* ── Search ── */}
        {tab === "search" && (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#eeeeff", marginBottom: 6, fontFamily: "'Gloria Hallelujah', cursive" }}>
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
