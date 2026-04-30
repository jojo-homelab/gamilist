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
import zlib
import unicodedata
from difflib import SequenceMatcher
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
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS psn_npsso              TEXT    NOT NULL DEFAULT ''")
            # Text-size, layout, and UI settings added later
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_gallery_nav    BOOLEAN NOT NULL DEFAULT TRUE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav_card_custom     BOOLEAN NOT NULL DEFAULT FALSE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav_card_w_mult     REAL    NOT NULL DEFAULT 1.5")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav_card_h_mult     REAL    NOT NULL DEFAULT 1.5")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav_card_count      INTEGER NOT NULL DEFAULT 0")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav_alt_card_mode   BOOLEAN NOT NULL DEFAULT FALSE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS modal_width_mult    REAL    NOT NULL DEFAULT 1.0")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS list_stats_size     INTEGER NOT NULL DEFAULT 11")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav_stats_size      INTEGER NOT NULL DEFAULT 11")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS list_name_offset    INTEGER NOT NULL DEFAULT 0")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS fav_name_offset     INTEGER NOT NULL DEFAULT 0")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_fit_title      BOOLEAN NOT NULL DEFAULT FALSE")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS rating_colors       JSONB   NOT NULL DEFAULT '{}'")
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
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS custom_name TEXT")
            cur.execute("ALTER TABLE entries ADD COLUMN IF NOT EXISTS img_fit TEXT NOT NULL DEFAULT 'cover'")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS rawg_calls_month TEXT    NOT NULL DEFAULT ''")
            cur.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS rawg_calls_count INTEGER NOT NULL DEFAULT 0")


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
        "imgFit":           row.get("img_fit") or "cover",
        "customName":       row.get("custom_name") or None,
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
            "psnNpsso":                row.get("psn_npsso") or "",
            "showGalleryNav":          row.get("show_gallery_nav") if row.get("show_gallery_nav") is not None else True,
            "favCardCustom":           row.get("fav_card_custom") or False,
            "favCardWMult":            row.get("fav_card_w_mult") if row.get("fav_card_w_mult") is not None else 1.5,
            "favCardHMult":            row.get("fav_card_h_mult") if row.get("fav_card_h_mult") is not None else 1.5,
            "favCardCount":            row.get("fav_card_count") if row.get("fav_card_count") is not None else 0,
            "favAltCardMode":          row.get("fav_alt_card_mode") or False,
            "modalWidthMult":          row.get("modal_width_mult") if row.get("modal_width_mult") is not None else 1.0,
            "listStatsSize":           row.get("list_stats_size") if row.get("list_stats_size") is not None else 11,
            "favStatsSize":            row.get("fav_stats_size") if row.get("fav_stats_size") is not None else 11,
            "listNameOffset":          row.get("list_name_offset") if row.get("list_name_offset") is not None else 0,
            "favNameOffset":           row.get("fav_name_offset") if row.get("fav_name_offset") is not None else 0,
            "autoFitTitle":            row.get("auto_fit_title") or False,
            "ratingColors":            row.get("rating_colors") or {},
            "rawgCallsMonth":          row.get("rawg_calls_month") or "",
            "rawgCallsCount":          row.get("rawg_calls_count") or 0,
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
        "psnNpsso": "",
        "showGalleryNav": True, "favCardCustom": False, "favCardWMult": 1.5, "favCardHMult": 1.5,
        "favCardCount": 0, "favAltCardMode": False, "modalWidthMult": 1.0,
        "listStatsSize": 11, "favStatsSize": 11, "listNameOffset": 0, "favNameOffset": 0,
        "autoFitTitle": False, "ratingColors": {}, "rawgCallsMonth": "", "rawgCallsCount": 0,
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
    psn_npsso                = body.get("psnNpsso")
    show_gallery_nav         = body.get("showGalleryNav")
    fav_card_custom          = body.get("favCardCustom")
    fav_card_w_mult          = body.get("favCardWMult")
    fav_card_h_mult          = body.get("favCardHMult")
    fav_card_count           = body.get("favCardCount")
    fav_alt_card_mode        = body.get("favAltCardMode")
    modal_width_mult         = body.get("modalWidthMult")
    list_stats_size          = body.get("listStatsSize")
    fav_stats_size           = body.get("favStatsSize")
    list_name_offset         = body.get("listNameOffset")
    fav_name_offset          = body.get("favNameOffset")
    auto_fit_title           = body.get("autoFitTitle")
    rating_colors            = body.get("ratingColors")
    steam_mappings_json      = json.dumps(steam_mappings)      if steam_mappings is not None else None
    platform_colors_json     = json.dumps(platform_colors)     if platform_colors is not None else None
    status_colors_json       = json.dumps(status_colors)       if status_colors is not None else None
    activity_colors_json     = json.dumps(activity_colors)     if activity_colors is not None else None
    rating_colors_json       = json.dumps(rating_colors)       if rating_colors is not None else None

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO settings (
                    id, card_w_mult, card_h_mult, upload_btn_mult, card_count, upload_btn_text,
                    glow1_enabled, glow1_color, glow2_enabled, glow2_color, glow3_enabled, glow3_color,
                    steam_api_key, steam_id, steam_mappings, platform_highlight_color,
                    platform_colors, platform_icon_mode, status_colors, activity_colors,
                    card_h2_mult, alt_card_mode, fav1_mult, fav2_mult, fav3_mult, psn_npsso,
                    show_gallery_nav, fav_card_custom, fav_card_w_mult, fav_card_h_mult,
                    fav_card_count, fav_alt_card_mode, modal_width_mult,
                    list_stats_size, fav_stats_size, list_name_offset, fav_name_offset,
                    auto_fit_title, rating_colors
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
                    COALESCE(%s, 2.0), COALESCE(%s, 2.0), COALESCE(%s, 2.0),
                    COALESCE(%s, ''),
                    COALESCE(%s, TRUE), COALESCE(%s, FALSE),
                    COALESCE(%s, 1.5),  COALESCE(%s, 1.5),
                    COALESCE(%s, 0),    COALESCE(%s, FALSE),
                    COALESCE(%s, 1.0),
                    COALESCE(%s, 11),   COALESCE(%s, 11),
                    COALESCE(%s, 0),    COALESCE(%s, 0),
                    COALESCE(%s, FALSE),
                    COALESCE(%s::jsonb, '{}'::jsonb))
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
                    steam_api_key            = COALESCE(NULLIF(EXCLUDED.steam_api_key, ''), settings.steam_api_key),
                    steam_id                 = COALESCE(NULLIF(EXCLUDED.steam_id, ''),     settings.steam_id),
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
                    fav3_mult                = COALESCE(EXCLUDED.fav3_mult,                settings.fav3_mult),
                    psn_npsso                = COALESCE(NULLIF(EXCLUDED.psn_npsso, ''),    settings.psn_npsso),
                    show_gallery_nav         = COALESCE(EXCLUDED.show_gallery_nav,         settings.show_gallery_nav),
                    fav_card_custom          = COALESCE(EXCLUDED.fav_card_custom,          settings.fav_card_custom),
                    fav_card_w_mult          = COALESCE(EXCLUDED.fav_card_w_mult,          settings.fav_card_w_mult),
                    fav_card_h_mult          = COALESCE(EXCLUDED.fav_card_h_mult,          settings.fav_card_h_mult),
                    fav_card_count           = COALESCE(EXCLUDED.fav_card_count,           settings.fav_card_count),
                    fav_alt_card_mode        = COALESCE(EXCLUDED.fav_alt_card_mode,        settings.fav_alt_card_mode),
                    modal_width_mult         = COALESCE(EXCLUDED.modal_width_mult,         settings.modal_width_mult),
                    list_stats_size          = COALESCE(EXCLUDED.list_stats_size,          settings.list_stats_size),
                    fav_stats_size           = COALESCE(EXCLUDED.fav_stats_size,           settings.fav_stats_size),
                    list_name_offset         = COALESCE(EXCLUDED.list_name_offset,         settings.list_name_offset),
                    fav_name_offset          = COALESCE(EXCLUDED.fav_name_offset,          settings.fav_name_offset),
                    auto_fit_title           = COALESCE(EXCLUDED.auto_fit_title,           settings.auto_fit_title),
                    rating_colors            = COALESCE(EXCLUDED.rating_colors,            settings.rating_colors)
                RETURNING *
            """, (card_w_mult, card_h_mult, upload_btn_mult, card_count, upload_btn_text,
                  glow1_enabled, glow1_color, glow2_enabled, glow2_color, glow3_enabled, glow3_color,
                  steam_api_key, steam_id, steam_mappings_json, platform_highlight_color,
                  platform_colors_json, platform_icon_mode, status_colors_json, activity_colors_json,
                  card_h2_mult, alt_card_mode, fav1_mult, fav2_mult, fav3_mult, psn_npsso,
                  show_gallery_nav, fav_card_custom, fav_card_w_mult, fav_card_h_mult,
                  fav_card_count, fav_alt_card_mode, modal_width_mult,
                  list_stats_size, fav_stats_size, list_name_offset, fav_name_offset,
                  auto_fit_title, rating_colors_json))
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
        "psnNpsso":               row.get("psn_npsso") or "",
        "showGalleryNav":         row.get("show_gallery_nav") if row.get("show_gallery_nav") is not None else True,
        "favCardCustom":          row.get("fav_card_custom") or False,
        "favCardWMult":           row.get("fav_card_w_mult") if row.get("fav_card_w_mult") is not None else 1.5,
        "favCardHMult":           row.get("fav_card_h_mult") if row.get("fav_card_h_mult") is not None else 1.5,
        "favCardCount":           row.get("fav_card_count") if row.get("fav_card_count") is not None else 0,
        "favAltCardMode":         row.get("fav_alt_card_mode") or False,
        "modalWidthMult":         row.get("modal_width_mult") if row.get("modal_width_mult") is not None else 1.0,
        "listStatsSize":          row.get("list_stats_size") if row.get("list_stats_size") is not None else 11,
        "favStatsSize":           row.get("fav_stats_size") if row.get("fav_stats_size") is not None else 11,
        "listNameOffset":         row.get("list_name_offset") if row.get("list_name_offset") is not None else 0,
        "favNameOffset":          row.get("fav_name_offset") if row.get("fav_name_offset") is not None else 0,
        "autoFitTitle":           row.get("auto_fit_title") or False,
        "ratingColors":           row.get("rating_colors") or {},
        "rawgCallsMonth":         row.get("rawg_calls_month") or "",
        "rawgCallsCount":         row.get("rawg_calls_count") or 0,
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

class RawgRateLimited(Exception):
    """Raised when RAWG returns 401 (API key invalid or monthly quota exhausted)."""
    pass


@app.errorhandler(RawgRateLimited)
def handle_rawg_rate_limited(e):
    return jsonify({"error": "RAWG API limit reached (401). Your monthly quota may be exhausted — check your usage in Settings."}), 429


def _increment_rawg_counter():
    """Atomically increment the monthly RAWG call counter, resetting when the month rolls over."""
    from datetime import datetime as _dt
    current_month = _dt.utcnow().strftime("%Y-%m")
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO settings (id, rawg_calls_month, rawg_calls_count)
                    VALUES (1, %s, 1)
                    ON CONFLICT (id) DO UPDATE SET
                        rawg_calls_count = CASE
                            WHEN settings.rawg_calls_month = %s THEN settings.rawg_calls_count + 1
                            ELSE 1
                        END,
                        rawg_calls_month = %s
                """, (current_month, current_month, current_month))
    except Exception:
        pass  # Never let counter failure break an API response


