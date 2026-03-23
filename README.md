# Kompas

![LotusHacks 26 Runner-up](https://img.shields.io/badge/LotusHacks_26-Runner--up-EA4F4F?style=for-the-badge)
![Interfaze Sponsor Track](https://img.shields.io/badge/Interfaze-Sponsor_Track-1D4ED8?style=for-the-badge)

## LotusHacks 26 Achievement

**Runner-up of LotusHacks 26 in the Interfaze Sponsor Track.**

Kompas is a Ho Chi Minh City discovery app that combines route planning, AI-assisted POI recommendations, live social meetup rooms, and UGC ingestion from short videos.

## What This Project Includes

- Discovery planner with time-budgeted stop selection (knapsack-based POI picking using `video_playcount`).
- Direct A→B routing (`plan normal route`) and multi-stop route planning.
- AI Assistant:
  - `Ask POI`: recommend one place + route there.
  - `Plan Route`: suggest destination vibe, then connect recommended POIs.
- Social Hub:
  - create/join rooms,
  - live participants + chat stream,
  - room-based nearby recommendations.
- UGC upload pipeline (`/api/ugc/videos`) for extracting and indexing place context from uploaded videos.

## Architecture

- `frontend/`: React + TypeScript + Vite + Tailwind + Leaflet.
- `backend/`: Go HTTP API (routing, geocoding, social room state, recommendations, asset serving).
- `backend/services/`: FastAPI service for AI assistant + UGC processing.
- `data/data.json`: shared POI/review dataset (TikTok URL/id, playcount, coordinates, metadata).
- `docker-compose.yml` + `Caddyfile`: full stack runtime with reverse proxy and TLS.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Zustand, React Router, Leaflet.
- Backend API: Go 1.22, Chi router.
- AI/UGC service: Python 3.11, FastAPI, Uvicorn, OpenAI SDK, pymilvus.
- Map/geo providers: OpenRouteService (primary), Vietmap (fallback), OpenStreetMap/Nominatim (fallback).

## Quick Start (Docker, Recommended)

### 1) Prepare env

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at least:

```env
PORT=8080
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
POI_DATA_PATH=../data/data.json

# Optional but recommended for better geocoding/routing:
ORS_API_KEY=
VIETMAP_API_KEY=

# Optional AI live mode (without this, assistant uses local fallback mode):
OPENAI_API_KEY=

# Optional vector search:
ZILLIZ_URI=
ZILLIZ_TOKEN=
ZILLIZ_DB_NAME=
```

### 2) Start all services

```bash
APP_DOMAIN=localhost docker compose up --build
```

### 3) Open app

- Through Caddy: `https://localhost` (or `https://<your-domain>` if `APP_DOMAIN` is set to a real domain)
- Direct Vite dev server: `http://localhost:5173`

### 4) Health checks

```bash
curl http://localhost:8080/healthz
curl http://localhost:8090/healthz
curl http://localhost:8090/healthz/assistant
```

## Local Development (Without Docker)

Run 3 processes in parallel.

### Terminal 1: Go backend

```bash
cd backend
cp .env.example .env  # if missing
go run ./cmd/api
```

Runs on `http://localhost:8080`.

### Terminal 2: AI/UGC FastAPI service

```bash
cd backend/services
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

Runs on `http://localhost:8090`.

### Terminal 3: Frontend

```bash
cd frontend
npm ci
VITE_API_MODE=real \
VITE_API_BASE_URL=http://localhost:8080 \
VITE_AI_API_BASE_URL=http://localhost:8090 \
VITE_UGC_API_BASE_URL=http://localhost:8090 \
npm run dev -- --host 0.0.0.0 --port 5173
```

Runs on `http://localhost:5173`.

## Main API Surface

- Geocoding: `GET /api/geocode/search`
- Route planning:
  - `POST /api/routes/plan`
  - `POST /api/routes/normal`
  - `POST /api/routes/connect-pois`
- Social:
  - `GET/POST /api/social/sessions`
  - `POST /api/social/sessions/{id}/join`
  - `GET /api/social/sessions/{id}/stream` (SSE)
  - `POST /api/social/sessions/{id}/location`
  - `GET /api/social/sessions/{id}/recommendations`
- Assistant:
  - `POST /api/assistant/messages`
  - `POST /api/assistant/test-search`
- UGC:
  - `POST /api/ugc/videos`
  - `GET /api/ugc/jobs/{job_id}`

## Notes

- Discovery geocoding is bounded to Ho Chi Minh City in backend geocode logic.
- If OpenAI is unavailable (missing key or provider restriction), assistant still responds with local review evidence fallback.
- Dataset images are served from `/assets/images/*` (mapped from `data/images/*`).
