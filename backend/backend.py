"""
GamiList — Flask Backend
========================
REST API for the GamiList game-tracking app.

Responsibilities:
  - Proxy game search and metadata from the RAWG Video Games Database API
  - Persist the user's game list (status, rating, favourites, custom covers) in PostgreSQL
  - Serve custom cover images stored as binary blobs in the database

Environment variables:
  DATABASE_URL   PostgreSQL connection string (required in production)
                 Default: postgresql://localhost/gamilist
  RAWG_API_KEY   API key from https://rawg.io/apidocs
                 Register for a free account and paste your key here.
                 Default: empty string (RAWG calls will fail without a valid key)
"""

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import requests
import psycopg2
import psycopg2.extras
import json
import os
from datetime import datetime, timezone

app = Flask(__name__)

# Allow cross-origin requests from the frontend (required when running
# frontend and backend on different ports or domains).
CORS(app)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# RAWG API key — get yours free at https://rawg.io/apidocs
# IMPORTANT: Never commit a real key here. Set the RAWG_API_KEY environment
# variable instead (e.g. in a .env file or Kubernetes secret).
RAWG_KEY = os.environ.get("RAWG_API_KEY", "")
RAWG_BASE = "https://api.rawg.io/api"

# PostgreSQL connection string injected by the Helm chart via DATABASE_URL env var.
# For local development outside k8s: export DATABASE_URL=postgresql://localhost/gamilist
DB_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/gamilist")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    """Open and return a new PostgreSQL connection using DB_URL."""
    return psycopg2.connect(DB_URL)


def init_db():
    """
    Create all required tables if they do not already exist.

    Called once at startup.

    Tables:
      entries  — One row per game the user has added to their list.
      settings — Single-row table storing UI preferences (card size, upload button size).
                 Enforced to one row via CHECK (id = 1) and a DEFAULT 1 primary key.

    entries columns:
      game_id     — RAWG game ID (primary key)
      game_data   — Full RAWG game object stored as JSONB (name, cover URL, genres, etc.)
      status      — Integer index into the STATUSES list in the frontend (0–6)
      user_rating — User's personal score (0.0–10.0), nullable
      favourite   — Boolean flag for the Favourites tab
      cover_image — Custom cover uploaded by the user, stored as raw bytes (BYTEA)
      cover_mime  — MIME type of the cover image (e.g. "image/jpeg")
      created_at  — Row insertion timestamp
      updated_at  — Last modification timestamp (used for list ordering)

    settings columns:
      card_w_mult     — Card width multiplier (default 1.5)
      card_h_mult     — Card height multiplier (default 1.5)
      upload_btn_mult — Cover upload button size multiplier (default 1.0)
      card_count      — Fixed grid column count; 0 means auto-fill (default 0)
      upload_btn_text — Optional label shown on the upload button (default empty → shows emoji)
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS entries (
                    game_id     INTEGER PRIMARY KEY,
                    game_data   JSONB       NOT NULL,
                    status      INTEGER,
                    user_rating REAL,
                    favourite   BOOLEAN     DEFAULT FALSE,
                    cover_image BYTEA,
                    cover_mime  TEXT,
                    created_at  TIMESTAMPTZ DEFAULT NOW(),
                    updated_at  TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    id              INTEGER PRIMARY KEY DEFAULT 1,
                    card_w_mult     REAL    NOT NULL DEFAULT 1.5,
                    card_h_mult     REAL    NOT NULL DEFAULT 1.5,
                    upload_btn_mult REAL    NOT NULL DEFAULT 1.0,
                    card_count      INTEGER NOT NULL DEFAULT 0,
                    CONSTRAINT single_row CHECK (id = 1)
                )
            """)
            # Migrate existing rows that pre-date newer columns
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS card_count      INTEGER NOT NULL DEFAULT 0")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS upload_btn_text TEXT    NOT NULL DEFAULT ''")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS glow1_enabled   BOOLEAN NOT NULL DEFAULT TRUE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS glow1_color     TEXT    NOT NULL DEFAULT '#FFD700'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS glow2_enabled   BOOLEAN NOT NULL DEFAULT TRUE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS glow2_color     TEXT    NOT NULL DEFAULT '#C0C0C0'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS glow3_enabled   BOOLEAN NOT NULL DEFAULT TRUE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS glow3_color     TEXT    NOT NULL DEFAULT '#CD7F32'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS steam_api_key   TEXT    NOT NULL DEFAULT ''")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS steam_id        TEXT    NOT NULL DEFAULT ''")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS steam_mappings  JSONB   NOT NULL DEFAULT '[]'")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS playtime_minutes  INTEGER")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS replay_count      INTEGER NOT NULL DEFAULT 0")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS tags              JSONB   NOT NULL DEFAULT '[]'")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS activity_log      JSONB   NOT NULL DEFAULT '[]'")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS platforms_played  JSONB   NOT NULL DEFAULT '[]'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS platform_highlight_color TEXT    NOT NULL DEFAULT '#7c6ef7'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS platform_colors         JSONB   NOT NULL DEFAULT '{}'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS platform_icon_mode      BOOLEAN NOT NULL DEFAULT TRUE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS status_colors           JSONB   NOT NULL DEFAULT '{}'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS activity_colors         JSONB   NOT NULL DEFAULT '{}'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS card_h2_mult            REAL    NOT NULL DEFAULT 1.0")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS alt_card_mode           BOOLEAN NOT NULL DEFAULT FALSE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav1_mult               REAL    NOT NULL DEFAULT 2.0")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav2_mult               REAL    NOT NULL DEFAULT 2.0")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav3_mult               REAL    NOT NULL DEFAULT 2.0")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS entry_images (
                    id         SERIAL PRIMARY KEY,
                    game_id    INTEGER NOT NULL,
                    seq        INTEGER NOT NULL DEFAULT 0,
                    image_data BYTEA NOT NULL,
                    image_mime TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS custom_images_only BOOLEAN NOT NULL DEFAULT FALSE")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS img_pos_x REAL NOT NULL DEFAULT 50")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS img_pos_y REAL NOT NULL DEFAULT 50")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS img_scale REAL NOT NULL DEFAULT 1.0")


init_db()


def row_to_entry(row):
    """
    Convert a database row (dict) to the JSON shape expected by the frontend.

    The frontend expects:
      game       — full RAWG game object
      status     — integer status index
      userRating — float or null
      favourite  — boolean
      hasCover   — boolean (true when a custom cover binary exists in the DB)
    """
    return {
        "game":            row["game_data"],
        "status":          row["status"],
        "userRating":      row["user_rating"],
        "favourite":       row["favourite"],
        "hasCover":        row["cover_image"] is not None,
        "playtimeMinutes": row.get("playtime_minutes"),
        "replayCount":     row.get("replay_count") or 0,
        "tags":            row.get("tags") or [],
        "activityLog":      row.get("activity_log") or [],
        "platformsPlayed":  row.get("platforms_played") or [],
        "extraImageIds":   [int(i) for i in (row.get("extra_image_ids") or [])],
        "customImagesOnly": row.get("custom_images_only") or False,
        "imgPosX":          row.get("img_pos_x") if row.get("img_pos_x") is not None else 50,
        "imgPosY":          row.get("img_pos_y") if row.get("img_pos_y") is not None else 50,
        "imgScale":         row.get("img_scale") if row.get("img_scale") is not None else 1.0,
    }


# ---------------------------------------------------------------------------
# Settings routes
# ---------------------------------------------------------------------------

@app.route("/api/settings", methods=["GET"])
def get_settings():
    """
    Return the current UI settings row.

    If no settings row exists yet (first launch), returns the default values
    without writing anything to the database — the row is created on first PUT.

    Returns JSON:
      cardWMult     — card width multiplier
      cardHMult     — card height multiplier
      uploadBtnMult — upload button size multiplier
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM settings WHERE id = 1")
            row = cur.fetchone()
    if row:
        return jsonify({
            "cardWMult":     row["card_w_mult"],
            "cardHMult":     row["card_h_mult"],
            "uploadBtnMult": row["upload_btn_mult"],
            "cardCount":     row["card_count"],
            "uploadBtnText": row["upload_btn_text"],
            "glow1Enabled":   row["glow1_enabled"],
            "glow1Color":     row["glow1_color"],
            "glow2Enabled":   row["glow2_enabled"],
            "glow2Color":     row["glow2_color"],
            "glow3Enabled":   row["glow3_enabled"],
            "glow3Color":     row["glow3_color"],
            "steamApiKey":             row["steam_api_key"],
            "steamId":                 row["steam_id"],
            "steamMappings":           row["steam_mappings"] or [],
            "platformHighlightColor":  row["platform_highlight_color"],
            "platformColors":          row["platform_colors"] or {},
            "platformIconMode":        row["platform_icon_mode"],
            "statusColors":            row["status_colors"] or {},
            "activityColors":          row["activity_colors"] or {},
            "cardH2Mult":              row.get("card_h2_mult") or 1.0,
            "altCardMode":             row.get("alt_card_mode") or False,
            "fav1Mult":                row.get("fav1_mult") if row.get("fav1_mult") is not None else 2.0,
            "fav2Mult":                row.get("fav2_mult") if row.get("fav2_mult") is not None else 2.0,
            "fav3Mult":                row.get("fav3_mult") if row.get("fav3_mult") is not None else 2.0,
        })
    # No row yet — return defaults so the frontend has something to work with
    return jsonify({
        "cardWMult": 1.5, "cardHMult": 1.5, "uploadBtnMult": 1.0, "cardCount": 0, "uploadBtnText": "",
        "glow1Enabled": True,  "glow1Color": "#FFD700",
        "glow2Enabled": True,  "glow2Color": "#C0C0C0",
        "glow3Enabled": True,  "glow3Color": "#CD7F32",
        "steamApiKey": "", "steamId": "", "steamMappings": [],
        "platformHighlightColor": "#7c6ef7", "platformColors": {}, "platformIconMode": True, "statusColors": {}, "activityColors": {},
        "cardH2Mult": 1.0, "altCardMode": False,
        "fav1Mult": 2.0, "fav2Mult": 2.0, "fav3Mult": 2.0,
    })


