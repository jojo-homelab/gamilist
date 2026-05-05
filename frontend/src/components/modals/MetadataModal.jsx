/**
 * MetadataModal.jsx — Full game metadata editing modal
 *
 * Opened when the user clicks a game card. Provides editing for:
 *   - Custom name / override
 *   - Release year (editable only when RAWG has no year)
 *   - Metacritic score (synced on demand from RAWG)
 *   - Playtime (manual input, in hours)
 *   - Replay count
 *   - User rating (0–10 heat-map picker)
 *   - Tags (free-form, importable from RAWG genres)
 *   - Platforms played (from game's platform list + manual extras)
 *   - Status (with sub-status Paused bubble and Replaying bubble)
 *   - Images (gallery, framing controls, cover upload, Steam/RAWG/PSN sync)
 *
 * Dirty detection: every editable field is snapshotted at open time in
 * `initialRef`. If any field differs, `isDirty` is true and closing
 * triggers a "Unsaved changes" confirmation overlay.
 *
 * Size: the modal max-width is `600 * modalWidthMult` px.
 */

import { useState, useRef, useEffect } from "react";
import { API, apiFetch } from "../../api.js";
import { STATUSES, ALL_PLATFORMS } from "../../constants.js";
import { rawgImgSrc, coverSrc, formatPlaytime } from "../../utils.js";
import { StarRating } from "../ui/StarRating.jsx";
import { FitTitle } from "../ui/FitTitle.jsx";
import { CollapseSection } from "../ui/CollapseSection.jsx";
import { ActivityGraph } from "../activity/ActivityGraph.jsx";

/**
 * Full-screen overlay modal for editing a game's list entry metadata.
 *
 * @param {Object} props
 * @param {number} props.gameId - Database ID of the game being edited.
 * @param {Object} props.entry - Full list entry object (includes `game` sub-object).
 * @param {function(): void} props.onClose - Close without saving (prompts if dirty).
 * @param {function(number, Object): void} props.onSave - Save handler: onSave(gameId, updates).
 * @param {function(number): void} [props.onDelete] - Delete this entry from the list.
 * @param {function(number): Promise<void>} [props.onSyncSteam] - Sync cover from Steam.
 * @param {function(number): Promise<Object>} [props.onSyncRawg] - Sync metadata/images from RAWG.
 * @param {function(number): Promise<Object>} [props.onSyncPsn] - Sync cover from PSN.
 * @param {function(number, number[]): void} [props.onCoverPromoted] - Update parent state after cover promotion.
 * @param {string} [props.platformHighlightColor="#7c6ef7"] - Accent color for platform badges.
 * @param {number} [props.cardW=315] - Card width used for proportional preview dimensions.
 * @param {number} [props.cardH=255] - Card height used for proportional preview dimensions.
 * @param {number} [props.modalWidthMult=1.0] - Width multiplier applied to the 600 px base.
 * @returns {JSX.Element|null} Returns null when entry or game is missing.
 */
