/**
 * Toast.jsx — Transient success/error notification
 *
 * Appears in the top-right corner and auto-dismisses via CSS animation.
 * The parent removes it from the DOM via `onDone` when the exit animation
 * ends (animationend event on the wrapper).
 *
 * Animation keyframes (toastIn, toastOut) are declared in App.jsx's global
 * <style> block so they are available to this component at runtime.
 */

/**
 * Fixed-position toast notification.
 *
 * @param {Object} props
 * @param {string} props.msg - Message text to display.
 * @param {boolean} props.ok - true = success (green), false = error (red).
 * @param {function(): void} props.onDone - Called when the exit animation ends; remove the toast.
 * @returns {JSX.Element}
 */
export function Toast({ msg, ok, onDone }) {
  return (
    <div
      onAnimationEnd={onDone}
      style={{
        position: "fixed", top: 24, right: 28, zIndex: 1000,
        background: ok ? "#1a3a1a" : "#2a0a0a",
        border: `1px solid ${ok ? "#4caf8066" : "#ff606066"}`,
        color: ok ? "#4caf80" : "#ff8080",
        borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 700,
        boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        // Enter over 0.2 s, then exit after 2.5 s hold
        animation: "toastIn 0.2s ease, toastOut 0.3s ease 2.5s forwards",
        fontFamily: "inherit",
      }}>
      {ok ? "✓ " : "✗ "}{msg}
    </div>
  );
}