@app.route("/api/settings", methods=["PUT"])
def put_settings():
    """
    Create or update the UI settings row (upsert).

    Accepts a partial body — only the keys present are updated.
    Missing keys fall back to their current database values via COALESCE,
    so callers don't need to send the full object on every change.

    Request body (JSON, all optional):
      cardWMult     — card width multiplier
      cardHMult     — card height multiplier
      uploadBtnMult — upload button size multiplier

    Returns the full updated settings object.
    """
    body = request.get_json()
    card_w_mult     = body.get("cardWMult")
    card_h_mult     = body.get("cardHMult")
    upload_btn_mult = body.get("uploadBtnMult")
    card_count      = body.get("cardCount")
    upload_btn_text = body.get("uploadBtnText")
    glow1_enabled   = body.get("glow1Enabled")
    glow1_color     = body.get("glow1Color")
    glow2_enabled   = body.get("glow2Enabled")
    glow2_color     = body.get("glow2Color")
    glow3_enabled   = body.get("glow3Enabled")
    glow3_color     = body.get("glow3Color")
    steam_api_key            = body.get("steamApiKey")
    steam_id                 = body.get("steamId")
    steam_mappings           = body.get("steamMappings")
    platform_highlight_color = body.get("platformHighlightColor")
    platform_colors          = body.get("platformColors")
    platform_icon_mode       = body.get("platformIconMode")
    status_colors            = body.get("statusColors")
    activity_colors          = body.get("activityColors")
    card_h2_mult             = body.get("cardH2Mult")
    alt_card_mode            = body.get("altCardMode")
    fav1_mult                = body.get("fav1Mult")
    fav2_mult                = body.get("fav2Mult")
    fav3_mult                = body.get("fav3Mult")
    steam_mappings_json      = json.dumps(steam_mappings)      if steam_mappings is not None else None
    platform_colors_json     = json.dumps(platform_colors)     if platform_colors is not None else None
    status_colors_json       = json.dumps(status_colors)       if status_colors is not None else None
    activity_colors_json     = json.dumps(activity_colors)     if activity_colors is not None else None

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO settings (
                    id, card_w_mult, card_h_mult, upload_btn_mult, card_count, upload_btn_text,
                    glow1_enabled, glow1_color, glow2_enabled, glow2_color, glow3_enabled, glow3_color,
                    steam_api_key, steam_id, steam_mappings, platform_highlight_color,
                    platform_colors, platform_icon_mode, status_colors, activity_colors,
                    card_h2_mult, alt_card_mode, fav1_mult, fav2_mult, fav3_mult
                )
                VALUES (1,
                    COALESCE(%s, 1.5), COALESCE(%s, 1.5), COALESCE(%s, 1.0),
                    COALESCE(%s, 0),   COALESCE(%s, ''),
                    COALESCE(%s, TRUE),  COALESCE(%s, '#FFD700'),
                    COALESCE(%s, TRUE),  COALESCE(%s, '#C0C0C0'),
                    COALESCE(%s, TRUE),  COALESCE(%s, '#CD7F32'),
                    COALESCE(%s, ''),    COALESCE(%s, ''),
                    COALESCE(%s::jsonb, '[]'::jsonb),
                    COALESCE(%s, '#7c6ef7'),
                    COALESCE(%s::jsonb, '{}'::jsonb),
                    COALESCE(%s, TRUE),
                    COALESCE(%s::jsonb, '{}'::jsonb),
                    COALESCE(%s::jsonb, '{}'::jsonb),
                    COALESCE(%s, 1.0), COALESCE(%s, FALSE),
                    COALESCE(%s, 2.0), COALESCE(%s, 2.0), COALESCE(%s, 2.0))
                ON CONFLICT (id) DO UPDATE SET
                    card_w_mult              = COALESCE(EXCLUDED.card_w_mult,              settings.card_w_mult),
                    card_h_mult              = COALESCE(EXCLUDED.card_h_mult,              settings.card_h_mult),
                    upload_btn_mult          = COALESCE(EXCLUDED.upload_btn_mult,          settings.upload_btn_mult),
                    card_count               = COALESCE(EXCLUDED.card_count,               settings.card_count),
                    upload_btn_text          = COALESCE(EXCLUDED.upload_btn_text,          settings.upload_btn_text),
                    glow1_enabled            = COALESCE(EXCLUDED.glow1_enabled,            settings.glow1_enabled),
                    glow1_color              = COALESCE(EXCLUDED.glow1_color,              settings.glow1_color),
                    glow2_enabled            = COALESCE(EXCLUDED.glow2_enabled,            settings.glow2_enabled),
                    glow2_color              = COALESCE(EXCLUDED.glow2_color,              settings.glow2_color),
                    glow3_enabled            = COALESCE(EXCLUDED.glow3_enabled,            settings.glow3_enabled),
                    glow3_color              = COALESCE(EXCLUDED.glow3_color,              settings.glow3_color),
                    steam_api_key            = COALESCE(EXCLUDED.steam_api_key,            settings.steam_api_key),
                    steam_id                 = COALESCE(EXCLUDED.steam_id,                 settings.steam_id),
                    steam_mappings           = COALESCE(EXCLUDED.steam_mappings,           settings.steam_mappings),
                    platform_highlight_color = COALESCE(EXCLUDED.platform_highlight_color, settings.platform_highlight_color),
                    platform_colors          = COALESCE(EXCLUDED.platform_colors,          settings.platform_colors),
                    platform_icon_mode       = COALESCE(EXCLUDED.platform_icon_mode,       settings.platform_icon_mode),
                    status_colors            = COALESCE(EXCLUDED.status_colors,            settings.status_colors),
                    activity_colors          = COALESCE(EXCLUDED.activity_colors,          settings.activity_colors),
                    card_h2_mult             = COALESCE(EXCLUDED.card_h2_mult,             settings.card_h2_mult),
                    alt_card_mode            = COALESCE(EXCLUDED.alt_card_mode,            settings.alt_card_mode),
                    fav1_mult                = COALESCE(EXCLUDED.fav1_mult,                settings.fav1_mult),
                    fav2_mult                = COALESCE(EXCLUDED.fav2_mult,                settings.fav2_mult),
                    fav3_mult                = COALESCE(EXCLUDED.fav3_mult,                settings.fav3_mult)
                RETURNING *
            """, (card_w_mult, card_h_mult, upload_btn_mult, card_count, upload_btn_text,
                  glow1_enabled, glow1_color, glow2_enabled, glow2_color, glow3_enabled, glow3_color,
                  steam_api_key, steam_id, steam_mappings_json, platform_highlight_color,
                  platform_colors_json, platform_icon_mode, status_colors_json, activity_colors_json,
                  card_h2_mult, alt_card_mode, fav1_mult, fav2_mult, fav3_mult))
            row = cur.fetchone()
    return jsonify({
        "cardWMult":              row["card_w_mult"],
        "cardHMult":              row["card_h_mult"],
        "uploadBtnMult":          row["upload_btn_mult"],
        "cardCount":              row["card_count"],
        "uploadBtnText":          row["upload_btn_text"],
        "glow1Enabled":           row["glow1_enabled"],
        "glow1Color":             row["glow1_color"],
        "glow2Enabled":           row["glow2_enabled"],
        "glow2Color":             row["glow2_color"],
        "glow3Enabled":           row["glow3_enabled"],
        "glow3Color":             row["glow3_color"],
        "steamApiKey":            row["steam_api_key"],
        "steamId":                row["steam_id"],
        "steamMappings":          row["steam_mappings"] or [],
        "platformHighlightColor": row["platform_highlight_color"],
        "platformColors":         row["platform_colors"] or {},
        "platformIconMode":       row["platform_icon_mode"],
        "statusColors":           row["status_colors"] or {},
        "activityColors":         row["activity_colors"] or {},
        "cardH2Mult":             row.get("card_h2_mult") or 1.0,
        "altCardMode":            row.get("alt_card_mode") or False,
        "fav1Mult":               row.get("fav1_mult") if row.get("fav1_mult") is not None else 2.0,
        "fav2Mult":               row.get("fav2_mult") if row.get("fav2_mult") is not None else 2.0,
        "fav3Mult":               row.get("fav3_mult") if row.get("fav3_mult") is not None else 2.0,
    })


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.route("/api/health")
def health():
    """
    Lightweight liveness/readiness probe used by the Kubernetes deployment.
    Returns 200 immediately without touching external APIs or the database,
    so a missing RAWG key or slow DB startup never blocks pod readiness.
    """
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# RAWG API helpers
# ---------------------------------------------------------------------------

def rawg_get(path, params=None):
    """
    Make a GET request to the RAWG API and return the parsed JSON response.

    Automatically injects the API key into every request.
    Raises an HTTPError if the RAWG API returns a non-2xx status.

    Args:
      path   — API path, e.g. "/games"
      params — Optional dict of query parameters (merged with the API key)
    """
    p = params or {}
    p["key"] = RAWG_KEY
    r = requests.get(f"{RAWG_BASE}{path}", params=p)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------------------
# RAWG proxy routes
# ---------------------------------------------------------------------------

@app.route("/api/games/search")
def search():
    """
    Search RAWG for games matching the query string.

    Query params:
      q          — search term (required)
      page_size  — number of results to return (default: 12)

    Returns a JSON array of RAWG game objects.
    """
    q = request.args.get("q", "")
    page_size = request.args.get("page_size", 12)
    data = rawg_get("/games", {"search": q, "page_size": page_size})
    return jsonify(data.get("results", []))


@app.route("/api/games/<int:game_id>/screenshots")
def game_screenshots(game_id):
    """Return up to 8 screenshot URLs for a RAWG game (proxied through image-proxy)."""
    try:
        data = rawg_get(f"/games/{game_id}/screenshots", {"page_size": 8})
        return jsonify([r["image"] for r in data.get("results", [])])
    except Exception:
        return jsonify([])


@app.route("/api/games/popular")
def popular():
    """
    Return the top 10 games ordered by Metacritic score from RAWG.

    Used as the default content on the Search tab before the user types anything.
    Also used as the backend readiness probe endpoint in the Helm chart.
    """
    data = rawg_get("/games", {"ordering": "-metacritic", "page_size": 10})
    return jsonify(data.get("results", []))


@app.route("/api/image-proxy")
def image_proxy():
    """
    Proxy image requests to RAWG's CDN.

    The frontend can't load RAWG images directly due to mixed-content / CORS
    restrictions in some environments, so it routes them through this endpoint.

    Query params:
      url — the RAWG image URL to proxy (must contain 'rawg.io' as a safety check)

    Returns the raw image bytes with the original Content-Type header.
    """
    url = request.args.get("url")
    allowed = ("rawg.io", "steamstatic.com", "steamcdn-a.akamaihd.net")
    if not url or not any(h in url for h in allowed):
        return jsonify({"error": "Invalid URL"}), 400
    r = requests.get(url, stream=True)
    return Response(r.content, content_type=r.headers.get("Content-Type", "image/jpeg"))


# ---------------------------------------------------------------------------
# Game list routes
# ---------------------------------------------------------------------------

@app.route("/api/list", methods=["GET"])
def get_list():
    """
    Return the user's entire game list as a JSON object keyed by game_id.

    Example response:
      {
        "12345": { "game": {...}, "status": 1, "userRating": 8.5, ... },
        ...
      }

    Results are ordered by updated_at DESC so the most recently changed
    entries appear first in the frontend.
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT e.*, COALESCE(
                    json_agg(ei.id ORDER BY ei.seq) FILTER (WHERE ei.id IS NOT NULL), '[]'
                ) AS extra_image_ids
                FROM entries e
                LEFT JOIN entry_images ei ON ei.game_id = e.game_id
                GROUP BY e.game_id
                ORDER BY e.updated_at DESC
            """)
            rows = cur.fetchall()
    return jsonify({str(r["game_id"]): row_to_entry(r) for r in rows})


@app.route("/api/list/<int:game_id>", methods=["PUT"])
def upsert_entry(game_id):
    """
    Add or update a game in the user's list (upsert).

    Uses PostgreSQL's INSERT ... ON CONFLICT DO UPDATE so the same endpoint
    handles both adding a new game and changing the status/rating of an existing one.

    Request body (JSON):
      game       — full RAWG game object (stored in JSONB column)
      status     — integer status index (0–6)
      userRating — float 0.0–10.0 or null
      favourite  — boolean (default false)

    Returns the updated entry in the same shape as get_list().
    """
    body = request.get_json()
    game_data          = body.get("game")
    status             = body.get("status")
    user_rating        = body.get("userRating")
    favourite          = body.get("favourite", False)
    playtime_minutes   = body.get("playtimeMinutes")
    replay_count       = body.get("replayCount", 0)
    tags               = body.get("tags", [])
    platforms_played   = body.get("platformsPlayed", [])
    custom_images_only = body.get("customImagesOnly", False)
    img_pos_x          = body.get("imgPosX", 50)
    img_pos_y          = body.get("imgPosY", 50)
    img_scale          = body.get("imgScale", 1.0)

    today = datetime.now(timezone.utc).date().isoformat()

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Fetch existing activity log so we can append today without duplicates
            cur.execute("SELECT activity_log, playtime_minutes FROM entries WHERE game_id = %s", (game_id,))
            existing = cur.fetchone()

            if existing:
                log = existing["activity_log"] or []
                if today not in log:
                    log = log + [today]
                # Preserve existing playtime if not explicitly provided
                if playtime_minutes is None:
                    playtime_minutes = existing["playtime_minutes"]
            else:
                log = [today]

            cur.execute("""
                INSERT INTO entries (game_id, game_data, status, user_rating, favourite,
                                     playtime_minutes, replay_count, tags, activity_log,
                                     platforms_played, custom_images_only,
                                     img_pos_x, img_pos_y, img_scale, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, NOW())
                ON CONFLICT (game_id) DO UPDATE SET
                    game_data          = EXCLUDED.game_data,
                    status             = EXCLUDED.status,
                    user_rating        = EXCLUDED.user_rating,
                    favourite          = EXCLUDED.favourite,
                    playtime_minutes   = EXCLUDED.playtime_minutes,
                    replay_count       = EXCLUDED.replay_count,
                    tags               = EXCLUDED.tags,
                    activity_log       = EXCLUDED.activity_log,
                    platforms_played   = EXCLUDED.platforms_played,
                    custom_images_only = EXCLUDED.custom_images_only,
                    img_pos_x          = EXCLUDED.img_pos_x,
                    img_pos_y          = EXCLUDED.img_pos_y,
                    img_scale          = EXCLUDED.img_scale,
                    updated_at         = NOW()
                RETURNING *
            """, (game_id, json.dumps(game_data), status, user_rating, favourite,
                  playtime_minutes, replay_count, json.dumps(tags), json.dumps(log),
                  json.dumps(platforms_played), custom_images_only,
                  img_pos_x, img_pos_y, img_scale))
            row = cur.fetchone()
            # Also fetch extra image IDs for the returned entry
            cur.execute("SELECT json_agg(id ORDER BY seq) AS extra_image_ids FROM entry_images WHERE game_id = %s", (game_id,))
            img_row = cur.fetchone()
            row = dict(row)
            row["extra_image_ids"] = img_row["extra_image_ids"] or []
    return jsonify(row_to_entry(row))


@app.route("/api/list/<int:game_id>", methods=["DELETE"])
def delete_entry(game_id):
    """
    Remove a game from the user's list entirely.

    Does not delete the cover image separately — the cover_image column is
    part of the same row and is removed with it.
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM entries WHERE game_id = %s", (game_id,))
    return jsonify({"ok": True})


