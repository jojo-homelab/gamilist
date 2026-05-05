/**
 * LockableSection.jsx — Settings panel with optional password lock
 *
 * Wraps a settings group in a card with a lock icon in the header.
 * When locked:
 *   - Content is dimmed (opacity 0.38) and non-interactive (pointer-events: none).
 *   - Clicking the lock opens a password overlay.
 *   - Correct password (SETTINGS_LOCK_PW) unlocks via onToggle callback.
 * When unlocked:
 *   - Clicking the open-lock icon re-locks immediately without a password.
 *
 * Used in: App.jsx Settings tab (every major section: Dimensions, Grid, Colors…).
 */

import { useState, useRef, useEffect } from "react";
import { SETTINGS_LOCK_PW } from "../../constants.js";

/**
 * A settings card that can be locked behind a password.
 *
 * @param {Object} props
 * @param {string} props.sectionId - Unique key stored in the lockedSections map.
 * @param {string} props.title - Heading displayed in the card header.
 * @param {string} [props.description] - Optional subtitle / helper text below the heading.
 * @param {React.ReactNode} props.children - Settings controls rendered inside the card.
 * @param {boolean} props.locked - Whether this section is currently locked.
 * @param {function(string, boolean): void} props.onToggle - Called with (sectionId, newLockedState).
 * @returns {JSX.Element}
 */
export function LockableSection({ sectionId, title, description, children, locked, onToggle }) {
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw]         = useState("");
  const [pwErr, setPwErr]   = useState(false);
  const inputRef = useRef();

  // Auto-focus the password input when the overlay appears
  useEffect(() => { if (showPw && inputRef.current) inputRef.current.focus(); }, [showPw]);

  const handleLockClick = () => {
    if (locked) {
      // Show password prompt to unlock
      setShowPw(true); setPw(""); setPwErr(false);
    } else {
      // Re-lock immediately — no password needed
      onToggle(sectionId, true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pw === SETTINGS_LOCK_PW) {
      onToggle(sectionId, false);
      setShowPw(false);
    } else {
      // Wrong password — clear input and show error
      setPwErr(true); setPw("");
    }
  };

  return (
    <div style={{
      flex: 1, minWidth: 240,
      background: "var(--theme-surface)",
      border: `1px solid ${locked ? "#e05c7a33" : "var(--theme-border)"}`,
      borderRadius: 12, padding: "24px 28px",
      position: "relative", transition: "border-color 0.2s",
    }}>
      {/* Panel header with lock button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: description ? 6 : 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#eeeeff" }}>{title}</div>
        <button onClick={handleLockClick} title={locked ? "Locked — click to enter password" : "Lock this section"}
          style={{ background: "transparent", border: "none", padding: "2px", cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center" }}>
          {locked
            ? /* Closed padlock */
              <svg width="19" height="21" viewBox="0 0 14 16" fill="none"><rect x="1" y="7" width="12" height="9" rx="2" fill="white"/><path d="M3.5 7V5.5a3.5 3.5 0 1 1 7 0V7" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            : /* Open padlock */
              <svg width="19" height="21" viewBox="0 0 14 16" fill="none"><rect x="1" y="7" width="12" height="9" rx="2" fill="white"/><path d="M3.5 7V5.5a3.5 3.5 0 1 1 7 0" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          }
        </button>
      </div>

      {description && (
        <div style={{ fontSize: 11, color: "#888", marginBottom: 20, lineHeight: 1.6 }}>{description}</div>
      )}

      {/* Controls — dimmed and non-interactive when locked */}
      <div style={{ opacity: locked ? 0.38 : 1, pointerEvents: locked ? "none" : "auto", userSelect: locked ? "none" : "auto", transition: "opacity 0.2s" }}>
        {children}
      </div>

      {/* Password overlay — rendered on top of the panel content */}
      {showPw && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(6,6,18,0.94)", borderRadius: 12, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <svg width="19" height="21" viewBox="0 0 14 16" fill="none"><rect x="1" y="7" width="12" height="9" rx="2" fill="white"/><path d="M3.5 7V5.5a3.5 3.5 0 1 1 7 0V7" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          <div style={{ fontSize: 12, color: "#888", fontWeight: 700, letterSpacing: 0.5 }}>Enter password to unlock</div>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <input ref={inputRef} type="password" value={pw}
              onChange={e => { setPw(e.target.value); setPwErr(false); }}
              placeholder="Password"
              style={{ background: "#080814", border: `1px solid ${pwErr ? "#e05c7a" : "#2a2a50"}`, borderRadius: 7, padding: "7px 14px", color: "#e0e0f0", fontSize: 14, outline: "none", fontFamily: "inherit", width: 140, textAlign: "center", letterSpacing: 2 }} />
            {pwErr && <div style={{ fontSize: 11, color: "#e05c7a", marginTop: -4 }}>Incorrect password</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <button type="submit" style={{ padding: "6px 18px", borderRadius: 7, border: "1px solid #7c6ef766", background: "#12121e", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Unlock</button>
              <button type="button" onClick={() => setShowPw(false)} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid #1e1e35", background: "transparent", color: "#444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