def rawg_get(path, params=None):
    """
    Make a GET request to the RAWG API and return the parsed JSON response.

    Automatically injects the API key into every request.
    Raises RawgRateLimited on 401 (quota exceeded / bad key).
    Raises an HTTPError on other non-2xx statuses.

    Args:
      path   — API path, e.g. "/games"
      params — Optional dict of query parameters (merged with the API key)
    """
    p = params or {}
    p["key"] = RAWG_KEY
    r = requests.get(f"{RAWG_BASE}{path}", params=p)
    if r.status_code == 401:
        raise RawgRateLimited("RAWG 401 Unauthorized")
    r.raise_for_status()
    _increment_rawg_counter()
    return r.json()


# ---------------------------------------------------------------------------
# RAWG proxy routes
# ---------------------------------------------------------------------------

@app.route("/api/games/search")
def search():
    """
    Search RAWG for games. Supports pagination and platform filtering.

    Query params:
      q         — search term (optional; omit to browse)
      page      — page number (default: 1)
      page_size — results per page (default: 50)
      platforms — RAWG platform ID (optional)

    Returns {"results": [...], "count": N}.
    """
    q           = request.args.get("q", "").strip()
    page        = int(request.args.get("page", 1))
    page_size   = int(request.args.get("page_size", 50))
    platform_id = request.args.get("platforms", "")

    params = {"page_size": page_size, "page": page}
    if q:
        params["search"] = q
    if platform_id:
        params["platforms"] = platform_id
    if not q:
        params["ordering"] = "-added"

    data = rawg_get("/games", params)
    return jsonify({"results": data.get("results", []), "count": data.get("count", 0)})


