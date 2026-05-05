/**
 * constants.js — GamiList shared constants
 *
 * All static lookup tables used across multiple components live here:
 *   - Game status definitions (id, label, color, background)
 *   - Platform slug/name/short lookup table
 *   - RAWG numeric platform IDs (for search/browse API)
 *   - Password for the lockable settings sections
 *
 * Nothing in this file depends on React or runtime state — it is safe to
 * import from any module without creating circular dependencies.
 */

/**
 * All 9 game statuses with display metadata.
 * Index matches the numeric `status` field stored in the database.
 *
 * @type {Array<{id: number, label: string, color: string, bg: string}>}
 */
export const STATUSES = [
  { id: 0, label: "Playing",        color: "#7c6ef7", bg: "#12121e" },
  { id: 1, label: "Played",         color: "#4caf80", bg: "#112418" },
  { id: 2, label: "Next To Play",   color: "#e6a63a", bg: "#261d0a" },
  { id: 3, label: "Backlog",        color: "#e05c7a", bg: "#2a0f18" },
  { id: 4, label: "Replaying",      color: "#38bdf8", bg: "#0a1e2a" },
  { id: 5, label: "Plan to Replay", color: "#a78bfa", bg: "#1a1430" },
  { id: 6, label: "Dropped",        color: "#f87171", bg: "#2a0a0a" },
  { id: 7, label: "Demo",           color: "#20b2aa", bg: "#0a1e1e" },
  { id: 8, label: "Paused",         color: "#f59e0b", bg: "#1e1500" },
];

/**
 * Display order for filter tabs and dropdown menus.
 * Dropped (id 6) is moved to the very end so "positive" statuses appear first.
 *
 * @type {Array<{id: number, label: string, color: string, bg: string}>}
 */
export const STATUSES_DISPLAY = [
  ...STATUSES.filter(s => s.id !== 6),
  STATUSES[6],
];

/**
 * Comprehensive platform list. `slug` matches the RAWG API platform slug so
 * it can be used for both display and API filtering.
 *
 * @type {Array<{slug: string, name: string, short: string}>}
 */
export const ALL_PLATFORMS = [
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

/**
 * Flat map from platform slug → short display code.
 * Derived from ALL_PLATFORMS for O(1) lookups in render loops.
 *
 * @type {Record<string, string>}
 */
export const PLATFORM_SHORT = Object.fromEntries(ALL_PLATFORMS.map(p => [p.slug, p.short]));

/**
 * RAWG API numeric platform IDs, keyed by our slug strings.
 * Used when constructing search/browse API requests that require numeric IDs.
 * Not all platforms are listed here — only those supported by RAWG browse.
 *
 * @type {Record<string, number>}
 */
export const RAWG_PLATFORM_IDS = {
  "pc": 4, "playstation5": 187, "playstation4": 18, "playstation3": 16,
  "playstation2": 15, "playstation": 27, "xbox-series-x": 186, "xbox-one": 1,
  "xbox360": 14, "xbox-old": 80, "nintendo-switch": 7, "wii-u": 10, "wii": 11,
  "gamecube": 105, "nintendo-64": 83, "super-nintendo": 79, "nes": 49,
  "game-boy-advance": 24, "game-boy-color": 43, "game-boy": 43,
  "nintendo-3ds": 8, "nintendo-ds": 77, "psp": 17, "ps-vita": 19,
  "ios": 3, "android": 21, "macos": 5, "linux": 6,
  "sega-genesis": 167, "sega-saturn": 107, "sega-dreamcast": 106,
};

/**
 * PIN required to unlock a locked settings section.
 * This is a simple UI gate — not a security mechanism.
 *
 * @type {string}
 */
export const SETTINGS_LOCK_PW = "230737";
