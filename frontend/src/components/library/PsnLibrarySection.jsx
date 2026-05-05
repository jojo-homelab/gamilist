/**
 * PsnLibrarySection.jsx — PSN library import panel
 *
 * Displayed in the Settings → Platform Data section once the user's PSN
 * library has been synced. Shows all games from the PSN account and lets the
 * user select which to import into GamiList.
 *
 * Features:
 *   - Toggle between "New only" and "All" game views
 *   - Bulk select all + bulk status override via a dropdown
 *   - Per-game status pre-filled based on play duration (>0 min → Played, else Backlog)
 *   - Inline "Sync playtime" button for games already in GamiList
 *
 * Used in: App.jsx Settings tab (Platform Data section).
 */

import { useState, useEffect } from "react";
import { STATUSES, STATUSES_DISPLAY } from "../../constants.js";

/**
 * PSN library import UI panel.
 *
 * @param {Object} props
 * @param {Object} props.library - Library response from the backend: { total, games[] }.
 * @param {Object} props.myList - Current GamiList game map (gameId → entry).
 * @param {function(Object[]): Promise<void>} props.onImport - Called with selected game objects to import.
 * @param {function(number, number): Promise<void>} props.onSyncPlaytime - Sync playtime for an existing entry.
 * @param {function(): void} props.onRefresh - Refresh the PSN library after import.
 * @returns {JSX.Element|null} Returns null while library is loading.
 */
export function PsnLibrarySection({ library, myList, onImport, onSyncPlaytime, onRefresh }) {
  const [filter, setFilter]         = useState("new");   // "new" | "all"
  const [selections, setSelections] = useState({});       // title_id → { checked, status }
  const [importing, setImporting]   = useState(false);
  const [syncing, setSyncing]       = useState({});       // title_id → true while syncing

  // Initialise selections whenever the library loads or refreshes
  useEffect(() => {
    if (!library) return;
    const init = {};
    for (const g of library.games) {
      if (g.gamilist_id) continue; // already in list — not selectable
      // Pre-fill status: Played if any playtime logged, else Backlog
      init[g.title_id] = { checked: true, status: g.play_duration_minutes > 0 ? 1 : 3 };
    }
    setSelections(init);
  }, [library]);

  const handleSyncPlaytime = async (g) => {
    setSyncing(p => ({ ...p, [g.title_id]: true }));
    await onSyncPlaytime(g.game_id, g.play_duration_minutes);
    setSyncing(p => ({ ...p, [g.title_id]: false }));
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
      .filter(g => selections[g.title_id]?.checked)
      .map(g => ({ ...g, ...selections[g.title_id] }));
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
    if (!mins) return "—";
    const h = Math.round(mins / 60);
    return h < 1 ? `${mins}m` : `${h}h`;
  };

  return (
    <div style={{ flex: 1, minWidth: 340, background: "var(--theme-surface)", border: "1px solid var(--theme-border)", borderRadius: 12, padding: "24px 28px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#eeeeff", marginBottom: 6 }}>PSN Library</div>
      <div style={{ fontSize: 11, color: "#444", marginBottom: 16, lineHeight: 1.6 }}>
        {library.total} games total · {library.games.filter(g => g.gamilist_id).length} already in GamiList · {library.games.filter(g => !g.gamilist_id).length} new
      </div>

      {/* Filter toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["new", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: filter === f ? "#003087" + "55" : "transparent", color: filter === f ? "#0070cc" : "#555", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
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
            style={{ marginLeft: "auto", padding: "5px 16px", background: checkedCount > 0 ? "#0070cc" : "var(--theme-border)", border: "none", borderRadius: 7, color: checkedCount > 0 ? "#fff" : "#444", fontWeight: 700, fontSize: 12, cursor: checkedCount > 0 ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {importing ? "Importing…" : `Import ${checkedCount}`}
          </button>
        </div>
      )}

      {/* Game list */}
      <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid var(--theme-border)", borderRadius: 8 }}>
        {displayed.length === 0
          ? <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>All PSN games are already in your GamiList!</div>
          : displayed.map(g => {
              const inList = !!g.gamilist_id;
              const sel    = selections[g.title_id] || {};
              return (
                <div key={g.title_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid #0e0e1e", background: inList ? "#0a0c12" : "transparent" }}>
                  {/* Checkbox for new games; checkmark for already-imported */}
                  {!inList
                    ? <input type="checkbox" checked={sel.checked || false} onChange={e => setSelections(p => ({ ...p, [g.title_id]: { ...p[g.title_id], checked: e.target.checked } }))} />
                    : <span style={{ fontSize: 11, color: "#0070cc", width: 14, textAlign: "center" }}>✓</span>}

                  {/* Game icon */}
                  {g.image_url && <img src={g.image_url} alt="" style={{ width: 24, height: 24, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}

                  {/* Name */}
                  <span style={{ flex: 1, fontSize: 13, color: inList ? "#0070cc99" : "#e0e0f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>

                  {/* Platform abbreviation */}
                  <span style={{ fontSize: 10, color: "#333", whiteSpace: "nowrap" }}>{g.platform.replace("ps5_native_game", "PS5").replace("ps4_game", "PS4").replace(/_/g, " ")}</span>

                  {/* Playtime */}
                  <span style={{ fontSize: 11, color: "#444", whiteSpace: "nowrap", minWidth: 36, textAlign: "right" }}>{formatHours(g.play_duration_minutes)}</span>

                  {/* Status label (new games only) */}
                  {!inList && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUSES[sel.status ?? 3]?.color || "#555", whiteSpace: "nowrap", minWidth: 70, textAlign: "right" }}>
                      {STATUSES[sel.status ?? 3]?.label ?? "—"}
                    </span>
                  )}

                  {/* Sync playtime button (imported games with playtime only) */}
                  {inList && g.play_duration_minutes > 0 && (
                    <button onClick={() => handleSyncPlaytime(g)} disabled={syncing[g.title_id]}
                      style={{ fontSize: 10, padding: "2px 8px", background: "transparent", border: "1px solid #1a2a3a", borderRadius: 4, color: syncing[g.title_id] ? "#333" : "#0070cc88", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                      {syncing[g.title_id] ? "…" : "Sync playtime"}
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