@app.route("/api/list/<int:game_id>/playtime", methods=["PATCH"])
def update_playtime(game_id):
    """Update only the playtime_minutes field for an existing entry."""
    body = request.get_json()
    playtime_minutes = body.get("playtimeMinutes")
    if playtime_minutes is None:
        return jsonify({"error": "playtimeMinutes required"}), 400
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                UPDATE entries SET playtime_minutes = %s, updated_at = NOW()
                WHERE game_id = %s RETURNING *
            """, (playtime_minutes, game_id))
            row = cur.fetchone()
    if not row:
        return jsonify({"error": "Entry not found"}), 404
    return jsonify(row_to_entry(row))


# ---------------------------------------------------------------------------
# Custom cover image routes
# ---------------------------------------------------------------------------

@app.route("/api/list/<int:game_id>/cover", methods=["POST"])
def upload_cover(game_id):
    """
    Upload a custom cover image for a game already in the user's list.

    Accepts a multipart/form-data POST with a 'cover' file field.
    Stores the raw bytes and MIME type in the entries row.
    Returns 404 if the game is not in the list (no row to UPDATE).

    The frontend uses this to let users replace RAWG's default artwork
    with their own preferred cover art.
    """
    if "cover" not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files["cover"]
    mime = f.mimetype or "image/jpeg"
    data = f.read()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE entries SET cover_image = %s, cover_mime = %s, updated_at = NOW()
                WHERE game_id = %s
            """, (psycopg2.Binary(data), mime, game_id))
            if cur.rowcount == 0:
                return jsonify({"error": "Entry not in list"}), 404
    return jsonify({"ok": True})


