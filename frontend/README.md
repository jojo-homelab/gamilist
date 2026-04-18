# GamiList — Frontend

React SPA built with Vite. The entire UI lives in a single file (`src/App.jsx`) and communicates with the Flask backend via a REST API.

## Components

| Component     | Description                                                                 |
|---------------|-----------------------------------------------------------------------------|
| `App`         | Root component — owns all state, orchestrates API calls                     |
| `GameCard`    | Individual game tile with cover, status badge, rating, favourite toggle      |
| `Grid`        | Responsive CSS grid wrapper for GameCard                                     |
| `RatingInput` | Inline editable score (0–10) that toggles between display and input mode    |
| `StarRating`  | Read-only 5-star bar proportional to RAWG's 0–5 community rating           |
| `CoverUpload` | File input overlay that POSTs a custom cover image to the backend           |
| `Spinner`     | Full-page loading indicator                                                  |

## Environment Variables

| Variable        | Description                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| `VITE_API_URL`  | Base URL of the Flask backend. Baked into the static bundle at build time. |

Set at Docker build time:

```bash
docker build --build-arg VITE_API_URL=http://gamilist.local:8080 -t gamilist-frontend:latest .
```

For local dev (`npm run dev`), it falls back to `http://localhost:5001`.

## Local Development (without Kubernetes)

```bash
# Install dependencies
npm install

# Start the dev server (hot reload)
npm run dev
# → http://localhost:5173

# Make sure the backend is also running on port 5001
```

## Docker Build

The Dockerfile uses a two-stage build:

1. **Build stage** — Node 20 installs dependencies and runs `vite build`, producing a static `dist/` folder
2. **Serve stage** — `nginx:alpine` serves the static files and handles SPA routing via `try_files`

```bash
docker build \
  --build-arg VITE_API_URL=http://gamilist.local:8080 \
  -t gamilist-frontend:latest .
```

## Notes

- `VITE_API_URL` is embedded in the JavaScript bundle at build time — changing it requires a rebuild and image reload
- The nginx config uses `try_files $uri $uri/ /index.html` so React Router handles all client-side routes without returning 404s