export function MetadataModal({
  gameId, entry, onClose, onSave, onDelete, onSyncSteam, onSyncRawg, onSyncPsn,
  onCoverPromoted,
  platformHighlightColor = "#7c6ef7", cardW = 315, cardH = 255, modalWidthMult = 1.0,
}) {
  const game = entry?.game;

  // ── Editable state ──────────────────────────────────────────────────────
  const [replayCount, setReplayCount]     = useState(entry?.replayCount ?? 0);
  const [userRating, setUserRating]       = useState(entry?.userRating ?? null);
  const [metacriticLocal, setMetacriticLocal] = useState(null); // overrides game.metacritic after sync
  const [tags, setTags]                 = useState(entry?.tags ?? []);
  const [tagInput, setTagInput]         = useState("");
  const [platforms, setPlatforms]       = useState(entry?.platformsPlayed ?? []);
  const origYear = game?.released ? game.released.slice(0, 4) : "";
  const [yearInput, setYearInput]       = useState(origYear);
  const [playtime, setPlaytime]         = useState(
    entry?.playtimeMinutes != null ? Math.round(entry.playtimeMinutes / 60 * 10) / 10 : ""
  );
  const [customImagesOnly, setCustomImagesOnly] = useState(entry?.customImagesOnly || false);
  const [extraImageIds, setExtraImageIds]       = useState(entry?.extraImageIds || []);
  // RAWG short_screenshots deduplicated against the main background_image
  const [shortScreenshots, setShortScreenshots] = useState(
    (game?.short_screenshots || []).filter(ss => ss.image !== game?.background_image)
  );
  const [uploadingImg, setUploadingImg]         = useState(false);
  const [imgPosX, setImgPosX]                   = useState(entry?.imgPosX ?? 50);
  const [imgPosY, setImgPosY]                   = useState(entry?.imgPosY ?? 50);
  const [imgFit,  setImgFit]                    = useState(entry?.imgFit  ?? "cover");
  const [customName, setCustomName]               = useState(entry?.customName || "");

  // ── Status state ────────────────────────────────────────────────────────
  // Replaying (4) / Plan to Replay (5) require an existing rating — they appear
  // as a sub-status bubble under "Played". Paused (8) is a sub-status of Playing.
  const isPlayedWithRating = (entry?.status === 4 || entry?.status === 5) && entry?.userRating != null;
  const isPausedEntry = entry?.status === 8;
  const [selectedStatus, setSelectedStatus]      = useState(isPlayedWithRating ? 1 : isPausedEntry ? 0 : (entry?.status ?? 0));
  const [replayStatus, setReplayStatus]          = useState(isPlayedWithRating ? (entry?.status ?? null) : null);
  const [pauseActive, setPauseActive]            = useState(isPausedEntry);

  // ── UI state ────────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete]        = useState(false);
  const [syncingSteam, setSyncingSteam]          = useState(false);
  const [steamSynced, setSteamSynced]            = useState(false);
  const [steamError, setSteamError]              = useState(null);
  const [syncingRawg, setSyncingRawg]            = useState(false);
  const [rawgSynced, setRawgSynced]              = useState(false);
  const [syncingPsn, setSyncingPsn]              = useState(false);
  const [psnSynced, setPsnSynced]                = useState(false);
  const [psnError, setPsnError]                  = useState(null);
  const [dragOverIdx, setDragOverIdx]            = useState(null);
  const [coverDropOver, setCoverDropOver]        = useState(false);
  const [promotingCover, setPromotingCover]      = useState(false);
  const [hasCoverLocal, setHasCoverLocal]        = useState(entry?.hasCover || false);
  const [previewKey, setPreviewKey]              = useState(0);
  const [coverWasPromoted, setCoverWasPromoted]  = useState(false);
  const [confirmClose, setConfirmClose]          = useState(false);
  const [framingOpen, setFramingOpen]            = useState(false);
  const [imagesOpen, setImagesOpen]              = useState(false);
  const [framingImgIdx, setFramingImgIdx]        = useState(0); // unused; kept for parity
  const [topImgIdx, setTopImgIdx]                = useState(0);
  const dragIdxRef                               = useRef(null);
  const imageUploadRef = useRef();

  // ── Dirty detection ─────────────────────────────────────────────────────
  // Snapshot all editable values at open time so we can detect unsaved changes
  const initialRef = useRef({
    customName:       entry?.customName || "",
    effectiveStatus:  entry?.status ?? 0,
    userRating:       entry?.userRating ?? null,
    replayCount:      entry?.replayCount ?? 0,
    playtime:         entry?.playtimeMinutes != null ? String(Math.round(entry.playtimeMinutes / 60 * 10) / 10) : "",
    tags:             JSON.stringify(entry?.tags ?? []),
    platforms:        JSON.stringify(entry?.platformsPlayed ?? []),
    customImagesOnly: entry?.customImagesOnly || false,
    imgPosX:          entry?.imgPosX ?? 50,
    imgPosY:          entry?.imgPosY ?? 50,
    imgFit:           entry?.imgFit  ?? "cover",
    yearInput:        game?.released ? game.released.slice(0, 4) : "",
    shortScreenshots: JSON.stringify((game?.short_screenshots || []).filter(ss => ss.image !== game?.background_image)),
  });

  const isDirty =
    customName       !== initialRef.current.customName       ||
    (replayStatus ?? (pauseActive ? 8 : selectedStatus)) !== initialRef.current.effectiveStatus ||
    userRating       !== initialRef.current.userRating       ||
    replayCount      !== initialRef.current.replayCount      ||
    String(playtime) !== initialRef.current.playtime         ||
    JSON.stringify(tags)      !== initialRef.current.tags    ||
    JSON.stringify(platforms) !== initialRef.current.platforms ||
    customImagesOnly !== initialRef.current.customImagesOnly ||
    imgPosX          !== initialRef.current.imgPosX          ||
    imgPosY          !== initialRef.current.imgPosY          ||
    imgFit           !== initialRef.current.imgFit           ||
    yearInput        !== initialRef.current.yearInput        ||
    JSON.stringify(shortScreenshots) !== initialRef.current.shortScreenshots ||
    coverWasPromoted;

  /** Request close — show confirmation overlay if there are unsaved changes. */
  const handleRequestClose = () => {
    if (confirmClose) return;
    if (isDirty) { setConfirmClose(true); } else { onClose(); }
  };

  const isSteamGame = (entry?.game?.slug || "").startsWith("steam-");

  // ── Sync handlers ────────────────────────────────────────────────────────

  const handleSyncSteam = async () => {
    if (!onSyncSteam) return;
    setSyncingSteam(true); setSteamError(null);
    try {
      await onSyncSteam(gameId);
      setSteamSynced(true);
      setTimeout(() => setSteamSynced(false), 2000);
    } catch (e) {
      setSteamError(
        e.message.includes("404")
          ? "No Steam images found — this game may not be available on Steam."
          : "Steam sync failed."
      );
    } finally { setSyncingSteam(false); }
  };

  const handleSyncRawg = async () => {
    if (!onSyncRawg) return;
    setSyncingRawg(true);
    const result = await onSyncRawg(gameId);
    setSyncingRawg(false);
    if (result) {
      if (result.extraImageIds) setExtraImageIds(result.extraImageIds);
      if (result.metacritic != null) setMetacriticLocal(result.metacritic);
      setShortScreenshots([]);
      setRawgSynced(true);
      setTimeout(() => setRawgSynced(false), 2000);
    }
  };

  const handleSyncPsn = async () => {
    if (!onSyncPsn) return;
    setSyncingPsn(true); setPsnError(null);
    try {
      const result = await onSyncPsn(gameId);
      if (result?.hasCover) { setHasCoverLocal(true); setPreviewKey(k => k + 1); }
      setPsnSynced(true);
      setTimeout(() => setPsnSynced(false), 2000);
    } catch (e) {
      setPsnError(
        e.message.includes("404")
          ? "Not found in your PSN library — the game may be under a different title."
          : "PSN sync failed."
      );
    } finally { setSyncingPsn(false); }
  };

  // ── Cover promotion (drag extra image → cover slot) ──────────────────────

  const promoteImageToCover = async (fromIdx) => {
    const imageId = extraImageIds[fromIdx];
    setPromotingCover(true);
    try {
      const result = await apiFetch(`/list/${gameId}/images/${imageId}/promote-to-cover`, { method: "POST" });
      const newExtraIds = result.extraImageIds || [];
      setExtraImageIds(newExtraIds);
      setHasCoverLocal(true);
      setCoverWasPromoted(true);
      setPreviewKey(k => k + 1);
      // Reset framing to center after promoting
      setImgPosX(50); setImgPosY(50);
      // Notify parent immediately so the card updates without waiting for Save
      if (onCoverPromoted) onCoverPromoted(gameId, newExtraIds);
    } finally { setPromotingCover(false); }
  };

  // ── Gallery drag-and-drop reordering ─────────────────────────────────────

  const handleDragStart = (idx) => { dragIdxRef.current = idx; };
  const handleDragOver  = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragEnd   = () => { dragIdxRef.current = null; setDragOverIdx(null); setCoverDropOver(false); };
  const handleDrop      = async (e, toIdx) => {
    e.preventDefault();
    const fromIdx = dragIdxRef.current;
    dragIdxRef.current = null; setDragOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    const newIds = [...extraImageIds];
    const [moved] = newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, moved);
    setExtraImageIds(newIds);
    // Persist reorder to backend immediately (no Save required)
    await fetch(`${API}/list/${gameId}/images/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: newIds }),
    });
  };

  // ── Platform management ───────────────────────────────────────────────────

  // Game's own RAWG platform slugs
  const gamePlatformSlugs = (game?.platforms || []).map(gp => gp.platform.slug);
  // Slugs the user manually added that are not in the RAWG list for this game
  const [extraPlatformSlugs, setExtraPlatformSlugs] = useState(() =>
    (entry?.platformsPlayed ?? []).filter(s => !gamePlatformSlugs.includes(s))
  );
  const [selectedAddPlatform, setSelectedAddPlatform] = useState("");

  const togglePlatform = (slug) =>
    setPlatforms(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);

  const addExtraPlatform = () => {
    if (!selectedAddPlatform) return;
    if (gamePlatformSlugs.includes(selectedAddPlatform)) {
      // Selecting a game's own platform from the extras dropdown just marks it as played
      setPlatforms(prev => prev.includes(selectedAddPlatform) ? prev : [...prev, selectedAddPlatform]);
    } else if (!extraPlatformSlugs.includes(selectedAddPlatform)) {
      setExtraPlatformSlugs(prev => [...prev, selectedAddPlatform]);
      setPlatforms(prev => prev.includes(selectedAddPlatform) ? prev : [...prev, selectedAddPlatform]);
    }
    setSelectedAddPlatform("");
  };

  const removeExtraPlatform = (slug) => {
    setExtraPlatformSlugs(prev => prev.filter(s => s !== slug));
    setPlatforms(prev => prev.filter(s => s !== slug));
  };

  // Determine which platforms can still be added from the dropdown
  const hasSelectedPlatforms = platforms.length > 0;
  const allShownSlugs = [...gamePlatformSlugs, ...extraPlatformSlugs];
  const addablePlatforms = hasSelectedPlatforms
    ? ALL_PLATFORMS.filter(p => !platforms.includes(p.slug) && !extraPlatformSlugs.includes(p.slug))
    : ALL_PLATFORMS.filter(p => !allShownSlugs.includes(p.slug));

  // ── Image upload ──────────────────────────────────────────────────────────

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

  // ── Status helpers ────────────────────────────────────────────────────────

  const handleSetStatus = (newStatus) => {
    setSelectedStatus(newStatus);
    setReplayStatus(null);
    setPauseActive(false);
  };

  // ── Top preview image rotation ────────────────────────────────────────────

  // Build the ordered image list for the large top-of-modal preview
  const framingImages = [
    hasCoverLocal ? `${coverSrc(gameId)}?v=prev-${previewKey}` : rawgImgSrc(entry?.game?.background_image),
    ...extraImageIds.map(id => `${API}/images/${id}`),
    ...shortScreenshots.map(ss => rawgImgSrc(ss.image)),
  ].filter(Boolean);

  // Auto-advance the top image every 15 s
  useEffect(() => {
    if (framingImages.length <= 1) return;
    const t = setInterval(() => setTopImgIdx(i => (i + 1) % framingImages.length), 15000);
    return () => clearInterval(t);
  }, [framingImages.length]);

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = () => {
    const isDropped = selectedStatus === 6;
    const updatedGame = {
      // If the user edited the year for an unresolved game, patch released date
      ...(yearInput !== origYear ? { ...game, released: yearInput ? `${yearInput}-01-01` : null } : game),
      // Dropped games have their RAWG screenshots cleared to save space
      short_screenshots: isDropped ? [] : shortScreenshots,
    };
    onSave(gameId, {
      game: updatedGame,
      replayCount,
      userRating,
      tags,
      platformsPlayed: platforms,
      playtimeMinutes: playtime !== "" ? Math.round(parseFloat(playtime) * 60) : (entry.playtimeMinutes ?? null),
      customImagesOnly,
      imgPosX, imgPosY, imgFit,
      customName: customName.trim() && customName.trim() !== game.name.trim() ? customName.trim() : null,
      status: replayStatus ?? (pauseActive ? 8 : selectedStatus),
      hasCover: hasCoverLocal,
      extraImageIds,
      coverWasPromoted,
    });
    onClose();
  };

  // ── Layout constants ──────────────────────────────────────────────────────

  // Modal max width (base 600 px × multiplier)
  const modalMaxW = Math.round(600 * modalWidthMult);
  // Content width = maxWidth − left+right padding (28×2 = 56)
  const contentW = modalMaxW - 56;
  // Show all rating buttons in a single wide row when the modal is wide enough
  const singleRowRatings = contentW >= 680;
  // Preview banner: 2× card aspect ratio, capped to content width
  const previewW = Math.min(cardW * 2, contentW);
  const previewH = Math.round(previewW * cardH / cardW);
  // Prefer post-sync metacritic over the stored value
  const metacriticDisplay = metacriticLocal ?? game.metacritic;

  // Per-rating color map (fixed defaults matching the main list)
  const ratingColor = (v) => ({
    "10":"#FFD700","9.5":"#f0c020","9":"#e8b030","8.5":"#e0a040","8":"#d89050",
    "7.5":"#cc8060","7":"#c07070","6.5":"#aa6080","6":"#9060a0","5.5":"#7050b0",
    "5":"#6040c0","4":"#e05c7a","3":"#e05c7a","2":"#e05c7a","1":"#e05c7a","0":"#e05c7a",
  }[String(v)] || "#e6a63a");

  // Shared style objects for consistency inside JSX
  const LBL = { fontSize: 10, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 };
  const SEC = { fontSize: 20, color: "#eeeeff", fontWeight: 800, marginBottom: 14, letterSpacing: 0.3 };
  // Dashed-border box used for section cards (SVG data-URL background)
  const dashSvg = (rx) => `url("data:image/svg+xml,${encodeURIComponent(`<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="none" rx="${rx}" ry="${rx}" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-dasharray="11 6" stroke-linecap="round"/></svg>`)}")`;
  const BOX = { backgroundImage: dashSvg(12), backgroundColor: "#09091a", borderRadius: 12, padding: "16px 18px", marginBottom: 14 };

  // Inline SVG icons (defined as components to avoid repeating markup)
  const Pencil = () => (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ display: "inline", verticalAlign: "middle" }}>
      <path d="M9.5 2L12 4.5L4.5 12H2V9.5L9.5 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7.8 3.7L10.3 6.2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
  const DownRightArrow = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <polyline points="5,2 5,12 15,12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="12,9 15,12 12,15" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  // Guard: don't render if entry/game is missing (shouldn't happen in normal usage)
  if (!entry || !game) return null;

  // ── Tag helpers ───────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div onClick={handleRequestClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "var(--theme-surface)", border: "1px solid #1e1e35", borderRadius: 16, width: "100%", maxWidth: modalMaxW, maxHeight: "90vh", overflowY: "auto", padding: 24, position: "relative" }}>

        {/* ── Header bar ── */}
        <button onClick={handleRequestClose} style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", color: "#444", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#eeeeff", marginBottom: 14, paddingRight: 24, lineHeight: 1.1 }}>
          {customName.trim() && customName.trim() !== game.name.trim() ? customName.trim() : game.name}
        </div>

        {/* ── Full-width cover preview — auto-rotates every 15 s ── */}
        <div style={{ position: "relative", width: "100%", height: Math.round(contentW * cardH / cardW), borderRadius: 10, overflow: "hidden", background: "#080814", marginBottom: 14 }}>
          {framingImages[topImgIdx]
            ? <img src={framingImages[topImgIdx]} alt="" style={{ width: "100%", height: "100%", objectFit: imgFit, objectPosition: `${imgPosX}% ${imgPosY}%`, display: "block" }} />
            : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🎮</div>
          }
          {/* Dot navigation for multiple images */}
          {framingImages.length > 1 && (
            <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 4 }}>
              {framingImages.map((_, i) => (
                <div key={i} onClick={() => setTopImgIdx(i)}
                  style={{ width: i === topImgIdx ? 14 : 5, height: 5, borderRadius: 3, background: i === topImgIdx ? "#fff" : "rgba(255,255,255,0.35)", cursor: "pointer", transition: "all 0.3s", flexShrink: 0 }} />
              ))}
            </div>
          )}
        </div>

        {/* ── GAME METADATA section ── */}
        <div style={BOX}>
          <div style={SEC}>Game Metadata</div>

          {/* Name */}
          <div style={{ marginBottom: 20 }}>
            <div style={LBL}>Name</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={customName} onChange={e => setCustomName(e.target.value)}
                onFocus={() => { if (!customName) setCustomName(game.name); }}
                placeholder={game.name}
                style={{ flex: 1, background: "#080814", border: "1px solid #2a2a40", borderRadius: 6, padding: "5px 9px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
              {customName && (
                <button onClick={() => setCustomName("")}
                  style={{ padding: "5px 10px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                  title="Reset to original name">×</button>
              )}
            </div>
          </div>

          {/* Year · Metacritic · Playtime · Replays · Rating */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
            {/* Year */}
            <div style={{ flexShrink: 0 }}>
              <div style={LBL}>Year</div>
              {origYear
                ? <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: "#12121e", border: "1px solid #2a2a40", color: "#888", fontSize: 13, fontWeight: 700 }}>{origYear}</span>
                : <input type="number" min="1970" max="2030" value={yearInput} onChange={e => setYearInput(e.target.value)} placeholder="Year"
                    style={{ width: 75, background: "#080814", border: "1px solid #2a2a40", borderRadius: 6, padding: "3px 8px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
              }
            </div>

            {/* Metacritic */}
            <div style={{ flexShrink: 0 }}>
              <div style={LBL}>Metacritic</div>
              {metacriticDisplay > 0
                ? <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6,
                    background: metacriticDisplay >= 75 ? "#1a3a1a" : metacriticDisplay >= 50 ? "#2a2a0a" : "rgba(200,50,50,0.12)",
                    border: `1px solid ${metacriticDisplay >= 75 ? "#4caf8066" : metacriticDisplay >= 50 ? "#e6a63a66" : "#ff606066"}`,
                    color: metacriticDisplay >= 75 ? "#4caf80" : metacriticDisplay >= 50 ? "#e6a63a" : "#ff8080",
                    fontSize: 13, fontWeight: 800 }}>{metacriticDisplay}</span>
                : onSyncRawg
                  ? <button onClick={handleSyncRawg} disabled={syncingRawg}
                      style={{ padding: "3px 10px", borderRadius: 6, background: "transparent", border: "1px solid #2a2a40", color: syncingRawg ? "#444" : "#a78bfa", fontSize: 11, cursor: syncingRawg ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {syncingRawg ? "…" : "Sync"}
                    </button>
                  : <span style={{ color: "#444", fontSize: 12 }}>—</span>
              }
            </div>

            {/* Playtime */}
            <div style={{ flexShrink: 0 }}>
              <div style={LBL}>Playtime (h)</div>
              <input type="number" min="0" step="0.1" value={playtime} onChange={e => setPlaytime(e.target.value)} placeholder="0.0"
                style={{ width: 80, background: "#080814", border: "1px solid #2a2a40", borderRadius: 6, padding: "3px 8px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
              {entry.playtimeMinutes != null && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>~{formatPlaytime(entry.playtimeMinutes)}</div>}
            </div>

            {/* Replay count */}
            <div style={{ flexShrink: 0 }}>
              <div style={LBL}>Replays</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setReplayCount(c => Math.max(0, c - 1))}
                  style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#eeeeff", minWidth: 20, textAlign: "center" }}>{replayCount}</span>
                <button onClick={() => setReplayCount(c => c + 1)}
                  style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>

            {/* Rating heat-map — two rows of clickable score buttons */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ ...LBL, marginBottom: 0, writingMode: "vertical-lr", transform: "rotate(180deg)", flexShrink: 0, letterSpacing: 2 }}>Rating</div>
              <div style={{ flex: 1 }}>
                {[[10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5], [6, 5.5, 5, 4, 3, 2, 1, 0]].map((row, ri) => (
                  <div key={ri} style={{ display: "flex", gap: 3, marginBottom: ri === 0 ? 3 : 0 }}>
                    {row.map(v => {
                      const c = ratingColor(v);
                      const sel = userRating === v;
                      return (
                        <button key={v} onClick={() => setUserRating(sel ? null : v)}
                          style={{ flex: 1, padding: "3px 0", borderRadius: 4,
                            border: `1px solid ${sel ? c + "dd" : c + "44"}`,
                            background: sel ? c + "30" : c + "10",
                            color: sel ? c : c + "77",
                            fontSize: 9, cursor: "pointer",
                            fontWeight: sel ? 800 : 500,
                            fontFamily: "inherit", transition: "all 0.15s",
                            boxShadow: sel ? `0 0 7px ${c}88` : "none" }}>
                          {v}
                        </button>
                      );
                    })}
                    {ri === 1 && userRating !== null && (
                      <button onClick={() => setUserRating(null)}
                        style={{ flex: 1, padding: "3px 0", borderRadius: 4, border: "1px solid #2a2a40",
                          background: "transparent", color: "#555", fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tags + Platforms */}
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            {/* Tags */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={LBL}>Tags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: tags.length ? 6 : 0 }}>
                {tags.map(t => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#12121e", border: "1px solid #2a2a40", borderRadius: 20, padding: "2px 8px", fontSize: 10, color: "#a0a0cc" }}>
                    {t}
                    <button onClick={() => removeTag(t)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                  placeholder="Add tag…"
                  style={{ flex: 1, background: "#080814", border: "1px solid #1e1e35", borderRadius: 6, padding: "3px 8px", color: "#e0e0f0", fontSize: 11, outline: "none", fontFamily: "inherit" }} />
                <button onClick={() => addTag(tagInput)} style={{ padding: "3px 10px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: "#7c6ef7", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
              </div>
            </div>

            {/* Platforms */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={LBL}>Platforms</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {(hasSelectedPlatforms
                  ? (game.platforms || []).filter(gp => platforms.includes(gp.platform.slug))
                  : (game.platforms || [])
                ).map(gp => {
                  const slug = gp.platform.slug;
                  const pInfo = ALL_PLATFORMS.find(ap => ap.slug === slug) || { short: slug.slice(0, 4), name: gp.platform.name };
                  const active = platforms.includes(slug);
                  return (
                    <span key={slug} onClick={() => togglePlatform(slug)} title={pInfo.name}
                      style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: active ? platformHighlightColor + "25" : "#16162a",
                        border: `1px solid ${active ? platformHighlightColor + "99" : "#1e1e35"}`,
                        color: active ? platformHighlightColor : "#444", cursor: "pointer", userSelect: "none" }}>
                      {pInfo.short}
                    </span>
                  );
                })}
                {/* User-added platforms not in the RAWG list */}
                {extraPlatformSlugs.map(slug => {
                  const pInfo = ALL_PLATFORMS.find(ap => ap.slug === slug) || { short: slug.slice(0, 4), name: slug };
                  const active = platforms.includes(slug);
                  return (
                    <span key={slug} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                      background: active ? platformHighlightColor + "25" : "#16162a",
                      border: `1px solid ${active ? platformHighlightColor + "99" : "#1e1e35"}`,
                      color: active ? platformHighlightColor : "#444", userSelect: "none" }}>
                      <span onClick={() => togglePlatform(slug)} style={{ cursor: "pointer" }} title={pInfo.name}>{pInfo.short}</span>
                      <button onClick={() => removeExtraPlatform(slug)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  );
                })}
              </div>
              {addablePlatforms.length > 0 && (
                <div style={{ display: "flex", gap: 5 }}>
                  <select value={selectedAddPlatform} onChange={e => setSelectedAddPlatform(e.target.value)}
                    style={{ flex: 1, background: "#080814", border: "1px solid #1e1e35", borderRadius: 6, padding: "3px 6px", color: "#e0e0f0", fontSize: 11, outline: "none", fontFamily: "inherit" }}>
                    <option value="">Add platform…</option>
                    {addablePlatforms.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                  </select>
                  <button onClick={addExtraPlatform} disabled={!selectedAddPlatform}
                    style={{ padding: "3px 10px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: selectedAddPlatform ? "#7c6ef7" : "#333", fontSize: 11, cursor: selectedAddPlatform ? "pointer" : "not-allowed", fontFamily: "inherit" }}>Add</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── STATUS section ── */}
        <div style={BOX}>
          <div style={SEC}>Status</div>

          {/* Primary status buttons — Replaying (4), Plan to Replay (5), Paused (8) excluded from main row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: (selectedStatus === 1 && userRating !== null) || selectedStatus === 0 ? 10 : 0 }}>
            {STATUSES
              .filter(s => pauseActive ? [0, 1, 6].includes(s.id) : ![4, 5, 8].includes(s.id))
              .map(s => (
              <button key={s.id} onClick={() => handleSetStatus(s.id)}
                style={{ padding: "4px 10px", borderRadius: 6,
                  border: `1px solid ${selectedStatus === s.id && !pauseActive ? s.color + "99" : "#2a2a40"}`,
                  background: selectedStatus === s.id && !pauseActive ? s.bg : "transparent",
                  color: selectedStatus === s.id && !pauseActive ? s.color : "#555",
                  fontSize: 11, cursor: "pointer", fontWeight: selectedStatus === s.id && !pauseActive ? 700 : 400,
                  fontFamily: "inherit", transition: "all 0.1s" }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Paused sub-status bubble — appears under Playing */}
          {selectedStatus === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 0 }}>
              <DownRightArrow />
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
                backgroundImage: dashSvg(8), backgroundColor: "#080814", borderRadius: 8 }}>
                {(() => {
                  const s = STATUSES.find(x => x.id === 8);
                  return (
                    <button
                      onClick={() => setPauseActive(v => !v)}
                      style={{ padding: "3px 10px", borderRadius: 6,
                        border: `1px solid ${pauseActive ? s.color + "99" : "#2a2a40"}`,
                        background: pauseActive ? s.bg : "transparent",
                        color: pauseActive ? s.color : "#555",
                        fontSize: 10, cursor: "pointer", fontWeight: pauseActive ? 700 : 400,
                        fontFamily: "inherit", transition: "all 0.1s" }}>
                      {s.label}
                    </button>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Replay sub-status bubble — appears under Played when a rating exists */}
          {selectedStatus === 1 && userRating !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 72 }}>
              <DownRightArrow />
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
                backgroundImage: dashSvg(8), backgroundColor: "#080814", borderRadius: 8 }}>
                {[STATUSES[4], STATUSES[5]].map(s => {
                  const isActive = replayStatus === s.id;
                  return (
                    <button key={s.id}
                      onClick={() => {
                        if (isActive) {
                          setReplayStatus(null);
                          // If removing Replaying from a game that was already Replaying, increment replay count
                          if (s.id === 4 && isPlayedWithRating && entry?.status === 4) setReplayCount(c => c + 1);
                        } else { setReplayStatus(s.id); }
                      }}
                      title={s.id === 4 && isActive && isPlayedWithRating && entry?.status === 4 ? "Removing will add 1 replay" : undefined}
                      style={{ padding: "3px 10px", borderRadius: 6,
                        border: `1px solid ${isActive ? s.color + "99" : "#2a2a40"}`,
                        background: isActive ? s.bg : "transparent",
                        color: isActive ? s.color : "#555",
                        fontSize: 10, cursor: "pointer", fontWeight: isActive ? 700 : 400, fontFamily: "inherit", transition: "all 0.1s" }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── IMAGES section ── */}
        <div style={BOX}>
          <div style={SEC}>Images</div>

          {/* Image Framing controls */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: framingOpen ? 14 : 0 }}>
              <div style={{ ...LBL, marginBottom: 0 }}>Image Framing</div>
              <button onClick={() => setFramingOpen(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", color: "#fff", padding: "2px 4px" }}>
                <Pencil />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>Edit</span>
              </button>
            </div>
            {framingOpen && (
              <div>
                {/* Fill / Fit mode toggle */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                  <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #1e1e35" }}>
                    {["cover", "contain"].map(mode => (
                      <button key={mode} onClick={() => setImgFit(mode)}
                        style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, fontFamily: "inherit", border: "none", cursor: "pointer", background: imgFit === mode ? "#7c6ef7" : "transparent", color: imgFit === mode ? "#fff" : "#555", transition: "background 0.15s, color 0.15s" }}>
                        {mode === "cover" ? "Fill" : "Fit"}
                      </button>
                    ))}
                  </div>
                </div>
                {/* H/V position sliders */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { label: "H", value: imgPosX, set: setImgPosX, color: "#7c6ef7" },
                    { label: "V", value: imgPosY, set: setImgPosY, color: "#38bdf8" },
                  ].map(({ label, value, set, color }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "#555", fontWeight: 700, width: 10, flexShrink: 0 }}>{label}</span>
                      <input type="range" min={0} max={100} step={1} value={value}
                        onChange={e => set(parseFloat(e.target.value))}
                        style={{ flex: 1, accentColor: color, cursor: "pointer", height: 4 }} />
                      <span style={{ fontSize: 10, color, fontWeight: 700, width: 28, textAlign: "right", flexShrink: 0 }}>{value}%</span>
                    </div>
                  ))}
                  <button onClick={() => { setImgPosX(50); setImgPosY(50); }}
                    style={{ fontSize: 10, color: "#444", background: "transparent", border: "1px solid #1e1e35", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start", marginTop: 2 }}>
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Gallery */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: imagesOpen ? 16 : 0 }}>
              <div style={{ ...LBL, marginBottom: 0 }}>Gallery</div>
              <button onClick={() => setImagesOpen(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", color: "#fff", padding: "2px 4px" }}>
                <Pencil />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>Edit</span>
              </button>
            </div>
            {imagesOpen && (
              <>
                {/* Custom images only toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#888", flex: 1 }}>Custom images only (skip RAWG cover)</span>
                  <button onClick={() => setCustomImagesOnly(v => !v)}
                    style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: customImagesOnly ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: customImagesOnly ? 19 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                {/* Thumbnail strip — cover + extras + RAWG screenshots */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {/* Cover slot (drop target for promote-to-cover) */}
                  {(() => {
                    const src = hasCoverLocal ? `${coverSrc(gameId)}?v=cover-${previewKey}` : rawgImgSrc(game.background_image);
                    if (!src) return null;
                    return (
                      <div
                        onDragOver={e => { e.preventDefault(); setCoverDropOver(true); }}
                        onDragLeave={() => setCoverDropOver(false)}
                        onDrop={e => { e.preventDefault(); setCoverDropOver(false); if (dragIdxRef.current !== null) promoteImageToCover(dragIdxRef.current); }}
                        style={{ position: "relative", borderRadius: 6, outline: coverDropOver ? "2px dashed #7c6ef7" : "none", outlineOffset: 2 }}>
                        <img src={src} alt="cover" style={{ width: 60, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${coverDropOver ? "#7c6ef7" : "#7c6ef766"}`, display: "block" }} />
                        <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#7c6ef7", fontWeight: 700 }}>cover</div>
                        {promotingCover && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>…</div>}
                        {coverDropOver && !promotingCover && <div style={{ position: "absolute", inset: 0, background: "rgba(124,110,247,0.15)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, pointerEvents: "none" }}>⇥</div>}
                      </div>
                    );
                  })()}

                  {/* Extra uploaded images (draggable to reorder, promote-to-cover button) */}
                  {extraImageIds.map((id, idx) => (
                    <div key={id}
                      draggable
                      onDragStart={() => handleDragStart(idx)} onDragOver={e => handleDragOver(e, idx)}
                      onDrop={e => handleDrop(e, idx)} onDragEnd={handleDragEnd}
                      style={{ position: "relative", cursor: "grab", outline: dragOverIdx === idx ? "2px solid #7c6ef7" : "none", borderRadius: 6, opacity: dragIdxRef.current === idx ? 0.4 : 1 }}>
                      <img src={`${API}/images/${id}`} alt="" style={{ width: 60, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #2a2a40", display: "block" }} />
                      <button onClick={() => deleteExtraImage(id)} style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "#2a0a0a", border: "1px solid #ff606066", color: "#ff6060", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>×</button>
                      <button onClick={() => promoteImageToCover(idx)} disabled={promotingCover} title="Set as cover" style={{ position: "absolute", top: -6, left: -6, width: 16, height: 16, borderRadius: "50%", background: "#0a1a2a", border: "1px solid #7c6ef766", color: "#7c6ef7", cursor: promotingCover ? "not-allowed" : "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>⭳</button>
                      <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#555" }}>#{idx + 1}</div>
                    </div>
                  ))}

                  {/* RAWG short_screenshots (deleteable, shown at reduced opacity) */}
                  {shortScreenshots.map((ss, idx) => (
                    <div key={ss.id ?? idx} style={{ position: "relative" }}>
                      <img src={rawgImgSrc(ss.image)} alt="" style={{ width: 60, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #1a1a30", display: "block", opacity: 0.7 }} onError={e => e.target.style.display = "none"} />
                      <button onClick={() => setShortScreenshots(prev => prev.filter((_, i) => i !== idx))} style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "#2a0a0a", border: "1px solid #ff606066", color: "#ff6060", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>×</button>
                      <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#555" }}>rawg</div>
                    </div>
                  ))}
                </div>

                {/* Upload + sync action buttons */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input ref={imageUploadRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImageUpload} />
                  <button onClick={() => imageUploadRef.current?.click()} disabled={uploadingImg}
                    style={{ padding: "5px 14px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: uploadingImg ? "#333" : "#7c6ef7", fontSize: 12, cursor: uploadingImg ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {uploadingImg ? "Uploading…" : "+ Upload Image(s)"}
                  </button>
                  {onSyncSteam && (
                    <button onClick={handleSyncSteam} disabled={syncingSteam}
                      style={{ padding: "5px 14px", background: "transparent", border: `1px solid ${steamSynced ? "#4caf80" : steamError ? "#ff606066" : "#3a4a5a"}`, borderRadius: 6, color: steamSynced ? "#4caf80" : steamError ? "#ff8080" : syncingSteam ? "#333" : "#88aacc", fontSize: 12, cursor: syncingSteam ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {steamSynced ? "Synced!" : syncingSteam ? "Syncing…" : "Sync from Steam"}
                    </button>
                  )}
                  {steamError && <div style={{ fontSize: 11, color: "#ff8080", marginTop: 4, width: "100%" }}>{steamError}</div>}
                  {onSyncRawg && (
                    <button onClick={handleSyncRawg} disabled={syncingRawg}
                      style={{ padding: "5px 14px", background: "transparent", border: `1px solid ${rawgSynced ? "#4caf80" : "#a78bfa44"}`, borderRadius: 6, color: rawgSynced ? "#4caf80" : syncingRawg ? "#333" : "#a78bfa", fontSize: 12, cursor: syncingRawg ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {rawgSynced ? "Synced!" : syncingRawg ? "Syncing…" : "Sync from RAWG"}
                    </button>
                  )}
                  {onSyncPsn && (
                    <button onClick={handleSyncPsn} disabled={syncingPsn}
                      style={{ padding: "5px 14px", background: "transparent", border: `1px solid ${psnSynced ? "#4caf80" : psnError ? "#ff606066" : "#003f8844"}`, borderRadius: 6, color: psnSynced ? "#4caf80" : psnError ? "#ff8080" : syncingPsn ? "#333" : "#006FCD", fontSize: 12, cursor: syncingPsn ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {psnSynced ? "Synced!" : syncingPsn ? "Syncing…" : "Sync from PSN"}
                    </button>
                  )}
                  {psnError && <div style={{ fontSize: 11, color: "#ff8080", marginTop: 4, width: "100%" }}>{psnError}</div>}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer — delete + cancel + save ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingTop: 8 }}>
          {onDelete && (
            confirmDelete
              ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#e05a5a" }}>Remove from list?</span>
                  <button onClick={() => { onDelete(gameId); onClose(); }} style={{ padding: "5px 14px", background: "#e05a5a", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 6, color: "#555", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </div>
              : <button onClick={() => setConfirmDelete(true)} style={{ padding: "5px 14px", background: "transparent", border: "1px solid #e05a5a", borderRadius: 6, color: "#e05a5a", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Delete entry</button>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={handleRequestClose} style={{ padding: "7px 16px", background: "transparent", border: "1px solid #2a2a40", borderRadius: 8, color: "#555", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
            <button onClick={handleSave} disabled={uploadingImg} style={{ padding: "7px 20px", background: uploadingImg ? "#2a2a40" : "#7c6ef7", border: "none", borderRadius: 8, color: uploadingImg ? "#888" : "#fff", fontWeight: 700, fontSize: 13, cursor: uploadingImg ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {uploadingImg ? "Uploading…" : "Save"}
            </button>
          </div>
        </div>

        {/* ── Unsaved changes confirmation overlay ── */}
        {confirmClose && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)", borderRadius: 16, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#0e0e20", border: "1px solid #2a2a45", borderRadius: 14, padding: "28px 32px", maxWidth: 340, width: "100%", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#eeeeff", marginBottom: 8 }}>Unsaved changes</div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 24, lineHeight: 1.6 }}>You have unsaved changes. Save them before closing or discard them.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={handleSave} style={{ padding: "9px 0", background: "#7c6ef7", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Save & Close</button>
                <button onClick={onClose} style={{ padding: "9px 0", background: "transparent", border: "1px solid #e05c7a55", borderRadius: 8, color: "#e05c7a", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Discard changes</button>
                <button onClick={() => setConfirmClose(false)} style={{ padding: "9px 0", background: "transparent", border: "1px solid #2a2a40", borderRadius: 8, color: "#555", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Keep editing</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
