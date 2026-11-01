// Hono routes for the catalog window: /releases and /categories read the
// releases table, /sync starts the board snapshot run, /link queues the tmdb
// pass for every unlinked thread, /assign writes one mapping row by hand.
//
// GET /releases answers one whole category. Filtering, sorting and search run
// in the browser over those rows, so each row carries tags, ftp block, tmdb
// title and library counts in one payload.

import type { Release, ReleaseFtp, ReleaseTitle } from "@shared/types/catalog";
import { eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { CATEGORIES, categoryOf } from "../board/forums";
import { fetchAccess } from "../board/info";
import { sessionState } from "../board/login";
import { linkState, linkUnlinked, startSync, stopLinking, syncState } from "../board/sync";
import { db } from "../db/db";
import { mappings, releases } from "../db/schema";
import { currentStand } from "../library/stand";
import { resolveText } from "../tmdb/resolve";
import type { MovieRow, SeriesRow } from "../tmdb/title";
import { storedMovie, storedMoviesIn, storedSeries, storedSeriesIn } from "../tmdb/title";
import { indexLibrary, libraryKey } from "../wishlist/library";

export const catalogRoute = new Hono();

// The tags column holds a json array; anything else decodes to an empty list.
function tagsOf(row: { tags: string }): string[] {
  try {
    const parsed: unknown = JSON.parse(row.tags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

// The genres column is a nullable json array of strings.
function genresOf(row: { genres: string | null }): string[] {
  if (!row.genres) return [];
  try {
    const parsed: unknown = JSON.parse(row.genres);
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === "string") : [];
  } catch {
    return [];
  }
}

type TmdbRef = { kind: "movie"; row: MovieRow } | { kind: "tv"; row: SeriesRow };

// Reshapes a stored movie or series row into ReleaseTitle. Movie year comes
// from row.year, tv year from row.firstAirYear; rating and votes map from the
// vote columns.
function titleOf(found: TmdbRef): ReleaseTitle {
  if (found.kind === "movie") {
    const row = found.row;
    return {
      kind: "movie",
      tmdbId: row.tmdbId,
      title: row.title,
      originalTitle: row.originalTitle,
      year: row.year,
      rating: row.voteAverage,
      voteCount: row.voteCount,
      overview: row.overview,
      posterPath: row.posterPath,
      genres: genresOf(row),
    };
  }

  const row = found.row;
  return {
    kind: "tv",
    tmdbId: row.tmdbId,
    title: row.title,
    originalTitle: row.originalTitle,
    year: row.firstAirYear,
    rating: row.voteAverage,
    voteCount: row.voteCount,
    overview: row.overview,
    posterPath: row.posterPath,
    genres: genresOf(row),
  };
}

// Builds the ftp block from the release row. Host and fetch time both have to
// carry a value; passwordSet reports the state of the password column, the
// password itself stays server side. Epoch seconds become an iso string.
function ftpOf(row: typeof releases.$inferSelect): ReleaseFtp | null {
  if (!row.ftpHost || !row.ftpFetchedAt) return null;
  return {
    host: row.ftpHost,
    port: row.ftpPort,
    user: row.ftpUser,
    path: row.ftpPath,
    passwordSet: Boolean(row.ftpPass),
    fetchedAt: new Date(row.ftpFetchedAt * 1000).toISOString(),
  };
}

// Every release row of one category, ordered by the releases table, plus the
// mapping row of each thread.
catalogRoute.get("/releases", (c) => {
  const category = c.req.query("category")?.trim() ?? "";
  if (!category) return c.json({ error: "category fehlt" }, 400);

  const rows = db.select().from(releases).where(eq(releases.category, category)).all();

  const linked = new Map(
    db
      .select()
      .from(mappings)
      .where(
        inArray(
          mappings.threadId,
          rows.map((row) => row.threadId),
        ),
      )
      .all()
      .map((row) => [row.threadId, row]),
  );

  const movieIds = [
    ...new Set([...linked.values()].filter((m) => m.kind === "movie").map((m) => m.tmdbId)),
  ];
  const seriesIds = [
    ...new Set([...linked.values()].filter((m) => m.kind === "tv").map((m) => m.tmdbId)),
  ];

  // Two batched selects, storedMoviesIn + storedSeriesIn, fill the title map,
  // keyed by tmdbId, across every mapping of the category.
  const titles = new Map<number, TmdbRef>();
  for (const row of storedMoviesIn(movieIds)) titles.set(row.tmdbId, { kind: "movie", row });
  for (const row of storedSeriesIn(seriesIds)) titles.set(row.tmdbId, { kind: "tv", row });

  // indexLibrary walks the roots of the current library stand. The lookup key
  // is libraryKey(kind, tmdbId); its entry answers file count and season count
  // for the have field. The stand is built in memory during a run, so a fresh
  // process leaves have null on every row.
  const held = indexLibrary(currentStand().roots);

  const out: Release[] = rows.map((row) => {
    const mapping = linked.get(row.threadId);
    const found = mapping ? titles.get(mapping.tmdbId) : undefined;
    const hit = mapping ? held.get(libraryKey(mapping.kind, mapping.tmdbId)) : undefined;

    return {
      threadId: row.threadId,
      title: row.title,
      name: row.name,
      tags: tagsOf(row),
      category: row.category ?? "",
      subcategory: row.subcategory ?? "",
      publishedAt: row.publishedAt ? new Date(row.publishedAt * 1000).toISOString() : null,
      url: row.url,
      tmdb: found ? titleOf(found) : null,
      ftp: ftpOf(row),
      have: hit ? { files: hit.files.length, seasons: hit.seasons.size } : null,
    };
  });

  return c.json({ rows: out, total: out.length });
});

// CATEGORIES gives the fixed board tree; the releases table supplies the count
// per forum. A category total adds its own forum id to its child forums, so the
// navigation shows numbers ahead of the first run.
catalogRoute.get("/categories", (c) => {
  const rows = db
    .select({
      category: releases.category,
      forumId: releases.forumId,
      count: sql<number>`count(*)`,
    })
    .from(releases)
    .groupBy(releases.category, releases.forumId)
    .all();

  const byForum = new Map<number, number>();
  for (const row of rows) {
    const category = categoryOf(row.forumId ?? 0);
    if (!category || row.forumId === null) continue;
    byForum.set(row.forumId, (byForum.get(row.forumId) ?? 0) + row.count);
  }

  const categories = CATEGORIES.map((category) => {
    const forums = category.forums.map((forum) => ({
      id: forum.id,
      name: forum.name,
      releases: byForum.get(forum.id) ?? 0,
    }));
    return {
      id: category.id,
      name: category.name,
      releases: (byForum.get(category.id) ?? 0) + forums.reduce((sum, f) => sum + f.releases, 0),
      forums,
    };
  });

  return c.json({ total: categories.reduce((sum, c2) => sum + c2.releases, 0), categories });
});

catalogRoute.get("/sync", (c) => c.json({ sync: syncState(), links: linkState() }));

catalogRoute.post("/sync", (c) => {
  if (!startSync()) return c.json({ error: "Es läuft bereits ein Sync" }, 409);
  return c.json({ sync: syncState(), links: linkState() });
});

catalogRoute.post("/link", (c) => c.json({ queued: linkUnlinked() }));

catalogRoute.post("/link/stop", (c) => c.json({ dropped: stopLinking() }));

catalogRoute.get("/session", (c) => c.json(sessionState()));

// One thanks unlocks the hidden info block of the creator post. fetchAccess
// parses it and writes the ftp columns on the release row; this route answers
// with the same row through ftpOf plus the problems it collected.
catalogRoute.post("/info/:threadId", async (c) => {
  const threadId = Number.parseInt(c.req.param("threadId"), 10);
  if (!Number.isFinite(threadId)) return c.json({ error: "threadId fehlt" }, 400);

  const answer = await fetchAccess(threadId);

  if (!answer.ok) return c.json({ error: answer.error, thanks: answer.thanks }, answer.status);

  return c.json({
    ok: true,
    thanks: answer.thanks,
    host: answer.row.ftpHost ?? "",
    ftp: ftpOf(answer.row),
    problems: answer.problems,
  });
});

// Writes one mappings row with origin "manual". An id + kind body upserts
// against the stored title, a text body goes through resolveText: a unique hit
// stores its id, an ambiguous answer comes back as candidates with 409.
catalogRoute.post("/assign", async (c) => {
  const body = await c.req.json<{
    threadId?: number;
    query?: string;
    tmdbId?: number;
    kind?: "movie" | "tv";
  }>();
  const threadId = body?.threadId;
  if (!threadId) return c.json({ error: "threadId fehlt" }, 400);

  const store = (tmdbId: number, kind: "movie" | "tv") => {
    db.insert(mappings)
      .values({ threadId, tmdbId, kind, origin: "manual" })
      .onConflictDoUpdate({ target: mappings.threadId, set: { tmdbId, kind, origin: "manual" } })
      .run();
  };

  if (body.tmdbId && body.kind) {
    const stored = body.kind === "movie" ? storedMovie(body.tmdbId) : storedSeries(body.tmdbId);
    if (!stored) return c.json({ error: "Titel nicht in der Datenbank" }, 404);
    store(body.tmdbId, body.kind);
    return c.json({ ok: true });
  }

  const query = body?.query?.trim();
  if (!query) return c.json({ error: "query fehlt" }, 400);

  const found = await resolveText(query);
  if (!found) return c.json({ error: "Kein Titel gefunden" }, 404);
  if (!("tmdbId" in found)) return c.json({ candidates: found.candidates }, 409);

  store(found.tmdbId, found.kind);
  return c.json({ ok: true });
});

catalogRoute.delete("/assign/:threadId", (c) => {
  const threadId = Number.parseInt(c.req.param("threadId"), 10);
  if (!Number.isFinite(threadId)) return c.json({ error: "threadId fehlt" }, 400);
  db.delete(mappings).where(eq(mappings.threadId, threadId)).run();
  return c.json({ ok: true });
});
