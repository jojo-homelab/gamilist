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
    Create the 'entries' table if it does not already exist.

    Called once at startup. The table stores one row per game the user has
    added to their list, keyed on RAWG's numeric game_id.

    Columns:
      game_id     — RAWG game ID (primary key)
      game_data   — Full RAWG game object stored as JSONB (name, cover URL, genres, etc.)
      status      — Integer index into the STATUSES list in the frontend (0–6)
      user_rating — User's personal score (0.0–10.0), nullable
      favourite   — Boolean flag for the Favourites tab
      cover_image — Custom cover uploaded by the user, stored as raw bytes (BYTEA)
      cover_mime  — MIME type of the cover image (e.g. "image/jpeg")
      created_at  — Row insertion timestamp
      updated_at  — Last modification timestamp (used for list ordering)
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
        "game":       row["game_data"],
        "status":     row["status"],
        "userRating": row["user_rating"],
        "favourite":  row["favourite"],
        "hasCover":   row["cover_image"] is not None,
    }


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
    if not url or "rawg.io" not in url:
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
            cur.execute("SELECT * FROM entries ORDER BY updated_at DESC")
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
    game_data   = body.get("game")
    status      = body.get("status")
    user_rating = body.get("userRating")
    favourite   = body.get("favourite", False)

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO entries (game_id, game_data, status, user_rating, favourite, updated_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT (game_id) DO UPDATE SET
                    game_data   = EXCLUDED.game_data,
                    status      = EXCLUDED.status,
                    user_rating = EXCLUDED.user_rating,
                    favourite   = EXCLUDED.favourite,
                    updated_at  = NOW()
                RETURNING *
            """, (game_id, json.dumps(game_data), status, user_rating, favourite))
            row = cur.fetchone()
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


if __name__ == "__main__":
    # debug=True enables hot reload during local development.
    # In production (Kubernetes), the container is restarted instead.
    app.run(host="0.0.0.0", port=5001, debug=True)