@app.route("/api/games/trending")
def trending():
    """Return 50 new and trending games (most recently added to RAWG, filtered to recent releases)."""
    data = rawg_get("/games", {"ordering": "-added", "page_size": 50})
    return jsonify({"results": data.get("results", []), "count": data.get("count", 0)})


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
    allowed = ("rawg.io", "steamstatic.com", "steamcdn-a.akamaihd.net", "image.api.playstation.com")
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
    img_fit            = body.get("imgFit", "cover")
    custom_name        = body.get("customName") or None

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
                                     img_pos_x, img_pos_y, img_scale, img_fit, custom_name, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, NOW())
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
                    img_fit            = EXCLUDED.img_fit,
                    custom_name        = EXCLUDED.custom_name,
                    updated_at         = NOW()
                RETURNING *
            """, (game_id, json.dumps(game_data), status, user_rating, favourite,
                  playtime_minutes, replay_count, json.dumps(tags), json.dumps(log),
                  json.dumps(platforms_played), custom_images_only,
                  img_pos_x, img_pos_y, img_scale, img_fit, custom_name))
            row = cur.fetchone()
            # When set to Dropped, clear RAWG screenshot data from game_data.
            # entry_images (custom uploads) are intentionally preserved.
            if status == 6 and isinstance(game_data, dict) and "short_screenshots" in game_data:
                game_data.pop("short_screenshots", None)
                cur.execute("UPDATE entries SET game_data = %s WHERE game_id = %s",
                            (json.dumps(game_data), game_id))
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
        name_lower = g["name"].lower()
        # Exact match first, then fuzzy fallback at 75%
        g["gamilist_id"] = local.get(name_lower) or _fuzzy_find(name_lower, local)
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
# PSN integration
# ---------------------------------------------------------------------------

def _psn_game_id(title_id: str) -> int:
    """Deterministic integer game_id for a PSN title (fits in PostgreSQL INTEGER)."""
    return (zlib.crc32(title_id.encode()) & 0x1FFFFFFF) + 1_600_000_000


def _get_psn_client():
    """Return a PSNAWP client using the stored NPSSO token, or raise ValueError."""
    try:
        from psnawp_api import PSNAWP
    except ImportError:
        raise ValueError("psnawp_api package is not installed.")
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT psn_npsso FROM settings WHERE id = 1")
            row = cur.fetchone()
    if not row or not row["psn_npsso"]:
        raise ValueError("PSN NPSSO token not configured.")
    return PSNAWP(row["psn_npsso"])


@app.route("/api/psn/library")
def psn_library():
    """
    Fetch the user's PSN game library and cross-reference with the local list.

    Returns JSON:
      { "games": [...], "total": N }

    Each game includes:
      title_id, name, image_url, platform, play_duration_minutes, gamilist_id
    """
    try:
        psnawp = _get_psn_client()
        client = psnawp.me()
        raw_titles = list(client.title_stats())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to fetch PSN library: {e}"}), 400

    # Cross-reference with local list by game name (case-insensitive)
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT game_id, game_data->>'name' AS name FROM entries")
            local_by_name = {r["name"].lower(): r["game_id"] for r in cur.fetchall()}
            cur.execute("SELECT game_id FROM entries")
            local_ids = {r["game_id"] for r in cur.fetchall()}

    games = []
    for t in raw_titles:
        title_id = str(t.title_id) if hasattr(t, "title_id") else None
        if not title_id:
            continue
        name = t.name or ""
        image_url = str(t.image_url) if t.image_url else None
        platform = str(t.category.value) if hasattr(t.category, "value") else str(t.category or "")
        # play_duration is a timedelta for PS5; None for PS4
        play_duration = getattr(t, "play_duration", None)
        play_minutes = int(play_duration.total_seconds() // 60) if play_duration else 0

        gid = _psn_game_id(title_id)
        # Check by generated ID first, then exact name, then fuzzy name at 75%
        if gid in local_ids:
            gamilist_id = gid
        else:
            gamilist_id = local_by_name.get(name.lower()) or _fuzzy_find(name, local_by_name)

        games.append({
            "title_id":             title_id,
            "game_id":              gid,
            "name":                 name,
            "image_url":            image_url,
            "platform":             platform,
            "play_duration_minutes": play_minutes,
            "gamilist_id":          gamilist_id,
        })

    games.sort(key=lambda g: g["name"].lower())
    return jsonify({"games": games, "total": len(games)})


@app.route("/api/psn/sync-playtime-all", methods=["POST"])
def psn_sync_all_playtime():
    """
    Bulk-update playtime_minutes for all PSN-imported entries that have PS5 playtime.
    Returns: { "updated": N, "total": M }
    """
    try:
        psnawp = _get_psn_client()
        client = psnawp.me()
        raw_titles = list(client.title_stats())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to fetch PSN library: {e}"}), 400

    updated = 0
    with get_db() as conn:
        with conn.cursor() as cur:
            for t in raw_titles:
                title_id = str(t.title_id) if hasattr(t, "title_id") else None
                if not title_id:
                    continue
                play_duration = getattr(t, "play_duration", None)
                if not play_duration:
                    continue
                mins = int(play_duration.total_seconds() // 60)
                if mins > 0:
                    gid = _psn_game_id(title_id)
                    cur.execute(
                        "UPDATE entries SET playtime_minutes = %s, updated_at = NOW() WHERE game_id = %s",
                        (mins, gid),
                    )
                    updated += cur.rowcount

    return jsonify({"updated": updated, "total": len(raw_titles)})


@app.route("/api/psn/sync-platforms", methods=["POST"])
def psn_sync_platforms():
    """
    Fix the platform for all PSN-imported entries by reading the title_id prefix
    stored in each entry's slug (psn-{title_id}). No PSN API call needed.

    Title ID prefixes:
      PPSA → PlayStation 5
      CUSA → PlayStation 4
      BCAS/BCES/BCJS/BCUS/NPAS/NPES/NPJS/NPUS → PlayStation 3
      PCSB/PCSA/PCSC → PS Vita
      UCAS/UCES/UCJS/UCUS → PSP

    Returns: { "updated": N, "total": M }
    """
    def platform_from_title_id(title_id: str):
        prefix = title_id[:4].upper()
        if prefix == "PPSA":
            return {"slug": "playstation5", "name": "PlayStation 5"}
        if prefix == "CUSA":
            return {"slug": "playstation4", "name": "PlayStation 4"}
        if prefix in ("BCAS", "BCES", "BCJS", "BCUS", "NPAS", "NPES", "NPJS", "NPUS"):
            return {"slug": "playstation3", "name": "PlayStation 3"}
        if prefix in ("PCSB", "PCSA", "PCSC"):
            return {"slug": "ps-vita", "name": "PS Vita"}
        if prefix in ("UCAS", "UCES", "UCJS", "UCUS"):
            return {"slug": "psp", "name": "PSP"}
        return {"slug": "playstation", "name": "PlayStation"}

    updated = 0
    total = 0
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT game_id, game_data FROM entries WHERE game_data->>'slug' LIKE 'psn-%'")
            rows = cur.fetchall()
            total = len(rows)
            for row in rows:
                game_data = row["game_data"] if isinstance(row["game_data"], dict) else json.loads(row["game_data"])
                slug = game_data.get("slug", "")
                title_id = slug[4:] if slug.startswith("psn-") else ""
                if not title_id:
                    continue
                plat = platform_from_title_id(title_id)
                game_data["platforms"] = [{"platform": {"slug": plat["slug"], "name": plat["name"]}}]
                cur.execute(
                    "UPDATE entries SET game_data = %s::jsonb, updated_at = NOW() WHERE game_id = %s",
                    (json.dumps(game_data), row["game_id"]),
                )
                updated += cur.rowcount

    return jsonify({"updated": updated, "total": total})



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


@app.route("/api/list/<int:game_id>/images/reorder", methods=["PUT"])
def reorder_images(game_id):
    """
    Update the display order of extra images for an entry.
    Body: {"ids": [id1, id2, ...]} in the desired display order.
    Sets seq = position index for each id.
    """
    ids = request.get_json().get("ids", [])
    with get_db() as conn:
        with conn.cursor() as cur:
            for seq, img_id in enumerate(ids):
                cur.execute(
                    "UPDATE entry_images SET seq = %s WHERE id = %s AND game_id = %s",
                    (seq, img_id, game_id)
                )
    return jsonify({"ok": True})


@app.route("/api/list/<int:game_id>/images/<int:image_id>/promote-to-cover", methods=["POST"])
def promote_image_to_cover(game_id, image_id):
    """
    Atomically swap an extra image into the cover slot.

    1. The promoted extra image becomes the new cover_image.
    2. The existing cover (if any) is inserted as a new extra image at position 0.
    3. The promoted extra image row is deleted.
    4. Remaining extra images are re-sequenced: old cover first, then the rest in
       their original order.

    Returns { "ok": True, "extraImageIds": [...], "hasCover": True }.
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Fetch the extra image being promoted
            cur.execute(
                "SELECT image_data, image_mime FROM entry_images WHERE id = %s AND game_id = %s",
                (image_id, game_id),
            )
            img_row = cur.fetchone()
            if not img_row:
                return jsonify({"error": "Image not found"}), 404

            # Fetch the current cover (may be NULL)
            cur.execute("SELECT cover_image, cover_mime FROM entries WHERE game_id = %s", (game_id,))
            entry_row = cur.fetchone()
            if not entry_row:
                return jsonify({"error": "Entry not found"}), 404

            # Get remaining extra image IDs in their current order (excluding promoted)
            cur.execute(
                "SELECT id FROM entry_images WHERE game_id = %s AND id != %s ORDER BY seq",
                (game_id, image_id),
            )
            remaining_ids = [r["id"] for r in cur.fetchall()]

            # If a cover blob exists, insert it as a new extra image at the front
            old_cover_id = None
            if entry_row["cover_image"] is not None:
                cur.execute(
                    "INSERT INTO entry_images (game_id, seq, image_data, image_mime) "
                    "VALUES (%s, -1, %s, %s) RETURNING id",
                    (game_id,
                     psycopg2.Binary(bytes(entry_row["cover_image"])),
                     entry_row["cover_mime"] or "image/jpeg"),
                )
                old_cover_id = cur.fetchone()["id"]

            # Set the extra image as the new cover
            cur.execute(
                "UPDATE entries SET cover_image = %s, cover_mime = %s WHERE game_id = %s",
                (psycopg2.Binary(bytes(img_row["image_data"])),
                 img_row["image_mime"],
                 game_id),
            )

            # Remove the promoted extra image row
            cur.execute("DELETE FROM entry_images WHERE id = %s", (image_id,))

            # Re-sequence: old cover at 0, then remaining in original order
            final_ids = ([old_cover_id] if old_cover_id else []) + remaining_ids
            for seq, iid in enumerate(final_ids):
                cur.execute("UPDATE entry_images SET seq = %s WHERE id = %s", (seq, iid))

    return jsonify({"ok": True, "extraImageIds": final_ids, "hasCover": True})


