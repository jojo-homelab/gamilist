/**
 * SteamLibrarySection.jsx — Steam library import panel
 *
 * Displayed in the Settings → Platform Data section once the user's Steam
 * library has been fetched. Shows all owned Steam games and lets the user
 * select which to import into GamiList.
 *
 * Features:
 *   - Toggle between "New only" and "All" game views
 *   - Bulk select all + bulk status override via a dropdown
 *   - Per-game status pre-filled by playtime (>0 → Played, 0 → Backlog)
 *   - Ratings are left blank — user sets them manually after import
 *   - Inline "Sync playtime" button for games already in GamiList
 *
 * Used in: App.jsx Settings tab (Platform Data section).
 */

import { useState, useEffect } from "react";
import { STATUSES, STATUSES_DISPLAY } from "../../constants.js";

/**
 * Steam library import UI panel.
 *
 * @param {Object} props
 * @param {Object} props.library - Library response from the backend: { total, games[] }.
 * @param {Object} props.myList - Current GamiList game map (gameId → entry).
 * @param {function(Object[]): Promise<void>} props.onImport - Called with selected game objects to import.
 * @param {function(number, number): Promise<void>} props.onSyncPlaytime - Sync playtime for an existing entry.
 * @param {function(): void} props.onRefresh - Refresh the Steam library after import.
 * @returns {JSX.Element|null} Returns null while library is loading.
 */
export function SteamLibrarySection({ library, myList, onImport, onSyncPlaytime, onRefresh }) {
  const [filter, setFilter]         = useState("new");    // "new" | "all"
  const [selections, setSelections] = useState({});        // appid → { checked, status }
  const [importing, setImporting]   = useState(false);
  const [syncing, setSyncing]       = useState({});        // appid → true while syncing

  // Initialise selections whenever the library loads or refreshes
  useEffect(() => {
    if (!library) return;
    const init = {};
    for (const g of library.games) {
      if (g.gamilist_id) continue; // already in list — not selectable
      // Pre-fill status: Played if any playtime logged, else Backlog
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

  // Apply "new only" filter
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

  /** Set a single field to the same value for all selections. */
  const setAll = (key, val) => {
    setSelections(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = { ...next[k], [key]: val };
      return next;
    });
  };

  /** Format minutes into a compact string: "0h" / "2h" / "45m". */
  const formatHours = (mins) => {
    if (!mins) return "0h";
    const h = Math.round(mins / 60);
    return h < 1 ? `${mins}m` : `${h}h`;
  };

  return (
    <div style={{ flex: 1, minWidth: 340, background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 12, padding: "24px 28px" }}>
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

      {/* Bulk action toolbar — shown only in "new" mode with results */}
      {filter === "new" && displayed.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 12px", background: "#080814", borderRadius: 8, border: "1px solid var(--theme-border)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#888", cursor: "pointer" }}>
            <input type="checkbox" checked={checkedCount === displayed.length} onChange={e => setAll("checked", e.target.checked)} />
            All
          </label>
          <span style={{ fontSize: 12, color: "#555" }}>{checkedCount} selected</span>
          <select onChange={e => setAll("status", parseInt(e.target.value))} defaultValue=""
            style={{ background: "#080814", border: "1px solid #1e1e35", borderRadius: 6, padding: "4px 7px", color: "#e0e0f0", fontSize: 12, fontFamily: "inherit", outline: "none" }}>
            <option value="" disabled>Set status…</option>
            {STATUSES_DISPLAY.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={handleImport} disabled={importing || checkedCount === 0}
            style={{ marginLeft: "auto", padding: "5px 16px", background: checkedCount > 0 ? "#7c6ef7" : "var(--theme-border)", border: "none", borderRadius: 7, color: checkedCount > 0 ? "#fff" : "#444", fontWeight: 700, fontSize: 12, cursor: checkedCount > 0 ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {importing ? "Importing…" : `Import ${checkedCount}`}
          </button>
        </div>
      )}

      {/* Game list */}
      <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid var(--theme-border)", borderRadius: 8 }}>
        {displayed.length === 0
          ? <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>All Steam games are already in your GamiList!</div>
          : displayed.map(g => {
              const inList  = !!g.gamilist_id;
              const sel     = selections[g.appid] || {};
              // Steam icon URL: only available when img_icon_url is provided by the API
              const iconUrl = g.img_icon_url
                ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
                : null;
              return (
                <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid #0e0e1e", background: inList ? "#0a120a" : "transparent" }}>
                  {/* Checkbox for new games; checkmark for already-imported */}
                  {!inList
                    ? <input type="checkbox" checked={sel.checked || false} onChange={e => setSelections(p => ({ ...p, [g.appid]: { ...p[g.appid], checked: e.target.checked } }))} />
                    : <span style={{ fontSize: 11, color: "#4caf80", width: 14, textAlign: "center" }}>✓</span>}

                  {/* Game icon */}
                  {iconUrl && <img src={iconUrl} alt="" style={{ width: 24, height: 24, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}

                  {/* Name */}
                  <span style={{ flex: 1, fontSize: 13, color: inList ? "#4caf8099" : "#e0e0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>

                  {/* Playtime */}
                  <span style={{ fontSize: 11, color: "#444", whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }}>{formatHours(g.playtime_forever)}</span>

                  {/* Status label (new games only) */}
                  {!inList && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUSES[sel.status ?? 3]?.color || "#555", whiteSpace: "nowrap", minWidth: 70, textAlign: "right" }}>
                      {STATUSES[sel.status ?? 3]?.label ?? "—"}
                    </span>
                  )}

                  {/* Sync playtime button (imported games with playtime only) */}
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
