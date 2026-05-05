/**
 * utils.js — GamiList pure utility functions
 *
 * Small, stateless helpers used across multiple components:
 *   - normName    : fuzzy title normalisation for PSN/Steam name matching
 *   - formatPlaytime : human-readable "Xh Ym" from raw minutes
 *   - rawgImgSrc  : proxy URL for RAWG cover images (avoids CORS / hotlink blocks)
 *   - coverSrc    : URL for a user-uploaded cover stored in the backend
 *
 * These functions have no side effects and do not import React.
 * They depend on `API` from api.js for URL construction.
 */

import { API } from "./api.js";

/**
 * Normalise a game title for fuzzy matching.
 * Converts to lowercase and strips all non-alphanumeric characters so that
 * "The Witcher 3: Wild Hunt" matches "witcher3wildhunt".
 * Used to correlate PSN/Steam imports with RAWG search results.
 *
 * @param {string} s - Raw game name, may be null/undefined.
 * @returns {string} Normalised string (never null).
 */
export const normName = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Format a playtime value in minutes into a human-readable string.
 * Returns null (not rendered) when the value is zero or missing.
 *
 * @param {number|null|undefined} mins - Playtime in minutes.
 * @returns {string|null} e.g. "42h", "1h 30m", or null.
 *
 * @example
 * formatPlaytime(90)   // "1h 30m"
 * formatPlaytime(60)   // "1h"
 * formatPlaytime(0)    // null
 */
export function formatPlaytime(mins) {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Build a proxied URL for a RAWG cover image.
 * Routes the request through /api/image-proxy to avoid CORS issues and
 * to cache the result server-side.
 *
 * @param {string|null|undefined} url - Original RAWG image URL.
 * @returns {string|null} Proxy URL, or null if no source URL provided.
 */
export const rawgImgSrc = (url) => url ? `${API}/image-proxy?url=${encodeURIComponent(url)}` : null;

/**
 * Build the URL for a user-uploaded cover image stored in the backend.
 * The `?v=` cache-buster param is added at the call site (not here) so this
 * function stays pure.
 *
 * @param {number|string} id - The game's database ID.
 * @returns {string} Absolute URL to the cover endpoint.
 */
export const coverSrc = (id) => `${API}/list/${id}/cover`;