def _resolve_steam_image_url(steam_appid):
    """
    Try Steam CDN URL patterns in order and return the first that responds with 200.
    Returns None if none of the candidates work.
    """
    candidates = [
        f"https://cdn.akamai.steamstatic.com/steam/apps/{steam_appid}/header.jpg",
        f"https://cdn.akamai.steamstatic.com/steam/apps/{steam_appid}/library_600x900.jpg",
        f"https://cdn.akamai.steamstatic.com/steam/apps/{steam_appid}/library_hero.jpg",
        f"https://cdn.akamai.steamstatic.com/steam/apps/{steam_appid}/capsule_616x353.jpg",
    ]
    for url in candidates:
        try:
            r = requests.head(url, timeout=5, allow_redirects=True)
            if r.status_code == 200:
                return url
        except Exception:
            continue
    return None


def _get_steam_appid_for_rawg_game(rawg_id):
    """
    Use RAWG's stores endpoint to find the Steam appid for a game by its RAWG ID.
    Returns the appid (int) or None if not found or RAWG key missing.
    """
    if not RAWG_KEY:
        return None
    try:
        r = requests.get(
            f"https://api.rawg.io/api/games/{rawg_id}/stores",
            params={"key": RAWG_KEY},
            timeout=8,
        )
        if r.status_code != 200:
            return None
        for entry in r.json().get("results", []):
            # store_id 1 = Steam
            if entry.get("store_id") == 1:
                url = entry.get("url", "")
                import re
                m = re.search(r"/app/(\d+)", url)
                if m:
                    return int(m.group(1))
    except Exception:
        pass
    return None


def _find_rawg_id_by_name(name):
    """
    Search RAWG by name and return the best-matching game's RAWG ID, or None.
    Uses exact search first, falls back to fuzzy.
    """
    if not RAWG_KEY or not name:
        return None
    try:
        results = rawg_get("/games", params={"search": name, "search_exact": True, "page_size": 5})
        best = _best_rawg_match(name, results.get("results") or [])
        if not best:
            results = rawg_get("/games", params={"search": name, "page_size": 10})
            best = _best_rawg_match(name, results.get("results") or [])
        return best["id"] if best else None
    except Exception:
        return None