@app.route("/api/list/<int:game_id>/cover", methods=["GET"])
def get_cover(game_id):
    """
    Serve the custom cover image stored for a game.

    Returns the raw image bytes with the stored MIME type.
    Returns 404 if no custom cover has been uploaded.

    The frontend appends a cache-busting query param (?v=N) after uploads
    so the browser fetches the new image instead of showing the cached one.
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT cover_image, cover_mime FROM entries WHERE game_id = %s", (game_id,))
            row = cur.fetchone()
    if not row or not row[0]:
        return jsonify({"error": "No cover"}), 404
    return Response(bytes(row[0]), content_type=row[1] or "image/jpeg")


# ---------------------------------------------------------------------------
# Steam integration
# ---------------------------------------------------------------------------

def _fetch_steam_games(api_key, steam_id):
    """Resolve vanity URL if needed, then return the user's owned Steam games."""
    if not (steam_id.isdigit() and len(steam_id) == 17):
        r = requests.get(
            "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/",
            params={"key": api_key, "vanityurl": steam_id},
        )
        r.raise_for_status()
        result = r.json().get("response", {})
        if result.get("success") != 1:
            raise ValueError(f"Could not resolve Steam ID '{steam_id}'.")
        steam_id = result["steamid"]

    r = requests.get(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
        params={
            "key": api_key, "steamid": steam_id,
            "include_appinfo": "true",
            "include_played_free_games": "true",
            "format": "json",
        },
    )
    r.raise_for_status()
    games = r.json().get("response", {}).get("games", [])
    if not games:
        raise ValueError("No games found.")
    return games, steam_id


