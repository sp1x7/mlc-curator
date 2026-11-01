# syntax=docker/dockerfile:1
#
# mlc-curator: Bun server (Hono) + vite desktop in one image.
# The desktop comes from the host's dist/ (`bun run build`); the image builds the
# runtime dependencies alone. Builds for linux/amd64 and linux/arm64, the deps
# stage runs on the build host, so the runtime stage carries the emulation.

# ---- runtime dependencies alone: vite, drizzle-kit and better-sqlite3 stay out --
FROM --platform=$BUILDPLATFORM oven/bun:1.4-slim AS deps
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- runtime -----------------------------------------------------------------
# Debian, Alpine left out: bin/<arch>/unrar is glibc-linked.
# ffmpeg brings ffprobe, the program the media probe measures files with.
FROM oven/bun:1.4-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# DATABASE_PATH stays relative: data/ is a volume and holds the sqlite file alone.
# Media lives in a second volume, one parent for the download folder and the
# library: sorting into the library is a rename, and a rename that crosses into
# another volume becomes a copy of every byte instead.
ENV NODE_ENV=production \
    PORT=3434 \
    DATABASE_PATH=data/curator.db \
    MEDIA_ROOT=/app/media

COPY --from=deps /src/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY server ./server
COPY shared ./shared
COPY bin ./bin
# dist/ is the release build made on the host with `bun run build`: the image
# ships what was built and tested there.
COPY dist ./dist

# Drizzle bookkeeping for a fresh volume, written into the image: the server opens
# the database on its own, the drizzle/ folder serves the migration pass.
RUN printf '%s\n' \
  'import { migrate } from "drizzle-orm/bun-sqlite/migrator";' \
  'import { db } from "./server/db/db";' \
  'migrate(db, { migrationsFolder: "drizzle" });' \
  > migrate.ts

# The two folder settings, written while the key stands absent, so an existing
# volume keeps the paths it was given. They are absolute because the server takes a
# stored path once it is absolute; a relative one falls back to a folder under data/.
RUN printf '%s\n' \
  'import { db } from "./server/db/db";' \
  'import { settings } from "./server/db/schema";' \
  'const media = (process.env.MEDIA_ROOT ?? "/app/media").replace(/\/$/, "");' \
  'const folders: Record<string, string> = {' \
  '  download_folder: `${media}/downloads`,' \
  '  library_root: `${media}/bibliothek`,' \
  '};' \
  'for (const [key, value] of Object.entries(folders))' \
  '  db.insert(settings).values({ key, value }).onConflictDoNothing().run();' \
  > seed.ts

EXPOSE 3434
# data/ = the database, media/ = downloads and library under one parent.
VOLUME ["/app/data", "/app/media"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e 'fetch(`http://127.0.0.1:${process.env.PORT ?? 3434}/api/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

# MIGRATE=0 skips the migration pass (image downgrade).
CMD ["sh", "-c", "mkdir -p \"$(dirname \"$DATABASE_PATH\")\" \"$MEDIA_ROOT/downloads\" \"$MEDIA_ROOT/bibliothek\" && [ \"${MIGRATE:-1}\" = 1 ] && bun migrate.ts && bun seed.ts; exec bun server/app/index.ts"]