@app.route("/api/list/<int:game_id>/sync-steam-image", methods=["POST"])
def sync_steam_image(game_id):
    """
    Set game_data.background_image to the best available Steam CDN image.
    For Steam-imported entries (slug starts with 'steam-') the game_id IS the appid.
    For PSN/RAWG entries the RAWG stores API is used to look up the real Steam appid.
    Custom cover_image is never touched.
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT game_data FROM entries WHERE game_id = %s", (game_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404
            gd = dict(row["game_data"])

    slug = gd.get("slug", "")
    if slug.startswith("steam-"):
        # game_id IS the Steam appid
        steam_appid = game_id
    elif slug.startswith("psn-"):
        # PSN game: game_id is a CRC-based internal ID, not a RAWG ID.
        # Find the real RAWG ID by searching by name, then use stores.
        rawg_id = _find_rawg_id_by_name(gd.get("name", ""))
        if not rawg_id:
            return jsonify({"error": "Could not find this game on RAWG to locate Steam store link"}), 404
        steam_appid = _get_steam_appid_for_rawg_game(rawg_id)
        if not steam_appid:
            return jsonify({"error": "No Steam store link found for this game"}), 404
    else:
        # Direct RAWG game — game_id is the RAWG ID
        steam_appid = _get_steam_appid_for_rawg_game(game_id)
        if not steam_appid:
            return jsonify({"error": "No Steam store link found for this game"}), 404

    steam_url = _resolve_steam_image_url(steam_appid)
    if not steam_url:
        return jsonify({"error": "No Steam image found for this game"}), 404

    gd["background_image"] = steam_url
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE entries SET game_data = %s::jsonb, updated_at = NOW() WHERE game_id = %s",
                (json.dumps(gd), game_id)
            )
    return jsonify({"background_image": steam_url})


@app.route("/api/list/<int:game_id>/sync-rawg-image", methods=["POST"])
def sync_rawg_image_single(game_id):
    """
    Sync cover + screenshots from RAWG for a single entry.
    Same matching logic as the bulk sync: search by name, require >= 90% similarity.
    Clears and replaces entry_images (unless custom_images_only is set).
    Returns {"background_image": url, "screenshots_added": N} or error.
    """
    if not RAWG_KEY:
        return jsonify({"error": "RAWG_API_KEY not configured"}), 400

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT game_data, custom_images_only FROM entries WHERE game_id = %s", (game_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404

    gd = dict(row["game_data"])
    name = gd.get("name", "")
    slug = gd.get("slug", "")
    if not name:
        return jsonify({"error": "Entry has no name"}), 400

    # Find the RAWG game to use for this entry.
    # For direct RAWG imports (slug is neither steam- nor psn-), game_id IS the RAWG ID — use it
    # directly to skip the search round-trip and guarantee an exact match.
    best = None
    if not slug.startswith("steam-") and not slug.startswith("psn-"):
        try:
            data = rawg_get(f"/games/{game_id}", params={})
            if data.get("id") and data.get("background_image"):
                best = data
        except Exception:
            pass

    if not best:
        results = rawg_get("/games", params={"search": name, "search_exact": True, "page_size": 5})
        best = _best_rawg_match(name, results.get("results") or [])
    if not best:
        results = rawg_get("/games", params={"search": name, "page_size": 10})
        best = _best_rawg_match(name, results.get("results") or [])
    if not best:
        return jsonify({"error": f"No RAWG match found for '{name}'"}), 404

    rawg_id = best["id"]
    new_bg = best["background_image"]
    new_mc = best.get("metacritic")

    screenshots_added = 0
    with get_db() as conn:
        with conn.cursor() as cur:
            # Update background_image and metacritic
            gd["background_image"] = new_bg
            if new_mc is not None:
                gd["metacritic"] = new_mc
            cur.execute(
                "UPDATE entries SET game_data = %s::jsonb, updated_at = NOW() WHERE game_id = %s",
                (json.dumps(gd), game_id)
            )
            # Sync screenshots unless custom_images_only
            if not (row.get("custom_images_only") or False):
                try:
                    shots = rawg_get(f"/games/{rawg_id}/screenshots", {"page_size": 20})
                    shot_urls = [s["image"] for s in (shots.get("results") or []) if s.get("image")]
                    if shot_urls:
                        cur.execute("DELETE FROM entry_images WHERE game_id = %s", (game_id,))
                        for seq, url in enumerate(shot_urls):
                            try:
                                img_resp = requests.get(url, timeout=15)
                                img_resp.raise_for_status()
                                mime = img_resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
                                cur.execute(
                                    "INSERT INTO entry_images (game_id, seq, image_data, image_mime) VALUES (%s, %s, %s, %s)",
                                    (game_id, seq, psycopg2.Binary(img_resp.content), mime)
                                )
                                screenshots_added += 1
                            except Exception:
                                pass
                except Exception:
                    pass

            # Return new extra image IDs
            cur.execute("SELECT id FROM entry_images WHERE game_id = %s ORDER BY seq", (game_id,))
            new_ids = [r[0] for r in cur.fetchall()]

    return jsonify({"background_image": new_bg, "screenshots_added": screenshots_added, "extraImageIds": new_ids, "metacritic": new_mc})


@app.route("/api/list/<int:game_id>/sync-psn-image", methods=["POST"])
def sync_psn_image(game_id):
    """
    Fetch PSN cover art for a game. Works for any entry — PSN games by title_id,
    others by searching the PSN library by game name.
    Updates game_data.background_image. Custom cover_image is never touched.
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT game_data FROM entries WHERE game_id = %s", (game_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404

    gd = dict(row["game_data"])
    slug = gd.get("slug", "")
    name = gd.get("name", "")

    # Extract title_id from slug for PSN games; other games will match by name.
    target_title_id = slug[4:] if slug.startswith("psn-") else None

    try:
        psnawp = _get_psn_client()
        client = psnawp.me()
        image_url = None

        for t in client.title_stats():
            tid = str(t.title_id or "")
            t_name = str(t.name or "")
            t_img = str(t.image_url) if t.image_url else None

            if not t_img:
                continue

            if target_title_id:
                # PSN game: match by title_id exactly
                if tid == target_title_id:
                    image_url = t_img
                    break
            else:
                # Non-PSN game: match by name similarity
                if name and _name_similarity(name.lower(), t_name.lower()) >= 0.85:
                    image_url = t_img
                    break

    except Exception as e:
        return jsonify({"error": f"PSN sync failed: {str(e)}"}), 500

    if not image_url:
        return jsonify({"error": "PSN image not found for this title"}), 404

    # Download the image bytes so we can store them as cover_image.
    # This ensures the card shows the PSN art regardless of whether a custom
    # cover was already set (background_image is invisible when cover_image exists).
    try:
        img_resp = requests.get(image_url, timeout=15)
        img_resp.raise_for_status()
        img_data = img_resp.content
        img_mime = img_resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
    except Exception as e:
        return jsonify({"error": f"Failed to download PSN image: {str(e)}"}), 500

    gd["background_image"] = image_url
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE entries
                   SET game_data = %s::jsonb,
                       cover_image = %s,
                       cover_mime  = %s,
                       updated_at  = NOW()
                   WHERE game_id = %s""",
                (json.dumps(gd), psycopg2.Binary(img_data), img_mime, game_id)
            )
    return jsonify({"background_image": image_url, "hasCover": True})


@app.route("/api/list/<int:game_id>/sync-both-images", methods=["POST"])
def sync_both_images(game_id):
    """
    Sync images from both Steam and RAWG for a single entry.
    - Cover (background_image): Steam URL (header → fallback chain)
    - Screenshots (entry_images): RAWG screenshots
    Both sources are combined; neither overwrites the other's contribution.
    """
    if not RAWG_KEY:
        return jsonify({"error": "RAWG_API_KEY not configured"}), 400

    # --- Steam cover ---
    steam_url = _resolve_steam_image_url(game_id)

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT game_data, custom_images_only FROM entries WHERE game_id = %s", (game_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404

    gd = dict(row["game_data"])
    name = gd.get("name", "")
    if not name:
        return jsonify({"error": "Entry has no name"}), 400

    # --- RAWG match (for screenshots only) ---
    best = None
    results = rawg_get("/games", params={"search": name, "search_exact": True, "page_size": 5})
    best = _best_rawg_match(name, results.get("results") or [])
    if not best:
        results = rawg_get("/games", params={"search": name, "page_size": 10})
        best = _best_rawg_match(name, results.get("results") or [])

    # Decide background_image: Steam wins if available, else fall back to RAWG cover
    new_bg = steam_url or (best["background_image"] if best else gd.get("background_image"))

    screenshots_added = 0
    with get_db() as conn:
        with conn.cursor() as cur:
            # Update cover
            gd["background_image"] = new_bg
            cur.execute(
                "UPDATE entries SET game_data = %s::jsonb, updated_at = NOW() WHERE game_id = %s",
                (json.dumps(gd), game_id)
            )
            # Sync RAWG screenshots unless custom_images_only
            if best and not (row.get("custom_images_only") or False):
                rawg_id = best["id"]
                try:
                    shots = rawg_get(f"/games/{rawg_id}/screenshots", {"page_size": 20})
                    shot_urls = [s["image"] for s in (shots.get("results") or []) if s.get("image")]
                    if shot_urls:
                        cur.execute("DELETE FROM entry_images WHERE game_id = %s", (game_id,))
                        for seq, url in enumerate(shot_urls):
                            try:
                                img_resp = requests.get(url, timeout=15)
                                img_resp.raise_for_status()
                                mime = img_resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
                                cur.execute(
                                    "INSERT INTO entry_images (game_id, seq, image_data, image_mime) VALUES (%s, %s, %s, %s)",
                                    (game_id, seq, psycopg2.Binary(img_resp.content), mime)
                                )
                                screenshots_added += 1
                            except Exception:
                                pass
                except Exception:
                    pass

            cur.execute("SELECT id FROM entry_images WHERE game_id = %s ORDER BY seq", (game_id,))
            new_ids = [r[0] for r in cur.fetchall()]

    return jsonify({
        "background_image": new_bg,
        "steam_cover": bool(steam_url),
        "screenshots_added": screenshots_added,
        "extraImageIds": new_ids,
    })


def _skip_threshold_clause():
    """SQL fragment (no leading AND) that matches games to exclude from image syncs."""
    return "status = 6 OR (user_rating IS NOT NULL AND user_rating <= %s)"


@app.route("/api/admin/sync-steam-images", methods=["POST"])
def sync_steam_images_all():
    """
    For every Steam-imported entry (slug starts with 'steam-') without a custom
    cover, resolve the best available Steam image URL and update background_image.
    Skips Dropped games (status 6) and games rated at or below the threshold.
    Body (JSON): { "threshold": 5.0 }  (default 5)
    Returns {"updated": N, "skipped": M}.
    """
    body = request.get_json() or {}
    threshold = float(body.get("threshold", 5))

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT game_id, game_data FROM entries
                WHERE cover_image IS NULL
                  AND game_data->>'slug' LIKE 'steam-%%'
                  AND NOT (status = 6 OR (user_rating IS NOT NULL AND user_rating <= %s))
            """, (threshold,))
            candidates = cur.fetchall()

    updated = 0
    skipped = 0

    with get_db() as conn:
        with conn.cursor() as cur:
            for entry in candidates:
                game_id = entry["game_id"]
                steam_url = _resolve_steam_image_url(game_id)
                if not steam_url:
                    skipped += 1
                    continue
                gd = dict(entry["game_data"])
                gd["background_image"] = steam_url
                cur.execute(
                    "UPDATE entries SET game_data = %s::jsonb, updated_at = NOW() WHERE game_id = %s",
                    (json.dumps(gd), game_id)
                )
                updated += 1

    return jsonify({"updated": updated, "skipped": skipped})