@app.route("/api/steam/library")
def steam_library():
    """
    Fetch the user's owned Steam games and cross-reference with the local list.

    Reads Steam credentials from the settings row, resolves a vanity URL to a
    SteamID64 if needed, then calls IPlayerService/GetOwnedGames.

    Each returned game includes a `gamilist_id` field: the entry's game_id if the
    game name already exists in the local list, otherwise null.

    Returns JSON:
      { "games": [...], "total": N }
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT steam_api_key, steam_id FROM settings WHERE id = 1")
            row = cur.fetchone()

    if not row or not row["steam_api_key"] or not row["steam_id"]:
        return jsonify({"error": "Steam credentials not configured"}), 400

    try:
        games, _ = _fetch_steam_games(row["steam_api_key"], row["steam_id"].strip())
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception:
        return jsonify({"error": "Failed to fetch Steam library."}), 400

    # Cross-reference with local list by game name (case-insensitive)
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT game_id, game_data->>'name' AS name FROM entries")
            local = {r["name"].lower(): r["game_id"] for r in cur.fetchall()}

    for g in games:
        g["gamilist_id"] = local.get(g["name"].lower())
        # playtime_forever is in minutes from Steam API
        g["steam_playtime_minutes"] = g.get("playtime_forever", 0)

    games.sort(key=lambda g: g["name"].lower())
    return jsonify({"games": games, "total": len(games)})


@app.route("/api/steam/sync-playtime-all", methods=["POST"])
def steam_sync_all_playtime():
    """
    Bulk-update playtime_minutes for all Steam-imported entries.

    Fetches the Steam library using stored credentials, then for every game
    with playtime > 0 whose appid matches a game_id in entries, updates only
    the playtime_minutes column (no other fields are touched).

    Returns: { "updated": N, "total": M }
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT steam_api_key, steam_id FROM settings WHERE id = 1")
            row = cur.fetchone()

    if not row or not row["steam_api_key"] or not row["steam_id"]:
        return jsonify({"error": "Steam credentials not configured"}), 400

    try:
        games, _ = _fetch_steam_games(row["steam_api_key"], row["steam_id"].strip())
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    updated = 0
    with get_db() as conn:
        with conn.cursor() as cur:
            for g in games:
                mins = g.get("playtime_forever", 0)
                if mins > 0:
                    cur.execute(
                        "UPDATE entries SET playtime_minutes = %s, updated_at = NOW() WHERE game_id = %s",
                        (mins, g["appid"]),
                    )
                    updated += cur.rowcount

    return jsonify({"updated": updated, "total": len(games)})


