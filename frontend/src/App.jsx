/**
 * App.jsx — GamiList root component
 *
 * This file is the application shell. It owns all top-level state, data-fetching
 * effects, and the tab-based layout. Heavy components and utilities live in
 * their own modules; App wires them together.
 *
 * Module map:
 *   src/constants.js                     — STATUSES, platforms, lock password
 *   src/utils.js                         — formatPlaytime, normName, image helpers
 *   src/api.js                           — apiFetch, API base URL
 *   src/components/ui/                   — Reusable UI primitives
 *   src/components/game/GameCard.jsx     — Game card + grid layouts
 *   src/components/activity/             — Activity heatmap
 *   src/components/modals/MetadataModal  — Game detail / edit modal
 *   src/components/library/             — PSN / Steam import panels
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";

// ── Domain constants ────────────────────────────────────────────────────────
import {
  STATUSES,
  STATUSES_DISPLAY,
  ALL_PLATFORMS,
  PLATFORM_SHORT,
  RAWG_PLATFORM_IDS,
} from "./constants";

// ── Pure utilities ──────────────────────────────────────────────────────────
import { normName, formatPlaytime, rawgImgSrc, coverSrc } from "./utils";

// ── API layer ───────────────────────────────────────────────────────────────
import { API, apiFetch } from "./api";

// ── Reusable UI primitives ──────────────────────────────────────────────────
import { StarRating }      from "./components/ui/StarRating";
import { FitTitle }        from "./components/ui/FitTitle";
import { LockableSection } from "./components/ui/LockableSection";
import { CollapseSection } from "./components/ui/CollapseSection";
import { RatingInput }     from "./components/ui/RatingInput";
import { Spinner }         from "./components/ui/Spinner";
import { Toast }           from "./components/ui/Toast";
import { GlowRow }         from "./components/ui/GlowRow";
import { ToggleSwitch }    from "./components/ui/ToggleSwitch";
import { SliderRow }       from "./components/ui/SliderRow";

// ── Feature components ──────────────────────────────────────────────────────
import { GameCard }             from "./components/game/GameCard";
import { Grid, FavGrid }        from "./components/game/Grid";
import { ActivityGraph,
         ActivityGraphPreview } from "./components/activity/ActivityGraph";
import { MetadataModal }        from "./components/modals/MetadataModal";
import { PsnLibrarySection }    from "./components/library/PsnLibrarySection";
import { SteamLibrarySection }  from "./components/library/SteamLibrarySection";

export default function App() {
  const [tab, setTab]                     = useState("mylist");
  const [cardWMult, setCardWMult]         = useState(1.5);
  const [cardHMult, setCardHMult]         = useState(1.5);
  const [modalWidthMult, setModalWidthMult] = useState(1.0);
  const [lockedSections, setLockedSections] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gamilist-locks") || "{}"); }
    catch { return {}; }
  });
  const toggleSectionLock = (id, locked) => {
    setLockedSections(prev => {
      const next = { ...prev, [id]: locked };
      localStorage.setItem("gamilist-locks", JSON.stringify(next));
      apiFetch("/settings/locked", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
      return next;
    });
  };
  const [cardH2Mult, setCardH2Mult]       = useState(1.0);
  const [altCardMode, setAltCardMode]           = useState(false);
  const [showGalleryNav, setShowGalleryNav]     = useState(true);
  const [favCardCustom, setFavCardCustom]       = useState(false);
  const [favCardWMult, setFavCardWMult]         = useState(1.5);
  const [favCardHMult, setFavCardHMult]         = useState(1.5);
  const [favCardCount, setFavCardCount]         = useState(0);
  const [favAltCardMode, setFavAltCardMode]     = useState(false);
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
  const [listStatsSize,   setListStatsSize]   = useState(16);
  const [favStatsSize,    setFavStatsSize]    = useState(16);
  const [listNameOffset,  setListNameOffset]  = useState(6);
  const [favNameOffset,   setFavNameOffset]   = useState(6);
  const [autoFitTitle,    setAutoFitTitle]    = useState(false);
  const [steamApiKey, setSteamApiKey] = useState("");
  const [steamId, setSteamId]         = useState("");
  const [steamLibrary, setSteamLibrary] = useState(null);
  const [steamSyncing, setSteamSyncing] = useState(false);
  const [steamError, setSteamError]   = useState(null);
  const [psnNpsso, setPsnNpsso]       = useState("");
  const [psnLibrary, setPsnLibrary]   = useState(null);
  const [psnSyncing, setPsnSyncing]   = useState(false);
  const [psnError, setPsnError]       = useState(null);
  const [verifyResult, setVerifyResult]   = useState(null);
  const [verifyFile, setVerifyFile]       = useState(null);
  const [verifying, setVerifying]         = useState(false);
  const [restoring, setRestoring]         = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [downloading, setDownloading]     = useState(false);
  const [metadataGameId, setMetadataGameId]               = useState(null);
  const metadataIsNewRef                                  = useRef(false); // true when auto-added from search
  const [rawgCallsCount, setRawgCallsCount]               = useState(0);
  const [rawgCallsMonth, setRawgCallsMonth]               = useState("");
  const [platformDefaultColor, setPlatformDefaultColor]   = useState("#7c6ef7");
  const [platformColors, setPlatformColors]               = useState({ pc: "#ffffff" });
  const [statusColors, setStatusColors]                   = useState({});
  const [activityColors, setActivityColors]               = useState({});
  const [ratingColors, setRatingColors]                   = useState({}); // key: "10"|"9.5"|...|"lt5" → color
  const [themePageBg,       setThemePageBg]       = useState("#080814");
  const [themeSurface,      setThemeSurface]      = useState("#0c0c1c");
  const [themeBorder,       setThemeBorder]       = useState("#1a1a2e");
  const [sectionDotColor,   setSectionDotColor]   = useState("#ffffff");
  const [sectionDotOpacity, setSectionDotOpacity] = useState(1.0);
  const [cardFillColor,     setCardFillColor]     = useState("#0c0c1c");
  const [selectedRatingColorKey, setSelectedRatingColorKey] = useState("10");
  const [showMorePlatformColors, setShowMorePlatformColors] = useState(false);
  const [syncingAllPlaytime, setSyncingAllPlaytime]       = useState(false);
  const [resyncingPlatforms, setResyncingPlatforms]       = useState(false);
  const [resyncingImages, setResyncingImages]             = useState(false);
  const [resyncingSteamImages, setResyncingSteamImages]   = useState(false);
  const [pruning, setPruning]                             = useState(false);
  const [pruneThreshold, setPruneThreshold]               = useState(5);
  const [detectingDuplicates, setDetectingDuplicates]     = useState(false);
  const [duplicateGroups, setDuplicateGroups]             = useState(null);
  const [duplicateKeep, setDuplicateKeep]                 = useState({});  // game_id → bool (true=keep)
  const [platformFilterSlugs, setPlatformFilterSlugs]     = useState([]);
  const [platDropOpen, setPlatDropOpen]   = useState(false);
  const [platSearch, setPlatSearch]       = useState("");
  const platDropRef                       = useRef(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  // Typography
  const [tbLabelSize,    setTbLabelSize]    = useState(17);
  const [tbLabelWeight,  setTbLabelWeight]  = useState(800);
  const [tbInputSize,    setTbInputSize]    = useState(18);
  const [tbCountSize,    setTbCountSize]    = useState(17);
  const [tbCountWeight,  setTbCountWeight]  = useState(800);
  const [platBtnSize,    setPlatBtnSize]    = useState(18);
  const [platItemSize,   setPlatItemSize]   = useState(18);
  const [actEditsSize,   setActEditsSize]   = useState(10);
  const [actEditsWeight, setActEditsWeight] = useState(800);
  const [actThreshMid,   setActThreshMid]   = useState(2);
  const [actThreshHigh,  setActThreshHigh]  = useState(3);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState(null);
  const [statusFilter, setStatusFilter]   = useState(null);
  const [ratingFilter, setRatingFilter]   = useState(null); // number = exact, "lt5" = <5
  const [sortBy, setSortBy]               = useState("rating_desc");
  const [listSearch, setListSearch]       = useState("");
  const [windowWidth, setWindowWidth]     = useState(window.innerWidth);

  const [favOrder, setFavOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gamilist-fav-order") || "[]"); }
    catch { return []; }
  });

  const dbSettings = useRef({
    cardWMult: 1.5, cardHMult: 1.5, cardH2Mult: 1.0, altCardMode: false, showGalleryNav: true, favCardCustom: false, favCardWMult: 1.5, favCardHMult: 1.5, favCardCount: 0, favAltCardMode: false, cardCount: 0, modalWidthMult: 1.0,
    glow1Enabled: true, glow1Color: "#FFD700", glow2Enabled: true, glow2Color: "#C0C0C0", glow3Enabled: true, glow3Color: "#CD7F32",
    steamApiKey: "", steamId: "", psnNpsso: "", platformHighlightColor: "#7c6ef7", platformColors: { pc: "#ffffff" }, statusColors: {}, activityColors: {}, ratingColors: {},
    fav1Mult: 2.0, fav2Mult: 2.0, fav3Mult: 2.0,
    listStatsSize: 16, favStatsSize: 16, listNameOffset: 6, favNameOffset: 6, autoFitTitle: false,
    actThreshMid: 2, actThreshHigh: 3,
    sectionDotColor: "#ffffff", sectionDotOpacity: 1.0,
    cardFillColor: "#0c0c1c",
  });

  const [query, setQuery]               = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]   = useState(null);
  const [searched, setSearched]         = useState(false);
  const [searchPage, setSearchPage]     = useState(1);
  const [searchTotal, setSearchTotal]   = useState(0);
  const [searchPlatSlug, setSearchPlatSlug] = useState("");
  const [searchPlatDropOpen, setSearchPlatDropOpen] = useState(false);
  const [searchPlatSearch, setSearchPlatSearch]     = useState("");
  const searchPlatDropRef = useRef(null);
  const [trendingGames, setTrendingGames]   = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [myList, setMyList]             = useState({});
  const [listLoading, setListLoading]   = useState(true);
  const [backendOk, setBackendOk]       = useState(null);

  // Preserve scroll position when list re-sorts after an inline edit
  const savedScrollY = useRef(null);
  useLayoutEffect(() => {
    if (savedScrollY.current !== null) {
      window.scrollTo(0, savedScrollY.current);
      savedScrollY.current = null;
    }
  });

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    if (!platDropOpen) return;
    const handler = (e) => { if (platDropRef.current && !platDropRef.current.contains(e.target)) setPlatDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [platDropOpen]);

  useEffect(() => {
    if (!searchPlatDropOpen) return;
    const h = e => { if (searchPlatDropRef.current && !searchPlatDropRef.current.contains(e.target)) setSearchPlatDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [searchPlatDropOpen]);

  useEffect(() => {
    if (tab !== "search" || searched || trendingGames.length > 0 || trendingLoading) return;
    setTrendingLoading(true);
    apiFetch("/games/trending")
      .then(data => setTrendingGames(data.results || []))
      .catch(() => {}) // silently skip trending on errors (including rate limit)
      .finally(() => setTrendingLoading(false));
  }, [tab, searched, trendingGames.length, trendingLoading]);

  useEffect(() => {
    apiFetch("/settings").then(s => {
      const loaded = {
        cardWMult:     s.cardWMult     ?? 1.5,
        cardHMult:     s.cardHMult     ?? 1.5,
        cardH2Mult:    s.cardH2Mult    ?? 1.0,
        altCardMode:     s.altCardMode     ?? false,
        showGalleryNav:  s.showGalleryNav  ?? true,
        favCardCustom:   s.favCardCustom   ?? false,
        favCardWMult:    s.favCardWMult    ?? 1.5,
        favCardHMult:    s.favCardHMult    ?? 1.5,
        favCardCount:    s.favCardCount    ?? 0,
        favAltCardMode:  s.favAltCardMode  ?? false,
        cardCount:     s.cardCount     ?? 0,
        glow1Enabled:  s.glow1Enabled  ?? true,  glow1Color: s.glow1Color ?? "#FFD700",
        glow2Enabled:  s.glow2Enabled  ?? true,  glow2Color: s.glow2Color ?? "#C0C0C0",
        glow3Enabled:  s.glow3Enabled  ?? true,  glow3Color: s.glow3Color ?? "#CD7F32",
        steamApiKey:   s.steamApiKey   ?? "",
        steamId:       s.steamId       ?? "",
        psnNpsso:      s.psnNpsso      ?? "",
      };
      setModalWidthMult(s.modalWidthMult ?? 1.0);
      setCardWMult(loaded.cardWMult);   setCardHMult(loaded.cardHMult);
      setCardH2Mult(loaded.cardH2Mult); setAltCardMode(loaded.altCardMode); setShowGalleryNav(loaded.showGalleryNav);
      setFavCardCustom(loaded.favCardCustom); setFavCardWMult(loaded.favCardWMult); setFavCardHMult(loaded.favCardHMult); setFavCardCount(loaded.favCardCount); setFavAltCardMode(loaded.favAltCardMode);
      setCardCount(loaded.cardCount);
      setGlow1Enabled(loaded.glow1Enabled); setGlow1Color(loaded.glow1Color);
      setGlow2Enabled(loaded.glow2Enabled); setGlow2Color(loaded.glow2Color);
      setGlow3Enabled(loaded.glow3Enabled); setGlow3Color(loaded.glow3Color);
      setFav1Mult(s.fav1Mult ?? 2.0); setFav2Mult(s.fav2Mult ?? 2.0); setFav3Mult(s.fav3Mult ?? 2.0);
      setListStatsSize(s.listStatsSize ?? 16); setFavStatsSize(s.favStatsSize ?? 16); setListNameOffset(s.listNameOffset ?? 6); setFavNameOffset(s.favNameOffset ?? 6); setAutoFitTitle(s.autoFitTitle ?? false);
      setTbLabelSize(s.tbLabelSize ?? 17); setTbLabelWeight(s.tbLabelWeight ?? 800);
      setTbInputSize(s.tbInputSize ?? 18);
      setTbCountSize(s.tbCountSize ?? 17); setTbCountWeight(s.tbCountWeight ?? 800);
      setPlatBtnSize(s.platBtnSize ?? 18); setPlatItemSize(s.platItemSize ?? 18);
      setActEditsSize(s.actEditsSize ?? 10); setActEditsWeight(s.actEditsWeight ?? 800);
      setActThreshMid(s.actThreshMid ?? 2); setActThreshHigh(s.actThreshHigh ?? 3);
      setSteamApiKey(loaded.steamApiKey); setSteamId(loaded.steamId); setPsnNpsso(loaded.psnNpsso);
      setPlatformDefaultColor(s.platformHighlightColor ?? "#7c6ef7");
      setPlatformColors({ pc: "#ffffff", ...(s.platformColors || {}) });
      setStatusColors(s.statusColors || {});
      setActivityColors(s.activityColors || {});
      setRatingColors(s.ratingColors || {});
      setThemePageBg(s.themePageBg ?? "#080814");
      setThemeSurface(s.themeSurface ?? "#0c0c1c");
      setThemeBorder(s.themeBorder ?? "#1a1a2e");
      setSectionDotColor(s.sectionDotColor ?? "#ffffff");
      setSectionDotOpacity(s.sectionDotOpacity ?? 1.0);
      setCardFillColor(s.cardFillColor ?? "#0c0c1c");
      setRawgCallsCount(s.rawgCallsCount || 0);
      setRawgCallsMonth(s.rawgCallsMonth || "");
      if (s.lockedSections && Object.keys(s.lockedSections).length > 0) {
        setLockedSections(s.lockedSections);
        localStorage.setItem("gamilist-locks", JSON.stringify(s.lockedSections));
      }
      dbSettings.current = {
        ...loaded,
        platformHighlightColor: s.platformHighlightColor ?? "#7c6ef7",
        platformColors: { pc: "#ffffff", ...(s.platformColors || {}) },
        statusColors:   s.statusColors   || {},
        activityColors: s.activityColors || {},
        ratingColors:   s.ratingColors   || {},
        fav1Mult:        s.fav1Mult        ?? 2.0,
        fav2Mult:        s.fav2Mult        ?? 2.0,
        fav3Mult:        s.fav3Mult        ?? 2.0,
        listStatsSize:   s.listStatsSize   ?? 16,
        favStatsSize:    s.favStatsSize    ?? 16,
        listNameOffset:  s.listNameOffset  ?? 6,
        favNameOffset:   s.favNameOffset   ?? 6,
        autoFitTitle:    s.autoFitTitle    ?? false,
        modalWidthMult:  s.modalWidthMult  ?? 1.0,
        tbLabelSize:     s.tbLabelSize     ?? 17,
        tbLabelWeight:   s.tbLabelWeight   ?? 800,
        tbInputSize:     s.tbInputSize     ?? 18,
        tbCountSize:     s.tbCountSize     ?? 17,
        tbCountWeight:   s.tbCountWeight   ?? 800,
        platBtnSize:     s.platBtnSize     ?? 18,
        platItemSize:    s.platItemSize    ?? 18,
        actEditsSize:    s.actEditsSize    ?? 10,
        actEditsWeight:  s.actEditsWeight  ?? 800,
        themePageBg:     s.themePageBg     ?? "#080814",
        themeSurface:    s.themeSurface    ?? "#0c0c1c",
        themeBorder:     s.themeBorder     ?? "#1a1a2e",
        actThreshMid:    s.actThreshMid    ?? 2,
        actThreshHigh:   s.actThreshHigh   ?? 3,
        sectionDotColor:   s.sectionDotColor   ?? "#ffffff",
        sectionDotOpacity: s.sectionDotOpacity ?? 1.0,
        cardFillColor:     s.cardFillColor     ?? "#0c0c1c",
      };
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
    setModalWidthMult(s.modalWidthMult ?? 1.0);
    setCardWMult(s.cardWMult);   setCardHMult(s.cardHMult);
    setCardH2Mult(s.cardH2Mult ?? 1.0); setAltCardMode(s.altCardMode ?? false); setShowGalleryNav(s.showGalleryNav ?? true);
    setFavCardCustom(s.favCardCustom ?? false); setFavCardWMult(s.favCardWMult ?? 1.5); setFavCardHMult(s.favCardHMult ?? 1.5); setFavCardCount(s.favCardCount ?? 0); setFavAltCardMode(s.favAltCardMode ?? false);
    setCardCount(s.cardCount);
    setGlow1Enabled(s.glow1Enabled); setGlow1Color(s.glow1Color);
    setGlow2Enabled(s.glow2Enabled); setGlow2Color(s.glow2Color);
    setGlow3Enabled(s.glow3Enabled); setGlow3Color(s.glow3Color);
    setFav1Mult(s.fav1Mult ?? 2.0); setFav2Mult(s.fav2Mult ?? 2.0); setFav3Mult(s.fav3Mult ?? 2.0);
    setListStatsSize(s.listStatsSize ?? 16); setFavStatsSize(s.favStatsSize ?? 16);
    setListNameOffset(s.listNameOffset ?? 6); setFavNameOffset(s.favNameOffset ?? 6); setAutoFitTitle(s.autoFitTitle ?? false);
    setTbLabelSize(s.tbLabelSize ?? 17); setTbLabelWeight(s.tbLabelWeight ?? 800);
    setTbInputSize(s.tbInputSize ?? 18);
    setTbCountSize(s.tbCountSize ?? 17); setTbCountWeight(s.tbCountWeight ?? 800);
    setPlatBtnSize(s.platBtnSize ?? 18); setPlatItemSize(s.platItemSize ?? 18);
    setActEditsSize(s.actEditsSize ?? 10); setActEditsWeight(s.actEditsWeight ?? 800);
    setActThreshMid(s.actThreshMid ?? 2); setActThreshHigh(s.actThreshHigh ?? 3);
    setSteamApiKey(s.steamApiKey); setSteamId(s.steamId); setPsnNpsso(s.psnNpsso ?? "");
    setPlatformDefaultColor(s.platformHighlightColor ?? "#7c6ef7");
    setPlatformColors({ pc: "#ffffff", ...(s.platformColors || {}) });
    setStatusColors(s.statusColors || {});
    setActivityColors(s.activityColors || {});
    setRatingColors(s.ratingColors || {});
    setThemePageBg(s.themePageBg ?? "#080814");
    setThemeSurface(s.themeSurface ?? "#0c0c1c");
    setThemeBorder(s.themeBorder ?? "#1a1a2e");
    setSectionDotColor(s.sectionDotColor ?? "#ffffff");
    setSectionDotOpacity(s.sectionDotOpacity ?? 1.0);
    setCardFillColor(s.cardFillColor ?? "#0c0c1c");
    setSettingsDirty(false);
  }, []);

  const handleSave = () => saveSettings({
    cardWMult, cardHMult, cardH2Mult, altCardMode, showGalleryNav, favCardCustom, favCardWMult, favCardHMult, favCardCount, favAltCardMode, cardCount, modalWidthMult,
    glow1Enabled, glow1Color, glow2Enabled, glow2Color, glow3Enabled, glow3Color,
    fav1Mult, fav2Mult, fav3Mult,
    listStatsSize, favStatsSize, listNameOffset, favNameOffset, autoFitTitle,
    tbLabelSize, tbLabelWeight, tbInputSize, tbCountSize, tbCountWeight,
    platBtnSize, platItemSize, actEditsSize, actEditsWeight,
    steamApiKey, steamId, psnNpsso, platformHighlightColor: platformDefaultColor,
    platformColors, statusColors, activityColors, ratingColors,
    themePageBg, themeSurface, themeBorder,
    actThreshMid, actThreshHigh,
    sectionDotColor, sectionDotOpacity, cardFillColor,
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
          imgFit:           entry.imgFit  ?? "cover",
          customName:       entry.customName ?? null,
        }),
      });
      setMyList(p => ({ ...p, [gameId]: { ...p[gameId], ...updated } }));
    } catch (e) { console.error("Failed to save entry", e); }
  }, []);

  const addToList = (game, status, userRating = undefined) => {
    const existing = myList[game.id] || {};
    // Default rating: 1 for Dropped, null otherwise (unless explicitly passed or already set)
    const defaultRating = status === 6 ? 1 : null;
    const next = {
      ...existing, game, status,
      userRating:      userRating !== undefined ? userRating : (existing.userRating ?? defaultRating),
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

  const syncPsnImage = async (id) => {
    const result = await apiFetch(`/list/${id}/sync-psn-image`, { method: "POST" });
    setMyList(p => {
      const entry = p[id];
      if (!entry) return p;
      const updates = { ...entry, game: { ...entry.game } };
      if (result.background_image) updates.game.background_image = result.background_image;
      if (result.hasCover) {
        updates.hasCover = true;
        updates.coverVersion = (entry.coverVersion ?? 0) + 1;
      }
      return { ...p, [id]: updates };
    });
    return result;
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
    savedScrollY.current = window.scrollY;
    const entry = myList[id];
    const next = { ...entry, userRating: v, status: v != null ? 1 : entry.status };
    setMyList(p => ({ ...p, [id]: next }));
    persist(id, next);
  };

  const doSearch = async (page = 1, platSlug = searchPlatSlug) => {
    const q = query.trim();
    const rawgId = platSlug ? RAWG_PLATFORM_IDS[platSlug] : null;
    if (!q && !rawgId) return;
    setTab("search"); setSearched(true); setSearchLoading(true); setSearchError(null); setSearchResults([]);
    setSearchPage(page);
    try {
      const params = new URLSearchParams({ page, page_size: 50 });
      if (q) params.set("q", q);
      if (rawgId) params.set("platforms", rawgId);
      const data = await apiFetch(`/games/search?${params}`);
      const results = Array.isArray(data) ? data : (data.results || []);
      const count   = Array.isArray(data) ? data.length : (data.count || 0);
      setSearchResults(results);
      setSearchTotal(count);
    } catch (e) {
      const msg = e.message.includes("429") || e.message.includes("401")
        ? "RAWG API limit reached — your monthly quota may be exhausted. Check Settings for usage."
        : "Could not reach the backend.";
      setSearchError(msg);
    }
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
    const { coverWasPromoted, ...rest } = updates;
    const next = { ...entry, ...rest };
    // If moved to Dropped and has no rating, default to 1
    if (next.status === 6 && next.userRating == null) next.userRating = 1;
    if (coverWasPromoted) next.coverVersion = (entry.coverVersion ?? 0) + 1;
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

  // PSN library sync
  const syncPsn = useCallback(async () => {
    setPsnSyncing(true);
    setPsnError(null);
    try {
      const data = await apiFetch("/psn/library");
      setPsnLibrary(data);
    } catch (e) {
      const msg = e.message.includes("400") ? "Check your NPSSO token — it may have expired." : "Failed to fetch PSN library.";
      setPsnError(msg);
    } finally { setPsnSyncing(false); }
  }, []);

  const psnPlatformInfo = (category) => {
    if (category.includes("ps5")) return { slug: "playstation5", name: "PlayStation 5" };
    if (category.includes("ps4")) return { slug: "playstation4", name: "PlayStation 4" };
    if (category.includes("ps3")) return { slug: "playstation3", name: "PlayStation 3" };
    if (category.includes("ps2")) return { slug: "playstation2", name: "PlayStation 2" };
    return { slug: "playstation", name: "PlayStation" };
  };

  const importPsnGames = useCallback(async (games) => {
    for (const g of games) {
      const plat = psnPlatformInfo(g.platform || "");
      const gameData = {
        id:               g.game_id,
        name:             g.name,
        background_image: g.image_url || null,
        genres:           [],
        rating:           0,
        released:         null,
        slug:             `psn-${g.title_id}`,
        platforms:        [{ platform: { slug: plat.slug, name: plat.name } }],
      };
      const entry = {
        game: gameData, status: g.status, userRating: g.rating ?? null, favourite: false,
        playtimeMinutes: g.play_duration_minutes > 0 ? g.play_duration_minutes : null,
        replayCount: 0, tags: [],
      };
      setMyList(p => ({ ...p, [g.game_id]: entry }));
      await apiFetch(`/list/${g.game_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    }
  }, []);

  const syncAllPsnPlaytime = useCallback(async () => {
    try {
      const result = await apiFetch("/psn/sync-playtime-all", { method: "POST" });
      setToast({ msg: `Updated playtime for ${result.updated} PSN game${result.updated !== 1 ? "s" : ""}`, ok: true });
      const data = await apiFetch("/list");
      setMyList(data);
    } catch { setToast({ msg: "Failed to sync PSN playtime", ok: false }); }
  }, []);

  const syncPsnPlatforms = useCallback(async () => {
    try {
      const result = await apiFetch("/psn/sync-platforms", { method: "POST" });
      setToast({ msg: `Updated platform for ${result.updated} PSN game${result.updated !== 1 ? "s" : ""}`, ok: true });
      const data = await apiFetch("/list");
      setMyList(data);
    } catch { setToast({ msg: "Failed to sync PSN platforms", ok: false }); }
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
    // Dropped (6) and Demo (7) are hidden unless explicitly selected via status filter.
    // Exception: when a rating filter is active, dropped games that match the rating are included.
    let filtered = statusFilter === null
      ? allEntries.filter(e => e.status !== 7 && (e.status !== 6 || ratingFilter !== null))
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
    if (ratingFilter !== null) {
      if (ratingFilter === "lt5") {
        filtered = filtered.filter(e => e.userRating != null && e.userRating < 5);
      } else {
        filtered = filtered.filter(e => e.userRating === ratingFilter);
      }
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
    } else if (sortBy === "unrated") {
      copy.sort((a, b) => {
        const aUnrated = a.userRating == null;
        const bUnrated = b.userRating == null;
        if (aUnrated && !bUnrated) return -1;
        if (!aUnrated && bUnrated) return 1;
        return (a.game?.name || "").localeCompare(b.game?.name || "");
      });
    }
    return copy;
  }, [allEntries, statusFilter, ratingFilter, sortBy, platformFilterSlugs, listSearch]);

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
  const favCardW = favCardCustom ? Math.round(210 * favCardWMult) : cardW;
  const favCardH = favCardCustom ? Math.round(170 * favCardHMult) : cardH;
  const favEffectiveCardCount = favCardCustom ? favCardCount : 0;
  const contentWidth = Math.min(windowWidth, 1280) - 56;
  const maxFitCols = Math.max(1, Math.floor((contentWidth + 20) / (cardW + 20)));
  const effectiveCardCount = cardCount > 0 ? Math.min(cardCount, maxFitCols) : 0;

  const markDirty = (setter) => (v) => { setter(v); setSettingsDirty(true); };
  const updateW          = markDirty(setCardWMult);
  const updateH          = markDirty(setCardHMult);
  const updateH2         = markDirty(setCardH2Mult);
  const updateAltMode    = markDirty(setAltCardMode);
  const updateCount         = markDirty(setCardCount);
  const updateFavCardCustom  = markDirty(setFavCardCustom);
  const updateFavCardW       = markDirty(setFavCardWMult);
  const updateFavCardH       = markDirty(setFavCardHMult);
  const updateFavCardCount   = markDirty(setFavCardCount);
  const updateFavAltCardMode = markDirty(setFavAltCardMode);
  const updateGlow1E     = markDirty(setGlow1Enabled);
  const updateGlow1C     = markDirty(setGlow1Color);
  const updateGlow2E     = markDirty(setGlow2Enabled);
  const updateGlow2C     = markDirty(setGlow2Color);
  const updateGlow3E     = markDirty(setGlow3Enabled);
  const updateGlow3C     = markDirty(setGlow3Color);
  const updateFav1Mult   = markDirty(setFav1Mult);
  const updateFav2Mult   = markDirty(setFav2Mult);
  const updateFav3Mult   = markDirty(setFav3Mult);
  const updateTbLabelSize    = markDirty(setTbLabelSize);
  const updateTbLabelWeight  = markDirty(setTbLabelWeight);
  const updateTbInputSize    = markDirty(setTbInputSize);
  const updateTbCountSize    = markDirty(setTbCountSize);
  const updateTbCountWeight  = markDirty(setTbCountWeight);
  const updatePlatBtnSize    = markDirty(setPlatBtnSize);
  const updatePlatItemSize   = markDirty(setPlatItemSize);
  const updateActEditsSize   = markDirty(setActEditsSize);
  const updateActEditsWeight = markDirty(setActEditsWeight);
  const updateActThreshMid  = markDirty(setActThreshMid);
  const updateActThreshHigh = markDirty(setActThreshHigh);
  const updateThemePageBg      = markDirty(setThemePageBg);
  const updateThemeSurface     = markDirty(setThemeSurface);
  const updateThemeBorder      = markDirty(setThemeBorder);
  const updateSectionDotColor   = markDirty(setSectionDotColor);
  const updateSectionDotOpacity = markDirty(setSectionDotOpacity);
  const updateCardFillColor     = markDirty(setCardFillColor);
  const updateSteamKey          = markDirty(setSteamApiKey);
  const updateSteamId           = markDirty(setSteamId);
  const updatePsnNpsso          = markDirty(setPsnNpsso);
  const updatePlatformDefault   = markDirty(setPlatformDefaultColor);
  const setPlatformColorDirty   = (slug, color) => { setPlatformColors(p => ({ ...p, [slug]: color })); setSettingsDirty(true); };
  const setStatusColorDirty     = (id, field, color) => { setStatusColors(p => ({ ...p, [id]: { ...p[id], [field]: color } })); setSettingsDirty(true); };
  const resetStatusColor        = (id) => { setStatusColors(p => { const n = { ...p }; delete n[id]; return n; }); setSettingsDirty(true); };
  const setActivityColorDirty   = (key, color) => { setActivityColors(p => ({ ...p, [key]: color })); setSettingsDirty(true); };
  const setRatingColorDirty     = (key, color) => { setRatingColors(p => ({ ...p, [key]: color })); setSettingsDirty(true); };
  const resetRatingColor        = (key) => { setRatingColors(p => { const n = { ...p }; delete n[key]; return n; }); setSettingsDirty(true); };

  const getPlatformColor = useCallback((slug) => platformColors[slug] ?? platformDefaultColor, [platformColors, platformDefaultColor]);
  const getStatusProps   = useCallback((id) => ({
    color: statusColors[id]?.color || STATUSES[id]?.color || "#888",
    bg:    statusColors[id]?.bg    || STATUSES[id]?.bg    || "#12121e",
  }), [statusColors]);

  const glowConfig = [
    { enabled: glow1Enabled, color: glow1Color },
    { enabled: glow2Enabled, color: glow2Color },
    { enabled: glow3Enabled, color: glow3Color },
  ];

  const [actualCardW, setActualCardW] = useState(null);

  // Opens metadata modal; marks entry as "new" (auto-added) when game wasn't already in list
  const handleOpenMetadata = useCallback((gameId) => {
    metadataIsNewRef.current = !myList[gameId];
    setMetadataGameId(gameId);
  }, [myList]);

  const gridProps = { myList, onAdd: addToList, onRemove: removeFromList, onToggleFav: toggleFav, onRate: rateGame, onOpenMetadata: handleOpenMetadata, onTogglePlatform: togglePlatform, getPlatformColor, getStatusProps, cardW, cardH, cardH2, altCardMode, effectiveCardCount, showGalleryNav, onActualCardW: setActualCardW, ratingColors };

  // Name-keyed lookup for PSN/Steam entries so search results can match them by title.
  const importedNameMap = useMemo(() => {
    const map = {};
    Object.values(myList).forEach(entry => {
      const slug = entry?.game?.slug || "";
      if (slug.startsWith("psn-") || slug.startsWith("steam-")) {
        const key = normName(entry.game?.name || "");
        if (key) map[key] = entry;
      }
    });
    return map;
  }, [myList]);
  const previewEntries = orderedFavEntries.length ? orderedFavEntries : allEntries;

  const credentialsReady = steamApiKey.trim() && steamId.trim();

  // Per-section dirty checks (computed from current state vs last saved)
  const _db = dbSettings.current;
  const cardsSection = !!_db && (
    cardWMult !== (_db.cardWMult ?? 1.5) || cardHMult !== (_db.cardHMult ?? 1.5) ||
    cardH2Mult !== (_db.cardH2Mult ?? 1.0) || altCardMode !== (_db.altCardMode ?? false) ||
    showGalleryNav !== (_db.showGalleryNav ?? true) || favCardCustom !== (_db.favCardCustom ?? false) ||
    favCardWMult !== (_db.favCardWMult ?? 1.5) || favCardHMult !== (_db.favCardHMult ?? 1.5) ||
    favCardCount !== (_db.favCardCount ?? 0) || favAltCardMode !== (_db.favAltCardMode ?? false) ||
    cardCount !== (_db.cardCount ?? 0) || modalWidthMult !== (_db.modalWidthMult ?? 1.0) ||
    fav1Mult !== (_db.fav1Mult ?? 2.0) || fav2Mult !== (_db.fav2Mult ?? 2.0) || fav3Mult !== (_db.fav3Mult ?? 2.0) ||
    listStatsSize !== (_db.listStatsSize ?? 16) || listNameOffset !== (_db.listNameOffset ?? 6) ||
    autoFitTitle !== (_db.autoFitTitle ?? false)
  );
  const colorsSection = !!_db && (
    glow1Enabled !== _db.glow1Enabled || glow1Color !== _db.glow1Color ||
    glow2Enabled !== _db.glow2Enabled || glow2Color !== _db.glow2Color ||
    glow3Enabled !== _db.glow3Enabled || glow3Color !== _db.glow3Color ||
    platformDefaultColor !== (_db.platformHighlightColor ?? "#7c6ef7") ||
    JSON.stringify(platformColors) !== JSON.stringify(_db.platformColors) ||
    JSON.stringify(statusColors) !== JSON.stringify(_db.statusColors) ||
    JSON.stringify(activityColors) !== JSON.stringify(_db.activityColors) ||
    JSON.stringify(ratingColors) !== JSON.stringify(_db.ratingColors) ||
    themePageBg !== (_db.themePageBg ?? "#080814") ||
    themeSurface !== (_db.themeSurface ?? "#0c0c1c") ||
    themeBorder !== (_db.themeBorder ?? "#1a1a2e") ||
    sectionDotColor !== (_db.sectionDotColor ?? "#ffffff") ||
    sectionDotOpacity !== (_db.sectionDotOpacity ?? 1.0) ||
    cardFillColor !== (_db.cardFillColor ?? "#0c0c1c")
  );
  const displaySection = !!_db && (
    tbLabelSize !== (_db.tbLabelSize ?? 17) || tbLabelWeight !== (_db.tbLabelWeight ?? 800) ||
    tbInputSize !== (_db.tbInputSize ?? 18) || tbCountSize !== (_db.tbCountSize ?? 17) ||
    tbCountWeight !== (_db.tbCountWeight ?? 800) || platBtnSize !== (_db.platBtnSize ?? 18) ||
    platItemSize !== (_db.platItemSize ?? 18) || actEditsSize !== (_db.actEditsSize ?? 10) ||
    actEditsWeight !== (_db.actEditsWeight ?? 800) || actThreshMid !== (_db.actThreshMid ?? 2) ||
    actThreshHigh !== (_db.actThreshHigh ?? 3)
  );
  const platformDataSection = !!_db && (
    steamApiKey !== (_db.steamApiKey ?? "") || steamId !== (_db.steamId ?? "") ||
    psnNpsso !== (_db.psnNpsso ?? "")
  );

  return (
    <div style={{ minHeight: "100vh", background: themePageBg, color: "#e0e0f0", fontFamily: "'Nunito', 'system-ui', sans-serif", position: "relative" }}>
      <style>{`
        :root { --theme-surface: ${themeSurface}; --theme-border: ${themeBorder}; --card-fill: ${cardFillColor}; }
        @keyframes progressFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastIn  { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
        @keyframes toastOut { from { opacity: 1; } to { opacity: 0; } }
        * { box-sizing: border-box; }
        input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type=color]::-webkit-color-swatch { border: none; border-radius: 3px; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: var(--theme-surface, #0c0c1c); } ::-webkit-scrollbar-thumb { background: #2a2a40; border-radius: 3px; }
      `}</style>
      {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}
      {metadataGameId != null && (
        <MetadataModal
          gameId={metadataGameId}
          entry={myList[metadataGameId]}
          onClose={() => {
            if (metadataIsNewRef.current) removeFromList(metadataGameId);
            metadataIsNewRef.current = false;
            setMetadataGameId(null);
          }}
          onSave={(id, data) => { metadataIsNewRef.current = false; saveMetadata(id, data); }}
          onDelete={removeFromList}
          onSyncSteam={syncSteamImage}
          onSyncRawg={syncRawgImage}
          onSyncPsn={psnNpsso ? syncPsnImage : undefined}
          onCoverPromoted={(id, newExtraIds) => setMyList(p => ({
            ...p,
            [id]: { ...p[id], hasCover: true, coverVersion: (p[id]?.coverVersion ?? 0) + 1, extraImageIds: newExtraIds },
          }))}
          platformHighlightColor={platformDefaultColor}
          cardW={actualCardW ?? cardW}
          cardH={cardH}
          modalWidthMult={modalWidthMult}
        />
      )}

      {/* ── Sticky header ── */}
      <div style={{ background: themeSurface, borderBottom: `1px solid ${themeBorder}`, padding: "0 28px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", height: 62, gap: 20 }}>
          <span style={{ fontFamily: "'Gloria Hallelujah', cursive", fontSize: 36, color: "#7c6ef7", whiteSpace: "nowrap" }}>GamiList</span>
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: tab===t.id ? "#7c6ef722" : "transparent", color: tab===t.id ? "#7c6ef7" : "#555", cursor: "pointer", fontWeight: tab===t.id ? 700 : 400, fontSize: 13, whiteSpace: "nowrap", fontFamily: "inherit" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder="Search any game…"
                style={{ width: 230, background: "#12121e", border: "1px solid #1e1e35", borderRadius: 8, padding: "8px 32px 8px 14px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
              {query && (
                <button onClick={() => { setQuery(""); if (searched && !searchPlatSlug) { setSearched(false); setSearchResults([]); setSearchTotal(0); } }}
                  style={{ position: "absolute", right: 8, background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>
            <button onClick={() => doSearch(1)} disabled={searchLoading}
              style={{ padding: "8px 18px", background: "#7c6ef7", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: searchLoading ? "not-allowed" : "pointer", opacity: searchLoading ? 0.6 : 1, whiteSpace: "nowrap", fontFamily: "inherit" }}>
              Search
            </button>
          </div>
        </div>
      </div>

      {backendOk === false && (
        <div style={{ background: "#1a0c0c", borderBottom: "1px solid #ff333333", padding: "10px 28px", fontSize: 13, color: "#ff8080" }}>
          ⚠ Backend not detected. Run <code style={{ background: "rgba(200,50,50,0.12)", padding: "1px 6px", borderRadius: 4 }}>python backend.py</code> then refresh.
        </div>
      )}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "30px 28px 70px" }}>

        {/* ── My List ── */}
        {tab === "mylist" && (
          <>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#eeeeff", marginBottom: 20, fontFamily: "'Gloria Hallelujah', cursive" }}>My List</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATUSES_DISPLAY.length}, 1fr)`, gap: 8, marginBottom: 28 }}>
              {STATUSES_DISPLAY.map(s => {
                const cnt = allEntries.filter(e => e.status === s.id).length;
                const active = statusFilter === s.id;
                const sp = getStatusProps(s.id);
                return (
                  <div key={s.id} onClick={() => setStatusFilter(active ? null : s.id)}
                    style={{ background: active ? sp.bg : "var(--card-fill)", border: `1px solid ${active ? sp.color + "66" : "#1a1a2e"}`, borderRadius: 8, padding: "11px 10px", cursor: "pointer", transition: "all 0.15s", userSelect: "none", minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: sp.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: sp.color }}>{cnt}</div>
                  </div>
                );
              })}
            </div>
            {/* Sort + filter toolbar + Activity (same row) */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 16, marginBottom: 20 }}>
              {/* Sort + filter toolbar */}
              <div style={{ flex: 1, minWidth: 0, background: "var(--theme-surface)", border: "1px solid #16162a", borderRadius: 10, padding: "8px 12px" }}>
                {/* Row 1: sort | platform dropdown | count */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: tbLabelSize, color: "#fff", fontWeight: tbLabelWeight, textTransform: "uppercase", letterSpacing: 0.8 }}>Sort</span>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    style={{ background: "#080814", border: "1px solid var(--theme-border)", borderRadius: 5, padding: "3px 6px", color: "#a0a0cc", fontSize: tbInputSize, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                    <option value="rating_desc">Rating ↓</option>
                    <option value="rating_asc">Rating ↑</option>
                    <option value="name_asc">Name A→Z</option>
                    <option value="name_desc">Name Z→A</option>
                    <option value="platform">Platform</option>
                    <option value="unrated">Unrated first</option>
                  </select>
                  <div style={{ width: 1, height: 14, background: "#1e1e35" }} />
                  <span style={{ fontSize: tbLabelSize, color: "#fff", fontWeight: tbLabelWeight, textTransform: "uppercase", letterSpacing: 0.8 }}>Filter</span>
                  {/* Platform searchable dropdown */}
                  {activePlatformSlugs.length > 0 && (
                    <div ref={platDropRef} style={{ position: "relative" }}>
                      <button
                        onClick={() => { setPlatDropOpen(o => !o); setPlatSearch(""); }}
                        style={{ background: "#080814", border: `1px solid ${platformFilterSlugs.length > 0 ? "#7c6ef755" : "var(--theme-border)"}`, borderRadius: 5, padding: "4px 24px 4px 8px", color: platformFilterSlugs.length > 0 ? "#a090ff" : "#555", fontSize: platBtnSize, fontFamily: "inherit", cursor: "pointer", minWidth: 180, textAlign: "left", position: "relative", whiteSpace: "nowrap" }}>
                        {platformFilterSlugs.length === 0
                          ? "All Platforms"
                          : platformFilterSlugs.length === 1
                            ? (ALL_PLATFORMS.find(p => p.slug === platformFilterSlugs[0])?.name || platformFilterSlugs[0])
                            : `${platformFilterSlugs.length} platforms`}
                        <span style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#555" }}>{platDropOpen ? "▲" : "▼"}</span>
                      </button>
                      {platDropOpen && (
                        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200, background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 7, minWidth: 180, boxShadow: "0 6px 24px #00000088", padding: "6px 0" }}>
                          <div style={{ padding: "4px 8px 6px" }}>
                            <input
                              autoFocus
                              value={platSearch}
                              onChange={e => setPlatSearch(e.target.value)}
                              placeholder="Type to filter…"
                              style={{ width: "100%", background: "#080814", border: "1px solid var(--theme-border)", borderRadius: 4, padding: "4px 8px", color: "#a0a0cc", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                            />
                          </div>
                          <div style={{ maxHeight: 220, overflowY: "auto" }}>
                            {activePlatformSlugs
                              .filter(slug => {
                                const name = ALL_PLATFORMS.find(p => p.slug === slug)?.name || slug;
                                return name.toLowerCase().includes(platSearch.toLowerCase());
                              })
                              .map(slug => {
                                const pInfo = ALL_PLATFORMS.find(p => p.slug === slug);
                                const active = platformFilterSlugs.includes(slug);
                                const pc = getPlatformColor(slug);
                                return (
                                  <div key={slug}
                                    onClick={() => { setPlatformFilterSlugs(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]); }}
                                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", cursor: "pointer", background: active ? pc + "14" : "transparent", color: active ? pc : "#888", fontSize: platItemSize, fontFamily: "inherit", transition: "background 0.1s" }}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#ffffff08"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = active ? pc + "14" : "transparent"; }}>
                                    <span style={{ fontSize: Math.max(8, Math.round(platItemSize * 0.83)), width: 12, color: active ? pc : "#333" }}>{active ? "✓" : ""}</span>
                                    {pInfo?.name || slug}
                                  </div>
                                );
                              })}
                          </div>
                          {platformFilterSlugs.length > 0 && (
                            <div style={{ borderTop: "2px solid rgba(255,255,255,0.08)", margin: "4px 0 0" }}>
                              <div onClick={() => setPlatformFilterSlugs([])}
                                style={{ padding: "5px 12px", cursor: "pointer", color: "#555", fontSize: Math.max(9, Math.round(platItemSize * 0.94)), fontFamily: "inherit" }}
                                onMouseEnter={e => e.currentTarget.style.color = "#888"}
                                onMouseLeave={e => e.currentTarget.style.color = "#555"}>
                                Clear filter
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <span style={{ fontSize: tbCountSize, color: "#fff", fontWeight: tbCountWeight, marginLeft: "auto" }}>{listEntries.length} / {allEntries.length} games</span>
                </div>

                {/* Row 2: Search + active filter chips + reset — all stretch to same height */}
                {(() => {
                  const anyActive = statusFilter !== null || ratingFilter !== null || sortBy !== "rating_desc" || platformFilterSlugs.length > 0 || listSearch;
                  return (
                    <div style={{ display: "flex", alignItems: "stretch", gap: 6, marginTop: 10 }}>
                      {/* Search input */}
                      <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1 }}>
                        <input
                          value={listSearch}
                          onChange={e => setListSearch(e.target.value)}
                          placeholder="Search my list…"
                          style={{ background: "#080814", border: "1px solid var(--theme-border)", borderRadius: 5, padding: "6px 36px 6px 12px", color: "#a0a0cc", fontSize: tbInputSize, fontFamily: "inherit", outline: "none", width: "100%", height: "100%", boxSizing: "border-box" }}
                        />
                        {listSearch && (
                          <button onClick={() => setListSearch("")}
                            style={{ position: "absolute", right: 6, background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                        )}
                      </div>
                      {/* Status filter chip */}
                      {statusFilter !== null && (() => {
                        const sp = getStatusProps(statusFilter);
                        return (
                          <button onClick={() => setStatusFilter(null)}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 5, border: `1px solid ${sp.color}44`, background: sp.color + "18", color: sp.color, fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                            {STATUSES[statusFilter].label} <span style={{ opacity: 0.6, fontSize: 12 }}>×</span>
                          </button>
                        );
                      })()}
                      {/* Rating filter chip */}
                      {ratingFilter !== null && (
                        <button onClick={() => setRatingFilter(null)}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 5, border: "1px solid #e6a63a44", background: "#e6a63a18", color: "#e6a63a", fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                          {ratingFilter === "lt5" ? "< 5" : `★ ${ratingFilter}`} <span style={{ opacity: 0.6, fontSize: 12 }}>×</span>
                        </button>
                      )}
                      {/* Reset all */}
                      {anyActive && (
                        <button onClick={() => { setStatusFilter(null); setRatingFilter(null); setSortBy("rating_desc"); setPlatformFilterSlugs([]); setListSearch(""); }}
                          style={{ display: "flex", alignItems: "center", padding: "0 12px", borderRadius: 5, border: "1px solid #1e1e35", background: "transparent", color: "#555", fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                          title="Reset all filters">
                          ↺
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Global activity heatmap */}
              {allEntries.length > 0 && (
                <div style={{ flexShrink: 0, alignSelf: "flex-start", width: "fit-content", background: activityColors.bg || "var(--theme-surface)", border: "1px solid #16162a", borderRadius: 10, padding: "8px 12px", display: "inline-flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: tbLabelSize, color: "#fff", fontWeight: tbLabelWeight, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Activity</div>
                  <ActivityGraph activityLog={globalActivityLog} colors={activityColors} editsSize={actEditsSize} editsWeight={actEditsWeight} threshMid={actThreshMid} threshHigh={actThreshHigh} />
                </div>
              )}
            </div>

            {/* Rating filter strip */}
            {(() => {
              const RATING_STEPS = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5];
              // Default colors per tier
              const DEFAULT_RATING_COLORS = {
                "10": "#FFD700", "9.5": "#f0c020", "9": "#e8b030",
                "8.5": "#e0a040", "8": "#d89050", "7.5": "#cc8060",
                "7": "#c07070", "6.5": "#aa6080", "6": "#9060a0",
                "5.5": "#7050b0", "5": "#6040c0", "lt5": "#e05c7a",
              };
              const getRatingColor = key => ratingColors[key] || DEFAULT_RATING_COLORS[key] || "#7c6ef7";
              // Count from status-filtered pool; include dropped when computing rating counts
              const pool = statusFilter === null
                ? allEntries.filter(e => e.status !== 7)
                : allEntries.filter(e => e.status === statusFilter);
              return (
                <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "nowrap", overflowX: "auto" }}>
                  {RATING_STEPS.map(r => {
                    const key = String(r);
                    const active = ratingFilter === r;
                    const col = getRatingColor(key);
                    const count = pool.filter(e => e.userRating === r).length;
                    return (
                      <button key={r} onClick={() => setRatingFilter(active ? null : r)}
                        style={{ flex: 1, minWidth: 0, padding: "8px 4px", borderRadius: 8, border: `1px solid ${active ? col + "88" : "#1a1a2e"}`, background: active ? col + "18" : "var(--card-fill)", cursor: count > 0 || active ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.15s", userSelect: "none" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: count > 0 || active ? col : col + "33" }}>{r % 1 === 0 ? `${r}/10` : r}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: count > 0 || active ? col : col + "22" }}>{count}</div>
                      </button>
                    );
                  })}
                  {(() => {
                    const active = ratingFilter === "lt5";
                    const col = getRatingColor("lt5");
                    const count = pool.filter(e => e.userRating != null && e.userRating < 5).length;
                    return (
                      <button onClick={() => setRatingFilter(active ? null : "lt5")}
                        style={{ flex: 1, minWidth: 0, padding: "8px 4px", borderRadius: 8, border: `1px solid ${active ? col + "88" : "#1a1a2e"}`, background: active ? col + "18" : "var(--card-fill)", cursor: count > 0 || active ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.15s", userSelect: "none" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: count > 0 || active ? col : col + "33" }}>&lt;5</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: count > 0 || active ? col : col + "22" }}>{count}</div>
                      </button>
                    );
                  })()}
                </div>
              );
            })()}

            {listLoading ? <Spinner text="Loading your list…" /> : <Grid games={listEntries.filter(e => e.game).map(e => e.game)} {...gridProps} emptyMsg="Nothing here yet — search for games to add them!" hideMenu listMode statsTextSize={listStatsSize} nameOffset={listNameOffset} autoFitTitle={autoFitTitle} />}
          </>
        )}

        {/* ── Favourites ── */}
        {tab === "favs" && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#eeeeff", marginBottom: 4, fontFamily: "'Gloria Hallelujah', cursive" }}>Favourites</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 28 }}>Star ★ any game to add it here. Drag cards to reorder.</div>
            <FavGrid entries={orderedFavEntries.filter(e => e.game)} glowConfig={glowConfig} {...gridProps} hideMenu listMode hideFav
              cardW={favCardCustom ? favCardW : cardW} cardH={favCardCustom ? favCardH : cardH}
              altCardMode={favCardCustom ? favAltCardMode : gridProps.altCardMode}
              effectiveCardCount={favCardCustom && favEffectiveCardCount > 0 ? favEffectiveCardCount : (favCardCustom ? 0 : gridProps.effectiveCardCount)}
              favMults={[fav1Mult, fav2Mult, fav3Mult]} onReorder={reorderFavs} statsTextSize={favStatsSize} nameOffset={favNameOffset} autoFitTitle={autoFitTitle} />
          </>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <>
            {/* Header */}
            <div style={{ marginBottom: saving ? 8 : 28 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#eeeeff", fontFamily: "'Gloria Hallelujah', cursive" }}>Settings</div>
            </div>

            {/* Progress bar */}
            {saving && (
              <div style={{ height: 3, background: "var(--theme-border)", borderRadius: 2, marginBottom: 28, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "100%", background: "linear-gradient(90deg, #7c6ef7, #a78bfa)", transformOrigin: "left", animation: "progressFill 0.5s ease-out forwards" }} />
              </div>
            )}

            {/* Panels row */}
            <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap", marginBottom: 40 }}>

              {/* ── Cards section header ── */}
              <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 10, paddingBottom: 4 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff", textTransform: "uppercase", letterSpacing: 1.5 }}>Cards</div>
              </div>

              {/* ── Dimensions ── */}
              <LockableSection sectionId="card-dimensions" title="Dimensions"
                description="Scale card width and height. Set how much larger your top 3 favourites appear."
                locked={!!lockedSections["card-dimensions"]} onToggle={toggleSectionLock}>
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  {[
                    { label: "Width",      desc: "Base 210px.",  value: cardWMult,  onChange: updateW,    color: "#7c6ef7", min: 0.25, max: 5, step: 0.05 },
                    { label: "Height",     desc: "Base 170px.",  value: cardHMult,  onChange: updateH,    color: "#ffffff", min: 0.25, max: 5, step: 0.05 },
                    { label: "Alt Height", desc: "Alt rows.",    value: cardH2Mult, onChange: updateH2,   color: "#e05c7a", min: 0.25, max: 5, step: 0.05 },
                  ].map(({ label, desc, value, onChange, color, min, max, step }) => (
                    <div key={label} style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
                        <div style={{ fontSize: 10, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                        <span style={{ fontSize: 10, color, fontWeight: 700 }}>{value.toFixed(2)}×</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>{desc}</div>
                      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10, borderTop: "2px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: 11, color: "#444", flex: 1 }}>Alternating Heights — enable to use Alt Height for even-indexed cards.</span>
                  <button onClick={() => updateAltMode(!altCardMode)}
                    style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: altCardMode ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: altCardMode ? 19 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>
                <div style={{ paddingTop: 16, borderTop: "2px solid rgba(255,255,255,0.08)", marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Favourite Card Size</div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 12 }}>How much larger your top 3 favourites appear in the grid.</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    {[
                      { label: "1st", value: fav1Mult, update: updateFav1Mult, color: "#FFD700" },
                      { label: "2nd", value: fav2Mult, update: updateFav2Mult, color: "#C0C0C0" },
                      { label: "3rd", value: fav3Mult, update: updateFav3Mult, color: "#CD7F32" },
                    ].map(({ label, value, update, color }) => (
                      <div key={label} style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: "#888" }}>{label}</span>
                          <span style={{ fontSize: 10, color, fontWeight: 700 }}>{value.toFixed(1)}×</span>
                        </div>
                        <input type="range" min="1" max="4" step="0.25" value={value}
                          onChange={e => update(parseFloat(e.target.value))}
                          style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "2px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Custom Dimensions</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: favCardCustom ? 16 : 0 }}>
                      <span style={{ fontSize: 11, color: "#444", flex: 1 }}>Use separate card size and columns for the Favourites tab.</span>
                      <button onClick={() => updateFavCardCustom(!favCardCustom)}
                        style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: favCardCustom ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: favCardCustom ? 19 : 3, transition: "left 0.2s" }} />
                      </button>
                    </div>
                    {favCardCustom && (
                      <>
                        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                          {[
                            { label: "Width",   desc: "Width scale.", value: favCardWMult, onChange: updateFavCardW,    color: "#7c6ef7", min: 0.25, max: 5, step: 0.05, fmt: v => v.toFixed(2)+"×" },
                            { label: "Height",  desc: "Height scale.", value: favCardHMult, onChange: updateFavCardH,   color: "#38bdf8", min: 0.25, max: 5, step: 0.05, fmt: v => v.toFixed(2)+"×" },
                            { label: "Columns", desc: "0 = auto.",     value: Math.min(favCardCount, maxFitCols), onChange: v => updateFavCardCount(v), color: "#a78bfa", min: 0, max: maxFitCols, step: 1, fmt: v => v === 0 ? "Auto" : String(v) },
                          ].map(({ label, desc, value, onChange, color, min, max, step, fmt }) => (
                            <div key={label} style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
                                <div style={{ fontSize: 10, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                                <span style={{ fontSize: 10, color, fontWeight: 700 }}>{fmt(value)}</span>
                              </div>
                              <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>{desc}</div>
                              <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>Alternating Heights</span>
                            <div style={{ fontSize: 11, color: "#444" }}>Apply alternating card heights on the Favourites tab.</div>
                          </div>
                          <button onClick={() => updateFavAltCardMode(!favAltCardMode)}
                            style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: favAltCardMode ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: favAltCardMode ? 19 : 3, transition: "left 0.2s" }} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </LockableSection>

              {/* ── Grid ── */}
              <LockableSection sectionId="card-grid" title="Grid"
                description="Gallery navigation arrows and detail popup width."
                locked={!!lockedSections["card-grid"]} onToggle={toggleSectionLock}>
                <div style={{ marginBottom: 20, paddingTop: 0 }}>
                  <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Gallery Navigation</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "#444", flex: 1 }}>Show arrow and dot controls on hover to browse card images.</span>
                    <button onClick={() => { setShowGalleryNav(v => !v); setSettingsDirty(true); }}
                      style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: showGalleryNav ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: showGalleryNav ? 19 : 3, transition: "left 0.2s" }} />
                    </button>
                  </div>
                </div>
                <div style={{ paddingTop: 16, borderTop: "2px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Detail Panel Width</div>
                      <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>Width of the game detail popup (base: 315px).</div>
                    </div>
                    <span style={{ fontSize: 12, color: "#e05c7a", fontWeight: 700 }}>{modalWidthMult.toFixed(1)}×</span>
                  </div>
                  <input type="range" min="0.8" max="2.0" step="0.1" value={modalWidthMult}
                    onChange={e => { setModalWidthMult(parseFloat(e.target.value)); setSettingsDirty(true); }}
                    style={{ width: "100%", accentColor: "#e05c7a", cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", marginTop: 4 }}>
                    <span>0.8×</span><span>1.0×</span><span>1.5×</span><span>2.0×</span>
                  </div>
                  {orderedFavEntries.length > 0 ? (() => {
                    const fav = orderedFavEntries[0];
                    const favGame = fav.game;
                    const coverUrl = fav.hasCover
                      ? `${API}/list/${favGame.id}/cover?v=${fav.coverVersion ?? 0}`
                      : rawgImgSrc(favGame?.background_image);
                    const statusInfo = fav.status != null ? STATUSES[fav.status] : null;
                    const sp = statusInfo ? (statusColors[statusInfo.id] || statusInfo) : {};
                    const favPlats = (fav.platformsPlayed || []).slice(0, 4);
                    const favTags  = (fav.tags || []).slice(0, 4);
                    const widthPct = Math.round(60 + (modalWidthMult - 0.8) / 1.2 * 40);
                    return (
                      <div style={{ marginTop: 4, background: themePageBg, border: "1px solid var(--theme-border)", borderRadius: 8, padding: 8, overflow: "hidden" }}>
                        <div style={{ margin: "0 auto", background: "var(--theme-surface)", border: "1px solid #2a2a40", borderRadius: 8, overflow: "hidden", transition: "width 0.15s", width: `${widthPct}%` }}>
                          {coverUrl
                            ? <img src={coverUrl} alt={favGame.name} style={{ width: "100%", height: 68, objectFit: "cover", display: "block" }} />
                            : <div style={{ width: "100%", height: 68, background: "#12121e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎮</div>}
                          <div style={{ padding: "6px 8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: "#eeeeff", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{favGame.name}</div>
                              {sp.color && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: sp.color + "22", color: sp.color, fontWeight: 700, flexShrink: 0, marginLeft: 4 }}>{statusInfo?.label}</span>}
                            </div>
                            {favPlats.length > 0 && (
                              <div style={{ display: "flex", gap: 2, marginBottom: 3, flexWrap: "wrap" }}>
                                {favPlats.map(slug => {
                                  const pc = getPlatformColor(slug); return (
                                  <span key={slug} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, background: pc + "22", color: pc, fontWeight: 700 }}>{PLATFORM_SHORT[slug] || slug.slice(0,4).toUpperCase()}</span>
                                );})}
                              </div>
                            )}
                            {fav.userRating != null && <div style={{ fontSize: 10, color: "#e6a63a", fontWeight: 800, marginBottom: 2 }}>★ {fav.userRating}</div>}
                            {fav.playtimeMinutes > 0 && <div style={{ fontSize: 9, color: "#888" }}>⏱ {formatPlaytime(fav.playtimeMinutes)}{fav.replayCount > 0 ? ` · ↺ ×${fav.replayCount}` : ""}</div>}
                            {favTags.length > 0 && (
                              <div style={{ display: "flex", gap: 2, marginTop: 4, flexWrap: "wrap" }}>
                                {favTags.map(t => <span key={t} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 10, background: "#12121e", color: "#888" }}>{t}</span>)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    <div style={{ marginTop: 4, background: themePageBg, border: "1px solid var(--theme-border)", borderRadius: 8, padding: 8, fontSize: 11, color: "#444", textAlign: "center" }}>Add a favourite to see a preview</div>
                  )}
                </div>
              </LockableSection>

              {/* ── Text ── */}
              <LockableSection sectionId="card-text" title="Text"
                description="Font size for game titles and stats. Applies to both My List and Favourites."
                locked={!!lockedSections["card-text"]} onToggle={toggleSectionLock}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Auto-fit Title</div>
                    <div style={{ fontSize: 11, color: "#444" }}>Shrink long titles so they always fit on one line.</div>
                  </div>
                  <button onClick={() => { setAutoFitTitle(v => !v); setSettingsDirty(true); }}
                    style={{ width: 38, height: 22, borderRadius: 11, border: "none", background: autoFitTitle ? "#7c6ef7" : "#2a2a3a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: autoFitTitle ? 19 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>
                <div style={{ paddingTop: 16, borderTop: "2px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                    {/* Base size */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, marginBottom: 1 }}>Base</div>
                      <div style={{ fontSize: 10, color: "#444", marginBottom: 6 }}>Stats, platforms, playtime text size.</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="range" min="8" max="32" step="1" value={listStatsSize}
                          onChange={e => { const v = parseInt(e.target.value); setListStatsSize(v); setFavStatsSize(v); setSettingsDirty(true); }}
                          style={{ flex: 1, accentColor: "#7c6ef7", cursor: "pointer" }} />
                        <span style={{ fontSize: 10, color: "#7c6ef7", fontWeight: 700, width: 30, textAlign: "right", flexShrink: 0 }}>{listStatsSize}px</span>
                      </div>
                    </div>
                    {/* Title offset */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, marginBottom: 1 }}>Title Offset</div>
                      <div style={{ fontSize: 10, color: "#444", marginBottom: 6 }}>Extra size added to the title only, on top of Base.</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="range" min="0" max="16" step="1" value={listNameOffset}
                          onChange={e => { const v = parseInt(e.target.value); setListNameOffset(v); setFavNameOffset(v); setSettingsDirty(true); }}
                          style={{ flex: 1, accentColor: "#7c6ef7", cursor: "pointer" }} />
                        <span style={{ fontSize: 10, color: "#7c6ef7", fontWeight: 700, width: 30, textAlign: "right", flexShrink: 0 }}>{listNameOffset >= 0 ? `+${listNameOffset}` : listNameOffset}px</span>
                      </div>
                    </div>
                  </div>
                  {/* Preview — always visible below the sliders */}
                  <div style={{ background: themePageBg, border: "1px solid var(--theme-border)", borderRadius: 8, padding: "10px 12px" }}>
                    {autoFitTitle
                      ? <FitTitle targetSize={listStatsSize + listNameOffset} style={{ fontWeight: 700, color: "#eeeeff", marginBottom: 4 }}>A Very Long Game Title That May Not Fit</FitTitle>
                      : <div style={{ fontSize: listStatsSize + listNameOffset, fontWeight: 700, color: "#eeeeff", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>A Very Long Game Title That May Not Fit</div>
                    }
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
                      {["PC","PS5","NSW"].map(p => (
                        <span key={p} style={{ fontSize: Math.max(7, listStatsSize - 2), fontWeight: 700, padding: "2px 5px", borderRadius: 3, background: "#7c6ef728", border: "1px solid #7c6ef777", color: "#7c6ef7", userSelect: "none" }}>{p}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: listStatsSize + 2, fontWeight: 800, color: "#e6a63a", userSelect: "none" }}>★ 8.5</span>
                      <span style={{ color: "#2a2a3a", fontSize: listStatsSize + 1, userSelect: "none" }}>|</span>
                      <span style={{ fontSize: listStatsSize, color: "#eeeeff", fontWeight: 700, whiteSpace: "nowrap" }}>⏱ 42h</span>
                      <span style={{ color: "#2a2a3a", fontSize: listStatsSize + 1, userSelect: "none" }}>|</span>
                      <span style={{ fontSize: listStatsSize, color: "#eeeeff", fontWeight: 700, whiteSpace: "nowrap" }}>↺ ×2</span>
                    </div>
                  </div>
                </div>
              </LockableSection>

              {/* Cards save bar */}
              {cardsSection && (
                <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 10, paddingTop: 14 }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ padding: "7px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: saving ? "not-allowed" : "pointer", background: saving ? "#1a1a2e" : "#7c6ef7", color: saving ? "#444" : "#fff", fontFamily: "inherit" }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={cancelSettings}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                    Cancel
                  </button>
                  <span style={{ fontSize: 11, color: "#444" }}>Unsaved changes in Cards</span>
                </div>
              )}

              {/* ── Preview section header ── */}
              <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 10, paddingBottom: 4, paddingTop: 8, borderTop: "2px solid rgba(255,255,255,0.1)", marginTop: 8 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff", textTransform: "uppercase", letterSpacing: 1.5 }}>
                  Preview{effectiveCardCount > 0 ? ` — ${effectiveCardCount} column${effectiveCardCount > 1 ? "s" : ""}` : ""}
                </div>
              </div>

              {/* ── Card Preview — full-width break inside flex row ── */}
              <div style={{ flexBasis: "100%", background: themePageBg, border: "1px solid var(--theme-border, #1a1a2e)", borderRadius: 12, padding: "24px 28px", marginBottom: 0 }}>

                {previewEntries.length > 0
                  ? (() => {
                      const count = effectiveCardCount > 0 ? effectiveCardCount : Math.min(4, maxFitCols);
                      const entries = Array.from({ length: count }, (_, i) => previewEntries[i % previewEntries.length]);
                      const cols = effectiveCardCount > 0 ? `repeat(${effectiveCardCount}, 1fr)` : `repeat(auto-fill, minmax(${cardW}px, 1fr))`;
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 20 }}>
                          {entries.map((e, i) => (
                            <GameCard key={i} game={e.game} listEntry={e}
                              cardH={altCardMode && i % 2 === 1 ? cardH2 : cardH}
                              glowColor={null}
                              showGalleryNav={showGalleryNav}
                              statsTextSize={listStatsSize} nameOffset={listNameOffset} autoFitTitle={autoFitTitle}
                              getPlatformColor={getPlatformColor} getStatusProps={getStatusProps}
                              ratingColors={ratingColors}
                              onAdd={addToList} onRemove={removeFromList} onToggleFav={toggleFav}
                              onRate={rateGame}
                              onOpenMetadata={handleOpenMetadata} />
                          ))}
                        </div>
                      );
                    })()
                  : <div style={{ padding: "60px 0", textAlign: "center", color: "#333", fontSize: 13, border: "1px dashed #1a1a2e", borderRadius: 12 }}>
                      Add games to your list to see a preview here
                    </div>
                }
              </div>

              {/* ── Colors section header ── */}
              <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 10, paddingBottom: 4, paddingTop: 28, borderTop: "2px solid rgba(255,255,255,0.1)", marginTop: 16 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff", textTransform: "uppercase", letterSpacing: 1.5 }}>Colors</div>
              </div>

              {/* ── Theme ── */}
              <LockableSection sectionId="colors-theme" title="Theme"
                description="Core colors for the page background, surfaces, and borders."
                locked={!!lockedSections["colors-theme"]} onToggle={toggleSectionLock}>
                {[
                  { key: "page",    label: "Page Background", desc: "Main canvas behind all content.",      value: themePageBg,  update: updateThemePageBg,  def: "#080814" },
                  { key: "surface", label: "Surface",         desc: "Nav bar and settings panel fill.",     value: themeSurface, update: updateThemeSurface, def: "#0c0c1c" },
                  { key: "border",  label: "Border",          desc: "Card outlines and section dividers.",  value: themeBorder,  update: updateThemeBorder,  def: "#1a1a2e" },
                ].map(({ key, label, desc, value, update, def }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#eeeeff", fontWeight: 600, marginBottom: 1 }}>{label}</div>
                      <div style={{ fontSize: 10, color: "#555" }}>{desc}</div>
                    </div>
                    <input type="color" value={value} onChange={e => update(e.target.value)}
                      style={{ width: 28, height: 24, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1, flexShrink: 0 }} />
                    {value !== def && (
                      <button onClick={() => update(def)}
                        style={{ fontSize: 22, color: "#ffffff", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }} title="Reset">↺</button>
                    )}
                  </div>
                ))}
                {/* Card fill color */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#eeeeff", fontWeight: 600, marginBottom: 1 }}>Card Fill</div>
                    <div style={{ fontSize: 10, color: "#555" }}>Background of cards, status tabs, and rating cells.</div>
                  </div>
                  <input type="color" value={cardFillColor} onChange={e => updateCardFillColor(e.target.value)}
                    style={{ width: 28, height: 24, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1, flexShrink: 0 }} />
                  {cardFillColor !== "#0c0c1c" && (
                    <button onClick={() => updateCardFillColor("#0c0c1c")}
                      style={{ fontSize: 22, color: "#ffffff", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }} title="Reset">↺</button>
                  )}
                </div>
                {/* Section header dots */}
                <div style={{ paddingTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#eeeeff", fontWeight: 600, marginBottom: 1 }}>Section Dots</div>
                      <div style={{ fontSize: 10, color: "#555" }}>The ● ● ● decorators before section titles.</div>
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center", marginRight: 4 }}>
                      {[0,1,2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />)}
                    </div>
                    <input type="color" value={sectionDotColor} onChange={e => updateSectionDotColor(e.target.value)}
                      style={{ width: 28, height: 24, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1, flexShrink: 0 }} />
                    {(sectionDotColor !== "#ffffff" || sectionDotOpacity !== 1.0) && (
                      <button onClick={() => { updateSectionDotColor("#ffffff"); updateSectionDotOpacity(1.0); }}
                        style={{ fontSize: 22, color: "#ffffff", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }} title="Reset">↺</button>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 10, color: "#555", flexShrink: 0 }}>Intensity</span>
                    <input type="range" min={0} max={1} step={0.05} value={sectionDotOpacity}
                      onChange={e => updateSectionDotOpacity(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: "#7c6ef7", cursor: "pointer" }} />
                    <span style={{ fontSize: 10, color: "#7c6ef7", fontWeight: 700, width: 30, textAlign: "right", flexShrink: 0 }}>{Math.round(sectionDotOpacity * 100)}%</span>
                  </div>
                </div>
              </LockableSection>

              {/* ── Status ── */}
              <LockableSection sectionId="colors-status" title="Status"
                description="Customize label and background color for every game status."
                locked={!!lockedSections["colors-status"]} onToggle={toggleSectionLock}>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {STATUSES_DISPLAY.map(s => {
                    const sp = getStatusProps(s.id);
                    const hasOverride = !!statusColors[s.id];
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: sp.color, flex: 1, minWidth: 0,
                          background: sp.bg, border: `1px solid ${sp.color}44`, borderRadius: 4,
                          padding: "3px 7px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.label}
                        </span>
                        <input type="color" value={sp.color} onChange={e => setStatusColorDirty(s.id, "color", e.target.value)}
                          style={{ width: 22, height: 18, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1, flexShrink: 0 }} title="Label color" />
                        <input type="color" value={sp.bg} onChange={e => setStatusColorDirty(s.id, "bg", e.target.value)}
                          style={{ width: 22, height: 18, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1, flexShrink: 0 }} title="Background" />
                        {hasOverride
                          ? <button onClick={() => resetStatusColor(s.id)}
                              style={{ fontSize: 22, color: "#ffffff", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }} title="Reset">↺</button>
                          : <div style={{ width: 18, flexShrink: 0 }} />
                        }
                      </div>
                    );
                  })}
                </div>
              </LockableSection>

              {/* ── Platforms ── */}
              <LockableSection sectionId="colors-platform" title="Platforms"
                description="Accent color for platform badges. Set a global default or override per platform."
                locked={!!lockedSections["colors-platform"]} onToggle={toggleSectionLock}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Default Color</div>
                    <div style={{ fontSize: 11, color: "#444" }}>Applied to all platforms without a custom override.</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <input type="color" value={platformDefaultColor} onChange={e => updatePlatformDefault(e.target.value)}
                      style={{ width: 26, height: 20, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                    <span style={{ fontSize: 10, color: platformDefaultColor, fontWeight: 700 }}>{platformDefaultColor}</span>
                  </div>
                </div>
                {(() => {
                  const featured = ["pc","playstation5","xbox-series-x","nintendo-switch"];
                  const extraPlatforms = ALL_PLATFORMS.filter(p => !featured.includes(p.slug));
                  return (
                    <>
                      <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>Per-platform overrides</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {ALL_PLATFORMS.filter(p => featured.includes(p.slug)).map(p => {
                          const c = platformColors[p.slug] ?? platformDefaultColor;
                          return (
                            <div key={p.slug} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: c, minWidth: 28 }}>{p.short}</span>
                              <span style={{ fontSize: 11, color: "#555", flex: 1 }}>{p.name}</span>
                              <input type="color" value={c} onChange={e => setPlatformColorDirty(p.slug, e.target.value)}
                                style={{ width: 22, height: 16, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                              {platformColors[p.slug] && platformColors[p.slug] !== platformDefaultColor && (
                                <button onClick={() => { const n = { ...platformColors }; delete n[p.slug]; setPlatformColors(n); setSettingsDirty(true); }}
                                  style={{ fontSize: 22, color: "#ffffff", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1 }} title="Reset">↺</button>
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
                                <span style={{ fontSize: 11, color: "#555", flex: 1 }}>{p.name}</span>
                                <input type="color" value={c} onChange={e => setPlatformColorDirty(p.slug, e.target.value)}
                                  style={{ width: 22, height: 16, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                                {platformColors[p.slug] && platformColors[p.slug] !== platformDefaultColor && (
                                  <button onClick={() => { const n = { ...platformColors }; delete n[p.slug]; setPlatformColors(n); setSettingsDirty(true); }}
                                    style={{ fontSize: 22, color: "#ffffff", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1 }} title="Reset">↺</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </LockableSection>

              {/* ── Glow ── */}
              <LockableSection sectionId="colors-rating" title="Glow"
                description="Color per star rating, and glow border for your top 3 favourite cards."
                locked={!!lockedSections["colors-rating"]} onToggle={toggleSectionLock}>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Rating Colors</div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 12 }}>Color for each star rating score. Click a swatch to edit it.</div>
                  {(() => {
                    const RATING_STEPS_KEYS = [
                      { key: "10",  label: "10 / 10" }, { key: "9.5", label: "9.5" },
                      { key: "9",   label: "9"        }, { key: "8.5", label: "8.5" },
                      { key: "8",   label: "8"        }, { key: "7.5", label: "7.5" },
                      { key: "7",   label: "7"        }, { key: "6.5", label: "6.5" },
                      { key: "6",   label: "6"        }, { key: "5.5", label: "5.5" },
                      { key: "5",   label: "5"        }, { key: "lt5", label: "< 5" },
                    ];
                    const DEFAULT_RATING_COLORS = {
                      "10": "#FFD700", "9.5": "#f0c020", "9": "#e8b030",
                      "8.5": "#e0a040", "8": "#d89050", "7.5": "#cc8060",
                      "7": "#c07070", "6.5": "#aa6080", "6": "#9060a0",
                      "5.5": "#7050b0", "5": "#6040c0", "lt5": "#e05c7a",
                    };
                    const sel = selectedRatingColorKey;
                    const currentColor = ratingColors[sel] || DEFAULT_RATING_COLORS[sel] || "#7c6ef7";
                    const hasOverride  = !!ratingColors[sel];
                    return (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <select value={sel} onChange={e => setSelectedRatingColorKey(e.target.value)}
                            style={{ flex: 1, background: "#080814", border: "1px solid #2a2a40", borderRadius: 6, padding: "5px 8px", color: "#a0a0cc", fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                            {RATING_STEPS_KEYS.map(({ key, label }) => (
                              <option key={key} value={key}>{label}{ratingColors[key] ? " ●" : ""}</option>
                            ))}
                          </select>
                          <input type="color" value={currentColor} onChange={e => setRatingColorDirty(sel, e.target.value)}
                            style={{ width: 28, height: 24, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                          {hasOverride && (
                            <button onClick={() => resetRatingColor(sel)}
                              style={{ fontSize: 22, color: "#ffffff", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1 }} title="Reset to default">↺</button>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 3 }}>
                          {RATING_STEPS_KEYS.map(({ key }) => {
                            const c = ratingColors[key] || DEFAULT_RATING_COLORS[key] || "#7c6ef7";
                            return (
                              <div key={key} onClick={() => setSelectedRatingColorKey(key)}
                                style={{ flex: 1, height: 7, borderRadius: 3, background: c, cursor: "pointer", opacity: key === sel ? 1 : 0.45, outline: key === sel ? `2px solid ${c}` : "none", transition: "opacity 0.15s" }} />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ paddingTop: 16, borderTop: "2px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Favourite Glow</div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 12 }}>Colored border glow on top-ranked favourite cards. Toggle and pick color per rank.</div>
                  <GlowRow rank="1" label="1st place" enabled={glow1Enabled} color={glow1Color} onToggle={() => updateGlow1E(!glow1Enabled)} onColor={updateGlow1C} />
                  <GlowRow rank="2" label="2nd place" enabled={glow2Enabled} color={glow2Color} onToggle={() => updateGlow2E(!glow2Enabled)} onColor={updateGlow2C} />
                  <GlowRow rank="3" label="3rd place" enabled={glow3Enabled} color={glow3Color} onToggle={() => updateGlow3E(!glow3Enabled)} onColor={updateGlow3C} />
                </div>
              </LockableSection>

              {/* Colors save bar */}
              {colorsSection && (
                <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 10, paddingTop: 14 }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ padding: "7px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: saving ? "not-allowed" : "pointer", background: saving ? "#1a1a2e" : "#7c6ef7", color: saving ? "#444" : "#fff", fontFamily: "inherit" }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={cancelSettings}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                    Cancel
                  </button>
                  <span style={{ fontSize: 11, color: "#444" }}>Unsaved changes in Colors</span>
                </div>
              )}

              {/* ── Display section header ── */}
              <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 10, paddingBottom: 4, paddingTop: 28, borderTop: "2px solid rgba(255,255,255,0.1)", marginTop: 16 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff", textTransform: "uppercase", letterSpacing: 1.5 }}>Display</div>
              </div>

              {/* ── Typography ── */}
              <LockableSection sectionId="display-typography" title="Typography"
                description="Font sizes and weights for toolbar labels, sort controls, and platform filter."
                locked={!!lockedSections["display-typography"]} onToggle={toggleSectionLock}>
                {[
                  { label: "Sort / Filter / Activity", preview: "Filter",          size: tbLabelSize, onSize: updateTbLabelSize, weight: tbLabelWeight, onWeight: updateTbLabelWeight },
                  { label: "Games count",              preview: "42 / 100 games",  size: tbCountSize, onSize: updateTbCountSize, weight: tbCountWeight, onWeight: updateTbCountWeight },
                  { label: "Sort & Search input",      preview: "Search my list…", size: tbInputSize, onSize: updateTbInputSize },
                  { label: "Platform button",          preview: "All Platforms",   size: platBtnSize, onSize: updatePlatBtnSize },
                  { label: "Platform items",           preview: "PlayStation 5",   size: platItemSize, onSize: updatePlatItemSize },
                ].map(({ label, preview, size, onSize, weight, onWeight }, i) => (
                  <div key={label} style={{ marginBottom: i < 4 ? 18 : 0 }}>
                    {/* Title row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</span>
                      {onWeight && (
                        <div style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: "auto" }}>
                          {[{ l: "Reg", v: 400 }, { l: "Bold", v: 700 }, { l: "Heavy", v: 800 }].map(({ l, v }) => (
                            <button key={v} onClick={() => onWeight(v)}
                              style={{ padding: "1px 6px", borderRadius: 4, fontSize: 8, fontFamily: "inherit", cursor: "pointer",
                                border: `1px solid ${weight === v ? "#7c6ef799" : "#1e1e35"}`,
                                background: weight === v ? "#7c6ef722" : "transparent",
                                color: weight === v ? "#9a8ef7" : "#444" }}>
                              {l}
                            </button>
                          ))}
                        </div>
                      )}
                      <span style={{ fontSize: 9, color: "#7c6ef7", fontWeight: 700, marginLeft: onWeight ? 4 : "auto", flexShrink: 0 }}>{size}px</span>
                    </div>
                    {/* Slider */}
                    <input type="range" min={8} max={36} step={1} value={size}
                      onChange={e => onSize(parseInt(e.target.value))}
                      style={{ width: "100%", accentColor: "#7c6ef7", cursor: "pointer", marginBottom: 6 }} />
                    {/* Live preview */}
                    <div style={{ background: themePageBg, border: "1px solid var(--theme-border)", borderRadius: 6, padding: "6px 10px", overflow: "hidden" }}>
                      <span style={{ fontSize: size, fontWeight: weight ?? 400, color: "#e0e0f0", whiteSpace: "nowrap" }}>{preview}</span>
                    </div>
                  </div>
                ))}
              </LockableSection>


              {/* ── Activity Graph ── */}
              <LockableSection sectionId="display-activity" title="Activity Graph"
                description="Colors and label size for the activity heatmap shown on the My List tab."
                locked={!!lockedSections["display-activity"]} onToggle={toggleSectionLock}>
                <div>
                {[
                  { key: "bg",    label: "Background", desc: "Panel background color.",       default: "var(--theme-surface)" },
                  { key: "empty", label: "Empty",       desc: "Days with no edits.",           default: "#080814" },
                  { key: "low",   label: "Low",         desc: `Below ${actThreshMid} edit${actThreshMid !== 1 ? "s" : ""} in a day.`, default: "#2d1f6b" },
                  { key: "mid",   label: "Mid",         desc: `${actThreshMid}–${actThreshHigh - 1} edits in a day.`, default: "#5040a0" },
                  { key: "high",  label: "High",        desc: `${actThreshHigh}+ edits in a day.`, default: "#7c6ef7" },
                ].map(({ key, label, desc, default: def }) => {
                  const val = activityColors[key] || def;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, background: val, border: "1px solid #2a2a40", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{label}</div>
                        <div style={{ fontSize: 9, color: "#444" }}>{desc}</div>
                      </div>
                      <input type="color" value={val} onChange={e => setActivityColorDirty(key, e.target.value)}
                        style={{ width: 26, height: 20, border: "1px solid #2a2a40", borderRadius: 3, cursor: "pointer", background: "none", padding: 1 }} />
                      {activityColors[key] && activityColors[key] !== def && (
                        <button onClick={() => setActivityColors(p => { const n = { ...p }; delete n[key]; return n; })}
                          style={{ fontSize: 22, color: "#ffffff", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1 }} title="Reset">↺</button>
                      )}
                    </div>
                  );
                })}
                {/* Thresholds + edits label size — all three in one row */}
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "2px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {/* Mid threshold */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>Mid color starts at</span>
                        <span style={{ fontSize: 9, color: "#7c6ef7", fontWeight: 700 }}>{actThreshMid} edits</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>Days with this many edits turn Mid color.</div>
                      <input type="range" min={2} max={10} step={1} value={actThreshMid}
                        onChange={e => updateActThreshMid(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#7c6ef7", cursor: "pointer" }} />
                    </div>
                    {/* High threshold */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>High color starts at</span>
                        <span style={{ fontSize: 9, color: "#7c6ef7", fontWeight: 700 }}>{actThreshHigh} edits</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>Days with this many edits turn High color.</div>
                      <input type="range" min={3} max={20} step={1} value={actThreshHigh}
                        onChange={e => updateActThreshHigh(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#7c6ef7", cursor: "pointer" }} />
                    </div>
                    {/* Edits label size */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>Edits label size</span>
                        <span style={{ fontSize: 9, color: "#7c6ef7", fontWeight: 700 }}>{actEditsSize}px</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>Size of the "N edits in the last year" text.</div>
                      <input type="range" min={8} max={24} step={1} value={actEditsSize}
                        onChange={e => updateActEditsSize(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#7c6ef7", cursor: "pointer" }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 4 }}>
                        {[{ l: "Reg", v: 400 }, { l: "Bold", v: 700 }, { l: "Heavy", v: 800 }].map(({ l, v }) => (
                          <button key={v} onClick={() => updateActEditsWeight(v)}
                            style={{ padding: "1px 6px", borderRadius: 4, fontSize: 8, fontFamily: "inherit", cursor: "pointer",
                              border: `1px solid ${actEditsWeight === v ? "#7c6ef799" : "#1e1e35"}`,
                              background: actEditsWeight === v ? "#7c6ef722" : "transparent",
                              color: actEditsWeight === v ? "#9a8ef7" : "#444" }}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Preview — full-width, auto-adjusting numWeeks */}
                <ActivityGraphPreview activityLog={exampleActivityLog} colors={activityColors} editsSize={actEditsSize} editsWeight={actEditsWeight} threshMid={actThreshMid} threshHigh={actThreshHigh} themePageBg={themePageBg} />
                </div>
              </LockableSection>

              {/* Display save bar */}
              {displaySection && (
                <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 10, paddingTop: 14 }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ padding: "7px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: saving ? "not-allowed" : "pointer", background: saving ? "#1a1a2e" : "#7c6ef7", color: saving ? "#444" : "#fff", fontFamily: "inherit" }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={cancelSettings}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                    Cancel
                  </button>
                  <span style={{ fontSize: 11, color: "#444" }}>Unsaved changes in Display</span>
                </div>
              )}
            </div>


            {/* ── Platform Data ── */}
            <div style={{ borderTop: "2px solid rgba(255,255,255,0.1)", paddingTop: 28, marginBottom: 40 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDotColor, opacity: sectionDotOpacity, display: "inline-block" }} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#eeeeff", textTransform: "uppercase", letterSpacing: 1.5 }}>Platform Data</div>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>

                {/* Accounts */}
                <div style={{ flex: 1, minWidth: 240, background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 12, padding: "24px 28px" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#eeeeff", marginBottom: 16 }}>Accounts</div>
                  {/* Steam */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Steam</div>
                    <div style={{ fontSize: 11, color: "#444", marginBottom: 10, lineHeight: 1.5 }}>API key from steamcommunity.com/dev/apikey. Set profile to Public.</div>
                    <input type="password" value={steamApiKey} onChange={e => updateSteamKey(e.target.value)} placeholder="API key"
                      style={{ width: "100%", background: "#080814", border: "1px solid #1e1e35", borderRadius: 6, padding: "6px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit", marginBottom: 6, boxSizing: "border-box" }} />
                    <input type="text" value={steamId} onChange={e => updateSteamId(e.target.value)} placeholder="Steam ID or vanity URL"
                      style={{ width: "100%", background: "#080814", border: "1px solid #1e1e35", borderRadius: 6, padding: "6px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    {credentialsReady && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                        <button onClick={syncSteam} disabled={steamSyncing}
                          style={{ width: "100%", padding: "8px 0", background: steamSyncing ? "var(--theme-border)" : "#1db954", border: "none", borderRadius: 8, color: steamSyncing ? "#444" : "#fff", fontWeight: 700, fontSize: 12, cursor: steamSyncing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {steamSyncing ? "Fetching…" : "Sync Library"}
                        </button>
                        <button onClick={syncAllSteamPlaytime} disabled={syncingAllPlaytime}
                          style={{ width: "100%", padding: "8px 0", background: syncingAllPlaytime ? "var(--theme-border)" : "#0a2a1a", border: "1px solid #1db95444", borderRadius: 8, color: syncingAllPlaytime ? "#444" : "#1db954", fontWeight: 700, fontSize: 12, cursor: syncingAllPlaytime ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {syncingAllPlaytime ? "Syncing…" : "Sync Playtime"}
                        </button>
                        {steamError && <div style={{ fontSize: 11, color: "#ff8080" }}>{steamError}</div>}
                      </div>
                    )}
                  </div>
                  {/* PSN */}
                  <div style={{ paddingTop: 16, borderTop: "2px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>PSN</div>
                    <div style={{ fontSize: 11, color: "#444", marginBottom: 10, lineHeight: 1.5 }}>Visit <a href="https://ca.account.sony.com/api/v1/ssocookie" target="_blank" rel="noopener noreferrer" style={{ color: "#0070cc" }}>ca.account.sony.com/api/v1/ssocookie</a> and paste the npsso value.</div>
                    <input type="password" value={psnNpsso} onChange={e => updatePsnNpsso(e.target.value)} placeholder="NPSSO token"
                      style={{ width: "100%", background: "#080814", border: "1px solid #1e1e35", borderRadius: 6, padding: "6px 10px", color: "#e0e0f0", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    {psnNpsso.trim() && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                        <button onClick={syncPsn} disabled={psnSyncing}
                          style={{ width: "100%", padding: "8px 0", background: psnSyncing ? "var(--theme-border)" : "#003087", border: "none", borderRadius: 8, color: psnSyncing ? "#444" : "#fff", fontWeight: 700, fontSize: 12, cursor: psnSyncing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                          {psnSyncing ? "Fetching…" : "Sync Library"}
                        </button>
                        <button onClick={syncAllPsnPlaytime}
                          style={{ width: "100%", padding: "8px 0", background: "#0a1a2a", border: "1px solid #0070cc44", borderRadius: 8, color: "#0070cc", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          Sync Playtime
                        </button>
                        <button onClick={syncPsnPlatforms}
                          style={{ width: "100%", padding: "8px 0", background: "#0a1a2a", border: "1px solid #0070cc44", borderRadius: 8, color: "#0070cc", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          Sync Platforms
                        </button>
                        {psnError && <div style={{ fontSize: 11, color: "#ff8080" }}>{psnError}</div>}
                      </div>
                    )}
                  </div>
                </div>

                {/* PSN library — shown inline once synced */}
                {psnLibrary && (
                  <PsnLibrarySection library={psnLibrary} myList={myList} onImport={importPsnGames} onSyncPlaytime={syncPlaytime} onRefresh={syncPsn} />
                )}

                {/* Platforms */}
                <div style={{ flex: 1, minWidth: 240, background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 12, padding: "24px 28px" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Platforms</div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 20, lineHeight: 1.6 }}>
                    Fill or re-sync platform data. Blank entries default to PC.
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
                      style={{ width: "100%", padding: "9px 0", background: resyncingPlatforms ? "var(--theme-border)" : "#0a1a2a", border: "1px solid #38bdf844", borderRadius: 8, color: resyncingPlatforms ? "#444" : "#38bdf8", fontWeight: 700, fontSize: 13, cursor: resyncingPlatforms ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
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
                      style={{ width: "100%", padding: "9px 0", background: resyncingPlatforms ? "var(--theme-border)" : "#0a1a14", border: "1px solid #4caf8044", borderRadius: 8, color: resyncingPlatforms ? "#444" : "#4caf80", fontWeight: 700, fontSize: 13, cursor: resyncingPlatforms ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {resyncingPlatforms ? "Syncing…" : "Re-sync Platforms from RAWG"}
                    </button>


                  <div style={{ borderTop: "2px solid rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>RAWG Usage</div>
                    {(() => {
                      const pct = Math.min(100, Math.round((rawgCallsCount / 20000) * 100));
                      const barColor = pct >= 90 ? "#ff6060" : pct >= 70 ? "#e6a63a" : "#4caf80";
                      return (<>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                          <span style={{ fontSize: 20, fontWeight: 800, color: pct >= 90 ? "#ff6060" : "#eeeeff" }}>{rawgCallsCount.toLocaleString()}</span>
                          <span style={{ fontSize: 11, color: "#555" }}>/ 20,000{rawgCallsMonth && ` · ${rawgCallsMonth}`}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: "var(--theme-border)", overflow: "hidden", marginBottom: 4 }}>
                          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: barColor }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#555" }}>{pct}% used</div>
                        {pct >= 90 && <div style={{ marginTop: 6, fontSize: 11, color: "#ff8080" }}>⚠ Near limit — pauses on 401.</div>}
                      </>);
                    })()}
                  </div>
                  <div style={{ borderTop: "2px solid rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#eeeeff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Duplicates</div>
                    <div style={{ fontSize: 11, color: "#444", marginBottom: 8, lineHeight: 1.5 }}>Find entries with similar names. Check what to keep, uncheck to delete.</div>
                    <button onClick={async () => {
                      setDetectingDuplicates(true); setDuplicateGroups(null);
                      try {
                        const r = await apiFetch("/admin/find-duplicates");
                        setDuplicateGroups(r.groups);
                        const init = {};
                        for (const g of r.groups) g.forEach((e, i) => { init[e.game_id] = i === 0; });
                        setDuplicateKeep(init);
                      } catch { setToast({ msg: "Failed to detect duplicates", ok: false }); }
                      finally { setDetectingDuplicates(false); }
                    }} disabled={detectingDuplicates}
                      style={{ width: "100%", padding: "9px 0", background: detectingDuplicates ? "var(--theme-border)" : "#1a0a1a", border: "1px solid #e05a5a44", borderRadius: 8, color: detectingDuplicates ? "#444" : "#e05a5a", fontWeight: 700, fontSize: 13, cursor: detectingDuplicates ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {detectingDuplicates ? "Scanning…" : "Detect Duplicates"}
                    </button>
                    {duplicateGroups !== null && (
                      <div style={{ marginTop: 8 }}>
                        {duplicateGroups.length === 0
                          ? <div style={{ fontSize: 12, color: "#444" }}>No duplicates found.</div>
                          : <>
                              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--theme-border)", borderRadius: 8, marginBottom: 8, marginTop: 8 }}>
                                {duplicateGroups.map((group, gi) => (
                                  <div key={gi} style={{ borderBottom: "1px solid #0e0e1e", padding: "8px 12px" }}>
                                    <div style={{ fontSize: 10, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Group {gi + 1}</div>
                                    {group.map(e => (
                                      <label key={e.game_id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 4 }}>
                                        <input type="checkbox" checked={duplicateKeep[e.game_id] ?? true} onChange={ev => setDuplicateKeep(p => ({ ...p, [e.game_id]: ev.target.checked }))} />
                                        {e.image && <img src={rawgImgSrc(e.image)} alt="" style={{ width: 20, height: 28, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} onError={ev => ev.target.style.display = "none"} />}
                                        <span style={{ fontSize: 11, color: duplicateKeep[e.game_id] ?? true ? "#e0e0f0" : "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: duplicateKeep[e.game_id] ?? true ? "none" : "line-through" }}>{e.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                ))}
                              </div>
                              {(() => {
                                const toDelete = Object.entries(duplicateKeep).filter(([,keep]) => !keep).map(([id]) => parseInt(id));
                                return toDelete.length > 0 && (
                                  <button onClick={async () => {
                                    try {
                                      const r = await apiFetch("/admin/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game_ids: toDelete }) });
                                      setToast({ msg: `Deleted ${r.deleted} duplicate${r.deleted !== 1 ? "s" : ""}`, ok: true });
                                      const data = await apiFetch("/list"); setMyList(data); setDuplicateGroups(null);
                                    } catch { setToast({ msg: "Failed to delete duplicates", ok: false }); }
                                  }} style={{ width: "100%", padding: "9px 0", background: "#2a0a0a", border: "1px solid #e05a5a99", borderRadius: 8, color: "#e05a5a", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                                    Delete {Object.entries(duplicateKeep).filter(([,keep]) => !keep).length} unchecked
                                  </button>
                                );
                              })()}
                            </>
                        }
                      </div>
                    )}
                  </div>
                </div>
                </div>

                {/* Images */}
                <div style={{ flex: 1, minWidth: 240, background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 12, padding: "24px 28px" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Images</div>
                  <div style={{ fontSize: 11, color: "#444", marginBottom: 16, lineHeight: 1.6 }}>
                    Sync cover art from Steam or RAWG. Skips Dropped games and entries below the threshold. Custom covers are never overwritten.
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: "#555" }}>Rating threshold</span>
                    <input type="number" min={0} max={10} step={0.5} value={pruneThreshold}
                      onChange={e => setPruneThreshold(parseFloat(e.target.value) || 0)}
                      style={{ width: 52, background: "#080814", border: "1px solid #2a2a40", borderRadius: 5, padding: "3px 6px", color: "#e0e0f0", fontSize: 13, outline: "none", fontFamily: "inherit", textAlign: "center" }} />
                    <span style={{ fontSize: 12, color: "#444" }}>/ 10</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={async () => {
                      setResyncingSteamImages(true);
                      try {
                        const r = await apiFetch("/admin/sync-steam-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threshold: pruneThreshold }) });
                        setToast({ msg: `Updated Steam images for ${r.updated} game${r.updated !== 1 ? "s" : ""} (${r.skipped} skipped)`, ok: true });
                        const data = await apiFetch("/list"); setMyList(data);
                      } catch { setToast({ msg: "Failed to sync Steam images", ok: false }); }
                      finally { setResyncingSteamImages(false); }
                    }} disabled={resyncingSteamImages}
                      style={{ width: "100%", padding: "9px 0", background: resyncingSteamImages ? "var(--theme-border)" : "#0a1a2a", border: "1px solid #38bdf844", borderRadius: 8, color: resyncingSteamImages ? "#444" : "#38bdf8", fontWeight: 700, fontSize: 13, cursor: resyncingSteamImages ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {resyncingSteamImages ? "Syncing…" : "Sync from Steam"}
                    </button>
                    <button onClick={async () => {
                      setResyncingImages(true);
                      try {
                        const r = await apiFetch("/admin/sync-rawg-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threshold: pruneThreshold }) });
                        setToast({ msg: `Updated images for ${r.updated} game${r.updated !== 1 ? "s" : ""} (${r.skipped} skipped)`, ok: true });
                        const data = await apiFetch("/list"); setMyList(data);
                      } catch { setToast({ msg: "Failed to sync RAWG images", ok: false }); }
                      finally { setResyncingImages(false); }
                    }} disabled={resyncingImages}
                      style={{ width: "100%", padding: "9px 0", background: resyncingImages ? "var(--theme-border)" : "#1a0a2a", border: "1px solid #a78bfa44", borderRadius: 8, color: resyncingImages ? "#444" : "#a78bfa", fontWeight: 700, fontSize: 13, cursor: resyncingImages ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {resyncingImages ? "Syncing…" : "Sync from RAWG"}
                    </button>
                    <button onClick={async () => {
                      setPruning(true);
                      try {
                        const r = await apiFetch("/admin/prune-extra-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threshold: pruneThreshold }) });
                        setToast({ msg: `Deleted ${r.deleted_images} image${r.deleted_images !== 1 ? "s" : ""} across ${r.affected_games} game${r.affected_games !== 1 ? "s" : ""}`, ok: true });
                        const data = await apiFetch("/list"); setMyList(data);
                      } catch { setToast({ msg: "Failed to prune images", ok: false }); }
                      finally { setPruning(false); }
                    }} disabled={pruning}
                      style={{ width: "100%", padding: "9px 0", background: pruning ? "var(--theme-border)" : "#1a0a0a", border: "1px solid #e05a5a44", borderRadius: 8, color: pruning ? "#444" : "#e05a5a", fontWeight: 700, fontSize: 13, cursor: pruning ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {pruning ? "Pruning…" : "Prune Extra Images"}
                    </button>
                  </div>
                </div>

                {/* Backup & Import */}
                <div style={{ flex: 1, minWidth: 240, background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 12, padding: "24px 28px" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>Backup & Import</div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 20, lineHeight: 1.6 }}>
                    Download a full backup, or load a <code style={{ color: "#555" }}>.sql.gz</code> file to verify and restore.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button disabled={downloading} onClick={async () => {
                      setDownloading(true);
                      try {
                        const res = await fetch("/api/backup/download");
                        if (!res.ok) throw new Error("Backup failed");
                        const disposition = res.headers.get("Content-Disposition") || "";
                        const match = disposition.match(/filename="([^"]+)"/);
                        const filename = match ? match[1] : "gamilist_backup.sql.gz";
                        const blob = await res.blob();
                        if (window.showSaveFilePicker) {
                          try {
                            const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "GZip archive", accept: { "application/gzip": [".gz"] } }] });
                            const writable = await handle.createWritable();
                            await writable.write(blob); await writable.close();
                            setToast({ msg: `Backup saved: ${filename}`, ok: true }); return;
                          } catch (e) { if (e.name === "AbortError") return; }
                        }
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
                        URL.revokeObjectURL(url);
                        setToast({ msg: `Backup downloaded: ${filename}`, ok: true });
                      } catch { setToast({ msg: "Backup failed", ok: false }); }
                      finally { setDownloading(false); }
                    }} style={{ width: "100%", padding: "9px 0", background: "#0a1020", border: "1px solid #7c6ef744", borderRadius: 8, color: downloading ? "#555" : "#7c6ef7", fontWeight: 700, fontSize: 13, cursor: downloading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {downloading ? "Downloading…" : "Download Backup"}
                    </button>
                    <input id="backup-file-input" type="file" accept=".sql.gz,.gz" style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        setVerifyFile(file); setVerifyResult(null); setRestoreConfirm(false); setVerifying(true);
                        try {
                          const fd = new FormData(); fd.append("file", file);
                          const res = await fetch("/api/backup/verify", { method: "POST", body: fd });
                          setVerifyResult(await res.json());
                        } catch { setVerifyResult({ valid: false, error: "Network error" }); }
                        finally { setVerifying(false); e.target.value = ""; }
                      }} />
                    <button disabled={verifying} onClick={() => document.getElementById("backup-file-input").click()}
                      style={{ width: "100%", padding: "9px 0", background: "#0a1a10", border: "1px solid #4caf8044", borderRadius: 8, color: verifying ? "#444" : "#4caf80", fontWeight: 700, fontSize: 13, cursor: verifying ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {verifying ? "Analysing…" : "Choose Backup File"}
                    </button>
                    {verifyFile && !verifying && <div style={{ fontSize: 11, color: "#555", textAlign: "center" }}>{verifyFile.name}</div>}
                  </div>
                </div>

                {/* Verify result panel (modal) */}
                {verifyResult && (
                  <div onClick={() => { setVerifyResult(null); setVerifyFile(null); setRestoreConfirm(false); }}
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.80)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div onClick={e => e.stopPropagation()}
                      style={{ background: "var(--theme-surface)", border: "1px solid #1e1e35", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto", padding: 32, position: "relative" }}>

                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#eeeeff", flex: 1 }}>Backup Verification</div>
                        {verifyFile && <div style={{ fontSize: 11, color: "#555" }}>{verifyFile.name}</div>}
                        <button onClick={() => { setVerifyResult(null); setVerifyFile(null); setRestoreConfirm(false); }}
                          style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
                      </div>

                      {/* Valid / invalid badge */}
                      {!verifyResult.valid ? (
                        <div style={{ background: "#1a0808", border: "1px solid #ff606055", borderRadius: 10, padding: "16px 20px", color: "#ff8080", fontSize: 13 }}>
                          <strong>Invalid backup</strong> — {verifyResult.error}
                        </div>
                      ) : (
                        <>
                          {/* Summary row */}
                          <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
                            {[
                              { label: "Added",     count: verifyResult.stats.added,     color: "#4caf80", bg: "#0a1a10" },
                              { label: "Removed",   count: verifyResult.stats.removed,   color: "#e05c7a", bg: "#1a0812" },
                              { label: "Modified",  count: verifyResult.stats.modified,  color: "#e6a63a", bg: "#1a1208" },
                              { label: "Unchanged", count: verifyResult.stats.unchanged, color: "#555",    bg: "#0c0c14" },
                            ].map(({ label, count, color, bg }) => (
                              <div key={label} style={{ flex: 1, minWidth: 110, background: bg, border: `1px solid ${color}33`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color }}>{count}</div>
                                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Added */}
                          {verifyResult.added.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#4caf80", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                                Added ({verifyResult.added.length}) — in backup, not in current DB
                              </div>
                              <div style={{ border: "1px solid var(--theme-border)", borderRadius: 8, overflow: "hidden" }}>
                                {verifyResult.added.map((g, i) => (
                                  <div key={g.game_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: i < verifyResult.added.length - 1 ? "1px solid #0e0e1e" : "none", background: i % 2 === 0 ? "#080814" : "transparent" }}>
                                    <div style={{ flex: 1, fontSize: 12, color: "#ccc" }}>{g.name}</div>
                                    {g.platform && <div style={{ fontSize: 10, color: "#555" }}>{g.platform}</div>}
                                    {g.status != null && <div style={{ fontSize: 10, color: STATUSES[g.status]?.color || "#888", minWidth: 70, textAlign: "right" }}>{STATUSES[g.status]?.label}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Removed */}
                          {verifyResult.removed.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#e05c7a", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                                Removed ({verifyResult.removed.length}) — in current DB, not in backup
                              </div>
                              <div style={{ border: "1px solid var(--theme-border)", borderRadius: 8, overflow: "hidden" }}>
                                {verifyResult.removed.map((g, i) => (
                                  <div key={g.game_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: i < verifyResult.removed.length - 1 ? "1px solid #0e0e1e" : "none", background: i % 2 === 0 ? "#080814" : "transparent" }}>
                                    <div style={{ flex: 1, fontSize: 12, color: "#ccc" }}>{g.name}</div>
                                    {g.platform && <div style={{ fontSize: 10, color: "#555" }}>{g.platform}</div>}
                                    {g.status != null && <div style={{ fontSize: 10, color: STATUSES[g.status]?.color || "#888", minWidth: 70, textAlign: "right" }}>{STATUSES[g.status]?.label}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Modified */}
                          {verifyResult.modified.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#e6a63a", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                                Modified ({verifyResult.modified.length}) — field changes
                              </div>
                              <div style={{ border: "1px solid var(--theme-border)", borderRadius: 8, overflow: "hidden" }}>
                                {verifyResult.modified.map((g, i) => (
                                  <div key={g.game_id} style={{ padding: "10px 14px", borderBottom: i < verifyResult.modified.length - 1 ? "1px solid #0e0e1e" : "none", background: i % 2 === 0 ? "#080814" : "transparent" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                                      <div style={{ flex: 1, fontSize: 12, color: "#ccc" }}>{g.name}</div>
                                      {g.platform && <div style={{ fontSize: 10, color: "#555" }}>{g.platform}</div>}
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {Object.entries(g.changes).map(([field, { backup: bv, current: cv }]) => {
                                        const label = { status: "Status", user_rating: "Rating", favourite: "Favourite", playtime_minutes: "Playtime" }[field] || field;
                                        const fmtStatus = v => v != null ? (STATUSES[v]?.label ?? v) : "—";
                                        const fmtVal = (f, v) => {
                                          if (v == null) return "—";
                                          if (f === "status") return fmtStatus(v);
                                          if (f === "favourite") return v ? "Yes" : "No";
                                          if (f === "playtime_minutes") return `${Math.round(v / 60)}h`;
                                          if (f === "user_rating") return `${v}`;
                                          return String(v);
                                        };
                                        return (
                                          <div key={field} style={{ fontSize: 10, background: "#16162a", border: "1px solid var(--theme-border)", borderRadius: 5, padding: "3px 8px", color: "#888" }}>
                                            <span style={{ color: "#555" }}>{label}: </span>
                                            <span style={{ color: "#e05c7a" }}>{fmtVal(field, cv)}</span>
                                            <span style={{ color: "#555" }}> → </span>
                                            <span style={{ color: "#4caf80" }}>{fmtVal(field, bv)}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {verifyResult.stats.added === 0 && verifyResult.stats.removed === 0 && verifyResult.stats.modified === 0 && (
                            <div style={{ padding: "16px 20px", background: "#080814", border: "1px solid var(--theme-border)", borderRadius: 10, color: "#555", fontSize: 13, textAlign: "center", marginBottom: 20 }}>
                              Backup is identical to the current database — no changes would be made.
                            </div>
                          )}

                          {/* Restore section */}
                          <div style={{ borderTop: "2px solid rgba(255,255,255,0.08)", paddingTop: 20, marginTop: 4 }}>
                            {!restoreConfirm ? (
                              <button onClick={() => setRestoreConfirm(true)}
                                style={{ width: "100%", padding: "10px 0", background: "#1a0808", border: "1px solid #e05c7a55", borderRadius: 8, color: "#e05c7a", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                                Restore Database from this Backup
                              </button>
                            ) : (
                              <div style={{ background: "#1a0808", border: "1px solid #e05c7a55", borderRadius: 10, padding: "16px 20px" }}>
                                <div style={{ fontSize: 12, color: "#e05c7a", marginBottom: 14, lineHeight: 1.6 }}>
                                  This will <strong>permanently replace</strong> your current database with the backup. This cannot be undone.
                                </div>
                                <div style={{ display: "flex", gap: 10 }}>
                                  <button onClick={() => setRestoreConfirm(false)}
                                    style={{ flex: 1, padding: "8px 0", background: "transparent", border: "1px solid #333", borderRadius: 7, color: "#555", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                                    Cancel
                                  </button>
                                  <button
                                    disabled={restoring}
                                    onClick={async () => {
                                      if (!verifyFile) return;
                                      setRestoring(true);
                                      try {
                                        const fd = new FormData();
                                        fd.append("file", verifyFile);
                                        const res = await fetch("/api/backup/restore", { method: "POST", body: fd });
                                        const data = await res.json();
                                        if (data.ok) {
                                          setVerifyResult(null);
                                          setVerifyFile(null);
                                          setRestoreConfirm(false);
                                          setToast({ msg: "Database restored — reloading…", ok: true });
                                          setTimeout(() => window.location.reload(), 1800);
                                        } else {
                                          setToast({ msg: `Restore failed: ${data.error}`, ok: false });
                                          setRestoreConfirm(false);
                                        }
                                      } catch {
                                        setToast({ msg: "Restore failed — network error", ok: false });
                                        setRestoreConfirm(false);
                                      } finally {
                                        setRestoring(false);
                                      }
                                    }}
                                    style={{ flex: 2, padding: "8px 0", background: restoring ? "#1a0808" : "#2a0808", border: "1px solid #e05c7a", borderRadius: 7, color: restoring ? "#555" : "#e05c7a", fontWeight: 700, fontSize: 12, cursor: restoring ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                                    {restoring ? "Restoring…" : "Yes, Restore Now"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}


              </div>

              {/* Platform Data save bar */}
              {platformDataSection && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ padding: "7px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: saving ? "not-allowed" : "pointer", background: saving ? "#1a1a2e" : "#7c6ef7", color: saving ? "#444" : "#fff", fontFamily: "inherit" }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={cancelSettings}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #2a2a40", background: "transparent", color: "#888", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                    Cancel
                  </button>
                  <span style={{ fontSize: 11, color: "#444" }}>Unsaved changes in Platform Data</span>
                </div>
              )}
            </div>

        </>
        )}

        {/* ── Search ── */}
        {tab === "search" && (
          <>
            {/* Toolbar: platform filter + page info */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              {/* Platform dropdown */}
              <div ref={searchPlatDropRef} style={{ position: "relative" }}>
                <button onClick={() => { setSearchPlatDropOpen(o => !o); setSearchPlatSearch(""); }}
                  style={{ background: "var(--theme-surface)", border: `1px solid ${searchPlatSlug ? "#7c6ef755" : "var(--theme-border)"}`, borderRadius: 6, padding: "5px 26px 5px 10px", color: searchPlatSlug ? "#a090ff" : "#555", fontSize: 12, fontFamily: "inherit", cursor: "pointer", minWidth: 140, textAlign: "left", position: "relative", whiteSpace: "nowrap" }}>
                  {searchPlatSlug ? (ALL_PLATFORMS.find(p => p.slug === searchPlatSlug)?.name || searchPlatSlug) : "All Platforms"}
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#555" }}>{searchPlatDropOpen ? "▲" : "▼"}</span>
                </button>
                {searchPlatDropOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 300, background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 7, minWidth: 200, boxShadow: "0 6px 24px #00000088", padding: "6px 0" }}>
                    <div style={{ padding: "4px 8px 6px" }}>
                      <input autoFocus value={searchPlatSearch} onChange={e => setSearchPlatSearch(e.target.value)}
                        placeholder="Type to filter…"
                        style={{ width: "100%", background: "#080814", border: "1px solid var(--theme-border)", borderRadius: 4, padding: "4px 8px", color: "#a0a0cc", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                      {/* All platforms option */}
                      <div onClick={() => { setSearchPlatSlug(""); setSearchPlatDropOpen(false); setSearched(false); setSearchResults([]); setSearchTotal(0); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", cursor: "pointer", background: !searchPlatSlug ? "#7c6ef714" : "transparent", color: !searchPlatSlug ? "#a090ff" : "#888", fontSize: 12, fontFamily: "inherit" }}
                        onMouseEnter={e => { if (searchPlatSlug) e.currentTarget.style.background = "#ffffff08"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = !searchPlatSlug ? "#7c6ef714" : "transparent"; }}>
                        <span style={{ fontSize: 10, width: 12 }}>{!searchPlatSlug ? "✓" : ""}</span>All Platforms
                      </div>
                      {ALL_PLATFORMS
                        .filter(p => RAWG_PLATFORM_IDS[p.slug] !== undefined)
                        .filter(p => p.name.toLowerCase().includes(searchPlatSearch.toLowerCase()))
                        .map(p => {
                          const active = searchPlatSlug === p.slug;
                          return (
                            <div key={p.slug}
                              onClick={() => {
                                setSearchPlatSlug(p.slug);
                                setSearchPlatDropOpen(false);
                                // Auto-trigger browse for selected platform
                                const rawgId = RAWG_PLATFORM_IDS[p.slug];
                                setSearched(true); setSearchLoading(true); setSearchError(null); setSearchResults([]); setSearchPage(1);
                                apiFetch(`/games/search?platforms=${rawgId}&page=1&page_size=50`)
                                  .then(data => { setSearchResults(Array.isArray(data) ? data : (data.results || [])); setSearchTotal(Array.isArray(data) ? data.length : (data.count || 0)); })
                                  .catch(() => setSearchError("Could not reach the backend."))
                                  .finally(() => setSearchLoading(false));
                              }}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", cursor: "pointer", background: active ? "#7c6ef714" : "transparent", color: active ? "#a090ff" : "#888", fontSize: 12, fontFamily: "inherit" }}
                              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#ffffff08"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = active ? "#7c6ef714" : "transparent"; }}>
                              <span style={{ fontSize: 10, width: 12 }}>{active ? "✓" : ""}</span>{p.name}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Title / count */}
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#eeeeff", fontFamily: "'Gloria Hallelujah', cursive" }}>
                  {!searched ? "New & Trending" : query.trim() ? `"${query.trim()}"` : ALL_PLATFORMS.find(p => p.slug === searchPlatSlug)?.name || "Browse"}
                </span>
                {searched && !searchLoading && (
                  <span style={{ fontSize: 12, color: "#444", marginLeft: 12 }}>
                    {searchTotal > 0 ? `${searchTotal.toLocaleString()} games` : `${searchResults.length} games`}
                    {searchTotal > 50 && ` — page ${searchPage} of ${Math.ceil(searchTotal / 50)}`}
                  </span>
                )}
              </div>

              {/* Pagination */}
              {searched && searchTotal > 50 && !searchLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => doSearch(searchPage - 1)} disabled={searchPage <= 1}
                    style={{ padding: "4px 12px", background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 5, color: searchPage <= 1 ? "#333" : "#a0a0cc", fontSize: 12, cursor: searchPage <= 1 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>← Prev</button>
                  <span style={{ fontSize: 12, color: "#555" }}>{searchPage} / {Math.ceil(searchTotal / 50)}</span>
                  <button onClick={() => doSearch(searchPage + 1)} disabled={searchPage >= Math.ceil(searchTotal / 50)}
                    style={{ padding: "4px 12px", background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 5, color: searchPage >= Math.ceil(searchTotal / 50) ? "#333" : "#a0a0cc", fontSize: 12, cursor: searchPage >= Math.ceil(searchTotal / 50) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Next →</button>
                </div>
              )}
            </div>

            {searchError && <div style={{ color: "#ff6060", background: "#1e0c0c", border: "1px solid #ff333322", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 13 }}>{searchError}</div>}
            {searchLoading
              ? <Spinner text="Loading games…" />
              : searched
                ? <Grid games={searchResults} {...gridProps} importedNameMap={importedNameMap} emptyMsg="No games found." />
                : trendingLoading
                  ? <Spinner text="Loading trending games…" />
                  : <Grid games={trendingGames} {...gridProps} importedNameMap={importedNameMap} emptyMsg="Search for a game or select a platform above." />
            }
          </>
        )}

      </div>
    </div>
  );
}