@app.route("/api/admin/prune-extra-images", methods=["POST"])
def prune_extra_images():
    """
    Delete extra screenshots (entry_images rows) for games the user didn't enjoy:
      - Status 6 (Dropped), OR
      - user_rating is set and is below the given threshold.

    Unrated games are not affected unless they are Dropped.
    The cover (cover_image column) and background_image in game_data are never touched.

    Body (JSON): { "threshold": 5.0 }   (default 5)
    Returns: { "deleted_images": N, "affected_games": M }
    """
    body = request.get_json() or {}
    threshold = float(body.get("threshold", 5))

    with get_db() as conn:
        with conn.cursor() as cur:
            # Count affected games first
            cur.execute("""
                SELECT COUNT(DISTINCT game_id) FROM entries
                WHERE status = 6
                   OR (user_rating IS NOT NULL AND user_rating <= %s)
            """, (threshold,))
            affected_games = cur.fetchone()[0]

            # Delete extra images for those games
            cur.execute("""
                DELETE FROM entry_images
                WHERE game_id IN (
                    SELECT game_id FROM entries
                    WHERE status = 6
                       OR (user_rating IS NOT NULL AND user_rating <= %s)
                )
            """, (threshold,))
            deleted_images = cur.rowcount

    return jsonify({"deleted_images": deleted_images, "affected_games": affected_games})


# ---------------------------------------------------------------------------
# Admin / maintenance routes
# ---------------------------------------------------------------------------