# ---------------------------------------------------------------------------
# Extra image routes
# ---------------------------------------------------------------------------

@app.route("/api/list/<int:game_id>/images", methods=["POST"])
def upload_extra_image(game_id):
    """Upload an extra image for a game entry (multi-image support)."""
    if "image" not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files["image"]
    mime = f.mimetype or "image/jpeg"
    data = f.read()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(seq) FROM entry_images WHERE game_id=%s", (game_id,))
            row = cur.fetchone()
            next_seq = (row[0] or -1) + 1
            cur.execute(
                "INSERT INTO entry_images (game_id, seq, image_data, image_mime) VALUES (%s,%s,%s,%s) RETURNING id",
                (game_id, next_seq, psycopg2.Binary(data), mime)
            )
            img_id = cur.fetchone()[0]
    return jsonify({"id": img_id})


@app.route("/api/images/<int:img_id>", methods=["GET"])
def get_extra_image(img_id):
    """Serve an extra image by its ID."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT image_data, image_mime FROM entry_images WHERE id=%s", (img_id,))
            row = cur.fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return Response(bytes(row[0]), content_type=row[1] or "image/jpeg")


@app.route("/api/images/<int:img_id>", methods=["DELETE"])
def delete_extra_image(img_id):
    """Delete an extra image by its ID."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM entry_images WHERE id=%s", (img_id,))
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Admin / maintenance routes
# ---------------------------------------------------------------------------

