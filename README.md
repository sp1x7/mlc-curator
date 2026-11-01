# mlc-curator

Self-hosted curator for one private release board. It reads the board, matches releases to TMDB
titles, downloads the ones that measure better than what you already own and files them into your
library with your naming rules. One Bun server, one SQLite database, a browser desktop.

## Features

- Board snapshot: one row per thread, forum tree, filters for resolution, source, codec, audio,
  colour range and language
- TMDB matching from the release name and `.nfo`, with candidate picks in the UI
- Wishlist with per-title targets (resolution, HDR, audio) and per-season / per-episode status
- FTP downloads: file selection, resume at the last byte, retry ladder, speed limits
- RAR extraction with the bundled `unrar`
- ffprobe measurement per file: resolution class is decided by measurement
- Plan window: destination folder and file name for every file before anything moves
- Upgrade run: fetches releases that beat the library or fulfil a wish
- Live updates over SSE, window layout persisted, mobile surface for the same API
- DB editor for every table

## Requirements

| Requirement | Notes |
| --- | --- |
| Bun 1.4+ | runtime and package manager |
| ffprobe | media measurement, path configurable in settings |
| unrar | taken from `PATH`, otherwise from `bin/<platform>/` |
| board account | mlcboard.com |
| sfdl password | decrypts the release info files |
| TMDB API key | v3 |

## Installation

```bash
bun install
bun run dev        # UI http://localhost:5173, API proxied to :5174
```

Production:

```bash
bun run build      # tsc -b && vite build → dist/
bun start          # serves dist/ and /api on :5174
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5174` | HTTP port |
| `DATABASE_PATH` | `data/curator.db` | SQLite file |

Everything else lives in the settings table and is edited in the UI: credentials, library root,
download folder, naming formats, board pacing, upgrade switches and the scheduled runs
(`lib_scan_*`, `catalog_sync_*`, `upgrade_check_*`, `download_resume`).

## First run

1. Settings → Credentials — board login, sfdl password, TMDB key
2. Settings → Library — absolute path to the library folder
3. Settings → Download — download folder, movie/series folders, naming formats
4. Settings → Board — pages per forum, request delay, challenge attempts, then run the sync
5. Library → scan once
6. Wishlist → add titles and set their targets

## Project structure

```
server/
  api/         HTTP routes, one per area
  app/         startup, scheduled runs, SSE stream
  board/ sfdl/ board pages, login, info files
  ftp/ unpack/ transfer, resume, RAR
  tmdb/        client, search, matching
  wishlist/    wishes, targets, library comparison
  downloads/   download state, plan, organize
  library/     scan, ffprobe, library stand
  upgrades/    release selection and upgrade run
  settings/ db/ settings store, schema, migrations
web/
  shell/       window layer, dock, layout storage
  windows/     one folder per area window
  mobile/      phone surface
  data/ lib/   SSE bridge, query keys, API client
shared/types/  types and rules shared by server and UI
drizzle/       SQL migrations
bin/           unrar binaries
tests/         bun test suites
```

## API

Base path `/api`, health check `GET /api/health`.

| Group | Routes |
| --- | --- |
| `events` | `GET /api/events` (SSE) |
| `catalog` | releases, categories, sync, link, session, info, assign |
| `wishlist` | wishes, resolve, add, target, delete |
| `downloads` | list, files, detail, plan, start, stop, resume, organize, delete |
| `library` | stand, root, scan |
| `settings` | read, write, session, board sync, library scan, upgrade check, filesystem |
| `tmdb` | settings, resolve |
| `db` | tables, rows (read / insert / update / delete) |

## Testing

```bash
bun run test                                   # suites
bun run test tests/band.test.ts                # single file
bun run lint && bun run check && bun run test && bun run build   # all checks
```

The preloaded `tests/setup.ts` sets `DATABASE_PATH=:memory:` and replays the migrations in
`drizzle/`, so the suites need no database file. ffprobe is stubbed through the `probe_binary`
setting, so they need no ffmpeg.

## Deployment

```bash
bun run build && docker build -t mlc-curator .
docker run -d -p 3434:3434 -v curator-data:/app/data -v curator-media:/app/media mlc-curator
```

The image ships the `dist/` built on the host, runs migrations on start (`MIGRATE=0` to skip) and
seeds the media folders under `MEDIA_ROOT` on an empty volume. Keep download folder and library in
one volume: organizing is a rename.

## License

Private project, no license file yet.