@app.route("/api/admin/find-duplicates", methods=["GET"])
def find_duplicates():
    """
    Find entries with similar names using normalized word-Jaccard similarity.
    Uses strict duplicate scoring (_duplicate_score) at 0.85 threshold to avoid
    false positives from sequels (Portal vs Portal 2, Destiny vs Destiny 2).
    Returns: { "groups": [[{game_id, name, image, status},...], ...] }
    """
    threshold = float(request.args.get("threshold", 0.85))
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT game_id,
                       game_data->>'name'             AS name,
                       game_data->>'background_image' AS image,
                       status
                FROM entries
                ORDER BY game_id
            """)
            entries = cur.fetchall()

    groups = []
    used = set()
    for i, a in enumerate(entries):
        if a["game_id"] in used:
            continue
        group = [a]
        for b in entries[i + 1:]:
            if b["game_id"] in used:
                continue
            if _duplicate_score(a["name"] or "", b["name"] or "") >= threshold:
                group.append(b)
                used.add(b["game_id"])
        if len(group) > 1:
            used.add(a["game_id"])
            groups.append([
                {"game_id": g["game_id"], "name": g["name"], "image": g["image"], "status": g["status"]}
                for g in group
            ])

    return jsonify({"groups": groups, "total": sum(len(g) for g in groups)})


@app.route("/api/admin/bulk-delete", methods=["POST"])
def bulk_delete():
    """
    Delete multiple entries by game_id.
    Body: { "game_ids": [int, ...] }
    Also deletes associated entry_images and cover_image rows.
    Returns: { "deleted": N }
    """
    game_ids = request.get_json().get("game_ids", [])
    if not game_ids:
        return jsonify({"deleted": 0})
    deleted = 0
    with get_db() as conn:
        with conn.cursor() as cur:
            for gid in game_ids:
                cur.execute("DELETE FROM entry_images WHERE game_id = %s", (gid,))
                cur.execute("DELETE FROM entries WHERE game_id = %s", (gid,))
                deleted += cur.rowcount
    return jsonify({"deleted": deleted})


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


def _name_similarity(a, b):
    """
    Return a 0.0–1.0 similarity ratio between two game name strings.
    Both are lowercased and stripped of leading/trailing whitespace before
    comparison. Uses SequenceMatcher (similar to difflib.get_close_matches).
    """
    a = a.lower().strip()
    b = b.lower().strip()
    return SequenceMatcher(None, a, b).ratio()


import re as _re

def _fuzzy_name_match(a: str, b: str) -> float:
    """
    Combined similarity score: max(word Jaccard, SequenceMatcher ratio).
    Word Jaccard handles "Spider-Man: Miles Morales" vs "Marvel's Spider-Man: Miles Morales".
    SequenceMatcher handles minor spelling differences.
    Returns 0.0–1.0.
    """
    a = a.lower().strip()
    b = b.lower().strip()
    if a == b:
        return 1.0
    words_a = set(a.split())
    words_b = set(b.split())
    union = words_a | words_b
    jaccard = len(words_a & words_b) / len(union) if union else 0.0
    seq = SequenceMatcher(None, a, b).ratio()
    return max(jaccard, seq)


_ROMAN_MAP = {
    "i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5",
    "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10",
    "xi": "11", "xii": "12", "xiii": "13", "xiv": "14", "xv": "15",
    "xvi": "16", "xvii": "17", "xviii": "18", "xix": "19", "xx": "20",
}


def _normalize_game_name(name: str) -> str:
    """
    Normalize a game name for duplicate detection:
    - strip trailing parentheticals: "(PlayStation®5)", "(PS4)", "(2023)" etc.
    - lowercase
    - strip all non-alphanumeric characters (removes colons, dashes, apostrophes, etc.)
    - convert standalone Roman numerals to Arabic (V→5, VII→7, etc.)
    - remove common noise words: the, a, an, of, in
    - collapse whitespace
    This allows "Grand Theft Auto V (PlayStation®5)" == "Grand Theft Auto V" == "Grand Theft Auto 5",
    "Final Fantasy VII" == "Final Fantasy 7", etc.,
    while keeping "Portal" != "Portal 2" (different word count).
    """
    s = name.strip()
    # Remove trailing parenthetical suffixes added by PSN/Steam: "(PlayStation®5)", "(PS4)", "(2023)"
    s = _re.sub(r"\s*\([^)]*\)\s*$", "", s)
    s = s.lower()
    s = _re.sub(r"[^a-z0-9\s]", " ", s)
    noise = {"the", "a", "an", "of", "in"}
    words = [_ROMAN_MAP.get(w, w) for w in s.split() if w and w not in noise]
    return " ".join(words)


def _duplicate_score(a: str, b: str) -> float:
    """
    Stricter similarity for duplicate detection.
    Uses word Jaccard on normalized names to avoid matching sequels
    (Portal vs Portal 2 → Jaccard 0.5) while catching true duplicates
    (Spider-Man Miles Morales vs Spider-Man: Miles Morales → Jaccard ~1.0).
    Returns 0.0–1.0.
    """
    na = _normalize_game_name(a)
    nb = _normalize_game_name(b)
    if na == nb:
        return 1.0
    words_a = set(na.split())
    words_b = set(nb.split())
    union = words_a | words_b
    if not union:
        return 0.0
    return len(words_a & words_b) / len(union)


def _fuzzy_find(name: str, local_names: dict, threshold: float = 0.75):
    """
    Find the best fuzzy match for `name` in `local_names` ({name_lower: game_id}).
    Returns game_id of the best match if score >= threshold, else None.
    Uses _fuzzy_name_match (liberal, for import dedup).
    """
    best_id = None
    best_score = 0.0
    name_lower = name.lower().strip()
    for candidate, gid in local_names.items():
        score = _fuzzy_name_match(name_lower, candidate)
        if score >= threshold and score > best_score:
            best_score = score
            best_id = gid
    return best_id


def _best_rawg_match(name, candidates, threshold=0.90):
    """
    Given a list of RAWG game dicts, return the one whose name best matches
    `name` (case-insensitive), as long as the similarity is >= threshold AND
    the game has a background_image.  Returns None if nothing qualifies.

    Priority: exact match > highest similarity score.
    """
    name_lower = name.lower().strip()
    best = None
    best_score = 0.0
    for g in candidates:
        if not g.get("background_image"):
            continue
        score = _name_similarity(name_lower, g.get("name", ""))
        if score == 1.0:
            return g  # perfect match, stop immediately
        if score >= threshold and score > best_score:
            best = g
            best_score = score
    return best


@app.route("/api/admin/sync-rawg-images", methods=["POST"])
def sync_rawg_images():
    """
    For every entry without a custom cover (excluding Dropped and low-rated games),
    search RAWG by game name and:
      1. Replace background_image with the best matching RAWG cover.
      2. Fetch all RAWG screenshots and store them in entry_images.

    Skips Dropped games (status 6) and games rated at or below the threshold.
    Body (JSON): { "threshold": 5.0 }  (default 5)
    Custom covers (cover_image IS NOT NULL) are never touched.
    Returns {"updated": N, "screenshots_added": S, "skipped": M}.
    """
    if not RAWG_KEY:
        return jsonify({"error": "RAWG_API_KEY not configured"}), 400

    body = request.get_json() or {}
    threshold = float(body.get("threshold", 5))

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT e.game_id, e.game_data, e.custom_images_only
                FROM entries e
                WHERE e.cover_image IS NULL
                  AND NOT (status = 6 OR (user_rating IS NOT NULL AND user_rating <= %s))
            """, (threshold,))
            candidates = cur.fetchall()

    updated = 0
    screenshots_added = 0
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
                    best = None

                    # Pass 1: exact-match search (RAWG-side filtering)
                    results = rawg_get("/games", params={"search": name, "search_exact": True, "page_size": 5})
                    best = _best_rawg_match(name, results.get("results") or [])

                    # Pass 2: broader search with similarity check
                    if not best:
                        results = rawg_get("/games", params={"search": name, "page_size": 10})
                        best = _best_rawg_match(name, results.get("results") or [])

                    if not best:
                        skipped += 1
                        continue

                    game_id = entry["game_id"]
                    rawg_id = best["id"]

                    # Update background_image in game_data
                    updated_gd = dict(gd)
                    updated_gd["background_image"] = best["background_image"]
                    cur.execute(
                        "UPDATE entries SET game_data = %s::jsonb, updated_at = NOW() WHERE game_id = %s",
                        (json.dumps(updated_gd), game_id)
                    )
                    updated += 1

                    # Fetch and store screenshots — clear existing RAWG images first,
                    # then re-insert the full set. custom_images_only entries are skipped
                    # so user-curated galleries are never wiped.
                    custom_only = entry.get("custom_images_only") or False
                    if not custom_only:
                        try:
                            shots = rawg_get(f"/games/{rawg_id}/screenshots", {"page_size": 20})
                            shot_urls = [s["image"] for s in (shots.get("results") or []) if s.get("image")]
                            if shot_urls:
                                # Clear previous RAWG-sourced images before re-inserting
                                cur.execute("DELETE FROM entry_images WHERE game_id = %s", (game_id,))
                                for seq, url in enumerate(shot_urls):
                                    try:
                                        img_resp = requests.get(url, timeout=15)
                                        img_resp.raise_for_status()
                                        mime = img_resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
                                        cur.execute(
                                            "INSERT INTO entry_images (game_id, seq, image_data, image_mime) VALUES (%s, %s, %s, %s)",
                                            (game_id, seq, psycopg2.Binary(img_resp.content), mime)
                                        )
                                        screenshots_added += 1
                                    except Exception:
                                        pass  # skip individual failed downloads
                        except Exception:
                            pass  # screenshots are best-effort; cover update already succeeded

                except Exception:
                    skipped += 1

    return jsonify({"updated": updated, "screenshots_added": screenshots_added, "skipped": skipped})