@app.route("/api/admin/resync-platforms", methods=["POST"])
def resync_platforms():
    """
    Fill entries that have no platform data.
    If rawg=true query param AND the game has a valid RAWG ID (slug doesn't start with 'steam-'),
    fetch updated platforms from RAWG. Otherwise, default to PC.
    """
    use_rawg = request.args.get("rawg", "false").lower() == "true"

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT game_id, game_data FROM entries")
            all_entries = cur.fetchall()

    updated = 0
    rawg_updated = 0

    with get_db() as conn:
        with conn.cursor() as cur:
            for entry in all_entries:
                gd = entry["game_data"] or {}
                platforms = gd.get("platforms") or []
                if platforms:
                    continue  # already has platform data

                game_id = entry["game_id"]
                slug = gd.get("slug") or ""
                is_steam = slug.startswith("steam-")

                new_platforms = None
                if use_rawg and not is_steam and RAWG_KEY:
                    try:
                        rawg_data = rawg_get(f"/games/{game_id}")
                        new_platforms = rawg_data.get("platforms") or []
                        if new_platforms:
                            rawg_updated += 1
                    except Exception:
                        new_platforms = None

                if not new_platforms:
                    new_platforms = [{"platform": {"id": 4, "slug": "pc", "name": "PC"}}]

                updated_gd = dict(gd)
                updated_gd["platforms"] = new_platforms
                cur.execute(
                    "UPDATE entries SET game_data = %s::jsonb, updated_at = NOW() WHERE game_id = %s",
                    (json.dumps(updated_gd), game_id)
                )
                updated += 1

    return jsonify({"updated": updated, "rawg_updated": rawg_updated})


