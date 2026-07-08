# Fotify

Fotify is a self-hosted photo slideshow and digital photo frame for a TV, kiosk display, Raspberry Pi, or home server. It scans local or SMB photo sources, builds a shared server-side slideshow timeline, serves optimized display-resolution images, and provides an admin UI for sources, effects, overlays, scheduling, calendar, and weather.

## Features

- Full-screen slideshow UI designed for unattended displays.
- Admin UI for adding local and SMB photo sources.
- Lazy image cache using Sharp, EXIF rotation, and display-size JPEG generation.
- Server-controlled slideshow timeline so multiple displays stay in sync.
- Slideshow pauses automatically when no client is connected.
- Single-photo, portrait triple, and named collage layouts.
- Transition effects, Ken Burns motion, cinematic color grading, photo frames, captions, and global grain overlay.
- Night mode, auto-rescan, source rotation, hidden/favorite photo actions, and cache cleanup.
- Optional calendar overlays via Google Calendar OAuth or Apple CalDAV.
- Optional weather overlay using Open-Meteo.
- Docker Compose deployment with an nginx-served frontend and NestJS backend.

## Tech Stack

- Frontend: React, Vite, TypeScript, Mantine, React Router
- Backend: NestJS, TypeORM, SQLite, Sharp, exifr
- Runtime: Node.js 20 in Docker, nginx for the frontend container
- Storage: SQLite database and generated image cache under `FOTIFY_DATA_DIR`

## Repository Layout

```text
backend/        NestJS API, slideshow state, scanning, cache, SQLite migrations
frontend/       React/Vite admin and slideshow UI
scripts/        Deployment and kiosk helper scripts
.env.example
```

## Quick Start With Docker

1. Create an environment file:

```bash
cp .env.example .env
```

2. Adjust `docker-compose.yml` volumes for your machine.

The default compose file mounts persistent Fotify data at `/app/data` and includes an example photo mount:

```yaml
volumes:
  - /volume1/photo/:/photo/
  - /volume2/docker/fotify/:/app/data/
```

3. Start the stack:

```bash
docker compose up --build -d
```

4. Open the app:

```text
http://localhost:15766
```

5. Open the admin UI and add sources:

```text
http://localhost:15766/admin
```

For a local Docker-mounted source, add the container path, for example `/photo` or another path you bind-mounted into the backend container.

## Local Development

Install dependencies separately for backend and frontend:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

Start the backend API:

```bash
cd backend
npm run start:dev
```

Start the frontend dev server:

```bash
cd frontend
npm run dev
```

Local development ports:

- Frontend: `http://localhost:15766`
- Backend: `http://localhost:15765`

The Vite dev server proxies `/sources`, `/photos`, `/settings`, `/calendar`, and `/weather` to the backend.

## Configuration

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `FRONTEND_PORT` | `15766` | Host port exposed by Docker Compose for the frontend. |
| `PORT` | `15765` | Backend HTTP port. Set in the backend container. |
| `FOTIFY_DATA_DIR` | `backend/data` locally, `/app/data` in Docker | Directory for `fotify.db` and generated cache files. |

Google Calendar OAuth credentials are configured through the admin UI under the calendar setup dialog, not through `.env`.

## Data And Cache

Fotify stores runtime data in `FOTIFY_DATA_DIR`:

```text
fotify.db       SQLite database
cache/          generated display-resolution JPEGs
```

The backend runs TypeORM migrations automatically on startup. Cache files are generated lazily when photos are prewarmed or displayed, then reclaimed when they are no longer referenced, no longer queued, or stale.

## Admin Workflow

1. Open `/admin`.
2. Add one or more local or SMB sources.
3. Run a scan for each source.
4. Configure slideshow timing, effects, frames, captions, grain, night mode, collages, calendar, and weather.
5. Open `/` on the display device to show the slideshow.

## Kiosk Mode

The `scripts/kiosk.sh` helper launches Fotify in a Chromium/Chrome kiosk window:

```bash
./scripts/kiosk.sh http://your-host:15766
```

For auto-start on a dedicated Linux display, see `scripts/fotify-kiosk.service`.

## Useful Commands

Backend:

```bash
cd backend
npm run build
npm run start:prod
npm run test
npm run migration:run
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
npm run preview
```

Docker:

```bash
docker compose up --build -d
docker compose logs -f
docker compose down
```

## Production Notes

- Persist `/app/data` in Docker; it contains the database and image cache.
- Mount photo directories read-only when possible.
- If using SMB sources, configure them through the admin UI.
- The slideshow timeline advances only while at least one slideshow client is heartbeating.
- The frontend container serves static files through nginx and proxies API calls to the backend service.

## License

MIT License. Copyright (c) 2026 dimsik.
