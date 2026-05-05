/**
 * api.js — GamiList API base URL and fetch helper
 *
 * Exports:
 *   API       : base URL string for all backend endpoints (/api prefix included)
 *   apiFetch  : thin fetch wrapper that throws on HTTP errors and parses JSON
 *
 * The API constant uses VITE_API_URL from the build environment:
 *   - Production (Kubernetes ingress): VITE_API_URL="" → relative paths (/api/…)
 *   - Local dev (no var set)          : falls back to http://localhost:5001/api
 */

/**
 * Base URL for all GamiList backend API calls.
 * An empty VITE_API_URL means "use relative paths" (production ingress handles routing).
 * Undefined VITE_API_URL falls back to the local dev server.
 *
 * @type {string}
 */
export const API = (import.meta.env.VITE_API_URL ?? "http://localhost:5001") + "/api";

/**
 * Fetch a GamiList API endpoint and return parsed JSON.
 * Throws an Error with the HTTP status code on non-2xx responses so callers
 * can inspect the status in `.message` (e.g. "HTTP 429", "HTTP 404").
 *
 * @param {string} path - Path relative to API base, e.g. "/list" or "/settings".
 * @param {RequestInit} [opts] - Optional fetch options (method, headers, body, …).
 * @returns {Promise<any>} Parsed JSON response body.
 * @throws {Error} On network failure or non-2xx HTTP status.
 *
 * @example
 * const data = await apiFetch("/list");
 * await apiFetch("/list/42", { method: "DELETE" });
 */
export async function apiFetch(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
