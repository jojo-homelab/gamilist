# GamiList — Backend

Flask REST API that proxies the RAWG Video Games Database and persists the user's game list in PostgreSQL.

## API Routes

| Method | Path                          | Description                                      |
|--------|-------------------------------|--------------------------------------------------|
| GET    | `/api/games/search?q=`        | Search RAWG for games                            |
| GET    | `/api/games/popular`          | Top 10 games by Metacritic score (readiness probe) |
| GET    | `/api/image-proxy?url=`       | Proxy a RAWG CDN image to avoid CORS issues      |
| GET    | `/api/list`                   | Return the full game list from the database      |
| PUT    | `/api/list/<game_id>`         | Add or update a game entry (upsert)              |
| DELETE | `/api/list/<game_id>`         | Remove a game from the list                      |
| POST   | `/api/list/<game_id>/cover`   | Upload a custom cover image (multipart)          |
| GET    | `/api/list/<game_id>/cover`   | Serve the stored custom cover image              |

## Database Schema

```sql
CREATE TABLE entries (
    game_id     INTEGER PRIMARY KEY,  -- RAWG game ID
    game_data   JSONB       NOT NULL, -- Full RAWG game object
    status      INTEGER,              -- 0=Playing 1=Played 2=Next 3=Backlog 4=Replaying 5=PlanReplay 6=Dropped
    user_rating REAL,                 -- Personal score 0.0–10.0
    favourite   BOOLEAN DEFAULT FALSE,
    cover_image BYTEA,                -- Custom cover (raw bytes)
    cover_mime  TEXT,                 -- MIME type of the cover image
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

## Environment Variables

| Variable       | Required | Description                                           |
|----------------|----------|-------------------------------------------------------|
| `RAWG_API_KEY` | Yes      | API key from https://rawg.io/apidocs (free account)  |
| `DATABASE_URL` | Yes      | PostgreSQL connection string                          |

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
# Fill in RAWG_API_KEY
```

## Local Development (without Kubernetes)

```bash
# 1. Create a virtual environment
python -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start a local PostgreSQL database
# (using Docker for convenience)
docker run -d --name gamilist-pg \
  -e POSTGRES_DB=gamilist \
  -e POSTGRES_USER=gamilist \
  -e POSTGRES_PASSWORD=gamilist \
  -p 5432:5432 postgres:16-alpine

# 4. Export environment variables
export RAWG_API_KEY=your_key_here
export DATABASE_URL=postgresql://gamilist:gamilist@localhost:5432/gamilist

# 5. Run the server
python backend.py
# → http://localhost:5001
```

## Docker Build

```bash
docker build -t gamilist-backend:latest .
docker run -p 5001:5001 \
  -e RAWG_API_KEY=your_key_here \
  -e DATABASE_URL=postgresql://... \
  gamilist-backend:latest
```