@app.route("/api/admin/sync-rawg-images", methods=["POST"])
def sync_rawg_images():
    """
    For every Steam-imported entry (slug starts with 'steam-' or background_image
    is from steamstatic.com), search RAWG by the game name and replace the
    background_image with the RAWG result.

    Custom covers (cover_image IS NOT NULL) are never touched.
    Returns {"updated": N, "skipped": M}.
    """
    if not RAWG_KEY:
        return jsonify({"error": "RAWG_API_KEY not configured"}), 400

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Only fetch entries that have no custom cover and look like Steam imports
            cur.execute("""
                SELECT game_id, game_data
                FROM entries
                WHERE cover_image IS NULL
                  AND (
                    game_data->>'slug' LIKE 'steam-%%'
                    OR game_data->>'background_image' LIKE '%%steamstatic%%'
                    OR game_data->>'background_image' LIKE '%%steamcdn%%'
                  )
            """)
            candidates = cur.fetchall()

    updated = 0
    skipped = 0

    with get_db() as conn:
        with conn.cursor() as cur:
            for entry in candidates:
                gd = entry["game_data"] or {}
                name = gd.get("name", "")
                if not name:
                    skipped += 1
                    continue
                try:
                    results = rawg_get("/games", params={"search": name, "page_size": 1})
                    games = results.get("results") or []
                    if not games:
                        skipped += 1
                        continue
                    rawg_img = games[0].get("background_image")
                    if not rawg_img:
                        skipped += 1
                        continue
                    updated_gd = dict(gd)
                    updated_gd["background_image"] = rawg_img
                    cur.execute(
                        "UPDATE entries SET game_data = %s::jsonb, updated_at = NOW() WHERE game_id = %s",
                        (json.dumps(updated_gd), entry["game_id"])
                    )
                    updated += 1
                except Exception:
                    skipped += 1

    return jsonify({"updated": updated, "skipped": skipped})


if __name__ == "__main__":
    # debug=True enables hot reload during local development.
    # In production (Kubernetes), the container is restarted instead.
    app.run(host="0.0.0.0", port=5001, debug=True)