@app.route("/api/backup/download", methods=["GET"])
def backup_download():
    """Stream a gzipped pg_dump of the database as a file download."""
    import subprocess
    from urllib.parse import urlparse

    parsed = urlparse(DB_URL)
    host     = parsed.hostname or "localhost"
    port     = str(parsed.port or 5432)
    dbname   = parsed.path.lstrip("/")
    user     = parsed.username or "gamilist"
    password = parsed.password or ""

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename  = f"gamilist_{timestamp}.sql.gz"

    env = os.environ.copy()
    env["PGPASSWORD"] = password

    try:
        dump_proc = subprocess.Popen(
            ["pg_dump", "-h", host, "-p", port, "-U", user, dbname],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )

        def generate():
            try:
                cobj = zlib.compressobj(6, zlib.DEFLATED, zlib.MAX_WBITS | 16)
                while True:
                    chunk = dump_proc.stdout.read(65536)
                    if not chunk:
                        break
                    yield cobj.compress(chunk)
                yield cobj.flush()
            finally:
                dump_proc.stdout.close()
                dump_proc.terminate()
                dump_proc.wait()

        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/gzip",
        }
        return Response(generate(), headers=headers, status=200)

    except FileNotFoundError:
        return jsonify({"error": "pg_dump not found on server"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _pg_conn_parts():
    from urllib.parse import urlparse
    p = urlparse(DB_URL)
    return p.hostname or "localhost", str(p.port or 5432), p.path.lstrip("/"), p.username or "gamilist", p.password or ""


def _extract_platform_name(game_data):
    if not game_data:
        return ""
    slug = game_data.get("slug", "")
    if slug.startswith("steam-"):
        return "Steam"
    platforms = game_data.get("platforms") or []
    for p in platforms:
        name = (p.get("platform") or {}).get("name", "")
        if name:
            return name
    return ""


def _parse_entries_from_dump(sql_text):
    """Parse the entries COPY block from a pg_dump and return {game_id: {...}}."""
    import re, json as _json

    m = re.search(
        r'COPY\s+(?:public\.)?entries\s+\(([^)]+)\)\s+FROM\s+stdin;\n(.*?)\n\\\.',
        sql_text, re.DOTALL,
    )
    if not m:
        return {}

    cols = [c.strip() for c in m.group(1).split(",")]
    result = {}

    for line in m.group(2).split("\n"):
        if not line:
            continue
        vals = line.split("\t")
        if len(vals) != len(cols):
            continue
        row = dict(zip(cols, vals))

        try:
            game_id = int(row["game_id"])
        except (KeyError, ValueError):
            continue

        raw_gd = row.get("game_data", r"\N")
        game_data = {}
        if raw_gd != r"\N":
            try:
                game_data = _json.loads(raw_gd.replace(r"\t", "\t").replace(r"\n", "\n").replace(r"\\", "\\")) or {}
            except Exception:
                pass

        def _int(v):
            return int(v) if v not in (r"\N", "", None) else None

        def _float(v):
            return float(v) if v not in (r"\N", "", None) else None

        custom_name = row.get("custom_name", r"\N")
        name = (custom_name if custom_name not in (r"\N", "") else None) or game_data.get("name") or f"Game #{game_id}"

        result[game_id] = {
            "game_id":         game_id,
            "name":            name,
            "platform":        _extract_platform_name(game_data),
            "status":          _int(row.get("status", r"\N")),
            "user_rating":     _float(row.get("user_rating", r"\N")),
            "favourite":       row.get("favourite", "f") == "t",
            "playtime_minutes": _int(row.get("playtime_minutes", r"\N")),
        }

    return result


@app.route("/api/backup/verify", methods=["POST"])
def backup_verify():
    """Decompress and diff a .sql.gz backup against the live database."""
    import gzip as _gz

    if "file" not in request.files:
        return jsonify({"valid": False, "error": "No file provided"}), 400

    raw = request.files["file"].read()
    try:
        sql_text = _gz.decompress(raw).decode("utf-8")
    except Exception:
        return jsonify({"valid": False, "error": "Cannot decompress — not a valid .sql.gz backup"}), 200

    backup = _parse_entries_from_dump(sql_text)
    if not backup and "entries" not in sql_text:
        return jsonify({"valid": False, "error": "No entries table found in this backup"}), 200

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT game_id, game_data, status, user_rating, favourite, playtime_minutes, custom_name FROM entries"
            )
            rows = cur.fetchall()

    current = {}
    for r in rows:
        gd = r["game_data"] or {}
        name = r.get("custom_name") or gd.get("name") or f"Game #{r['game_id']}"
        current[r["game_id"]] = {
            "game_id":          r["game_id"],
            "name":             name,
            "platform":         _extract_platform_name(gd),
            "status":           r["status"],
            "user_rating":      r["user_rating"],
            "favourite":        r["favourite"],
            "playtime_minutes": r["playtime_minutes"],
        }

    b_ids = set(backup)
    c_ids = set(current)

    added   = sorted([backup[g]  for g in b_ids - c_ids], key=lambda x: x["name"].lower())
    removed = sorted([current[g] for g in c_ids - b_ids], key=lambda x: x["name"].lower())

    modified = []
    unchanged = 0
    for gid in b_ids & c_ids:
        b, c = backup[gid], current[gid]
        changes = {}
        for field in ("status", "user_rating", "favourite", "playtime_minutes"):
            bv, cv = b.get(field), c.get(field)
            if bv != cv:
                changes[field] = {"backup": bv, "current": cv}
        if changes:
            modified.append({"game_id": gid, "name": b["name"], "platform": b["platform"], "changes": changes})
        else:
            unchanged += 1

    modified.sort(key=lambda x: x["name"].lower())

    return jsonify({
        "valid": True,
        "stats": {
            "backup_count": len(b_ids),
            "db_count":     len(c_ids),
            "added":        len(added),
            "removed":      len(removed),
            "modified":     len(modified),
            "unchanged":    unchanged,
        },
        "added":    added,
        "removed":  removed,
        "modified": modified,
    })


@app.route("/api/backup/restore", methods=["POST"])
def backup_restore():
    """Replace the live database with the contents of a .sql.gz backup."""
    import gzip as _gz, subprocess, tempfile

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    raw = request.files["file"].read()
    try:
        sql_bytes = _gz.decompress(raw)
    except Exception:
        return jsonify({"error": "Cannot decompress backup"}), 400

    host, port, dbname, user, password = _pg_conn_parts()
    env = os.environ.copy()
    env["PGPASSWORD"] = password

    with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as tmp:
        tmp.write(sql_bytes)
        tmp_path = tmp.name

    try:
        # Wipe existing schema, then replay the dump
        subprocess.run(
            ["psql", "-h", host, "-p", port, "-U", user, "-d", dbname,
             "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"],
            env=env, check=True, capture_output=True,
        )
        result = subprocess.run(
            ["psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-f", tmp_path],
            env=env, capture_output=True, text=True,
        )
        if result.returncode != 0:
            return jsonify({"error": result.stderr[:2000]}), 500
        return jsonify({"ok": True})
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr)
        return jsonify({"error": err[:2000]}), 500
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    # debug=True enables hot reload during local development.
    # In production (Kubernetes), the container is restarted instead.
    app.run(host="0.0.0.0", port=5001, debug=True)
