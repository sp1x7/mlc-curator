import { bandLabel, probeRes } from "@shared/types/band";
import type { LibraryFile, LibrarySeason } from "@shared/types/library";
import type {
  WishEntry,
  WishEpisode,
  WishFile,
  WishIdentity,
  WishKind,
  WishMatch,
  WishSeason,
  WishStatus,
  WishTarget,
} from "@shared/types/wishlist";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { mappings, releases, wishes } from "../db/schema";
import { currentStand } from "../library/stand";
import {
  season as fetchSeason,
  storedEpisodes,
  storedMovie,
  storedSeasons,
  storedSeries,
} from "../tmdb/title";
import { releaseRes } from "../upgrades/stand";
import { indexLibrary, type LibraryHit, libraryKey } from "./library";
import { probeFits, tagFits } from "./target";

// The wish list is computed on every build: each pass measures the wishes against
// the tmdb rows, the board snapshot and the last library pass.

const SE_TAG = /^S(\d{1,3})(?:E(\d{1,3}))?$/i;
const EP_KEY = /^S(\d{1,3})E(\d{1,3})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function tagsOf(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function genresOf(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((genre): genre is string => typeof genre === "string")
      : [];
  } catch {
    return [];
  }
}

/** open, part or done, out of held and expected counts. */
function statusOf(have: number, expected: number): WishStatus {
  if (have <= 0) return "open";
  if (expected > 0 && have >= expected) return "done";
  return "part";
}

/** Joins the names as one German list. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} und ${items.at(-1)}`;
}

/** German verb form matching the count. */
function verb(count: number): string {
  return count === 1 ? "ist" : "sind";
}

/** An identity built from the tmdb id alone, every field of the title empty. */
function blankIdentity(tmdbId: number): WishIdentity {
  return {
    title: `TMDB ${tmdbId}`,
    originalTitle: null,
    year: null,
    imdbId: null,
    posterPath: null,
    overview: null,
    genres: [],
    certification: null,
    rating: null,
    voteCount: null,
    originalLanguage: null,
    productionCountry: null,
    releaseDate: null,
    seriesStatus: null,
    firstAirYear: null,
    lastAirYear: null,
    numberOfSeasons: null,
    numberOfEpisodes: null,
  };
}

/** The episode keys of a season, 1 up to the given count. */
function episodeKeys(season: number, upTo: number): string[] {
  const keys: string[] = [];
  for (let episode = 1; episode <= upTo; episode += 1) keys.push(`S${pad(season)}E${pad(episode)}`);
  return keys;
}

// What one release covers: a season tag covers the whole season, S02E05 covers
// one episode, a tv release whose tags stay season-free covers the series, a
// movie covers the film.
export function coveredOf(
  kind: WishKind,
  tags: string[],
  expectedBySeason: Map<number, number>,
): { keys: string[]; seasons: number[] } {
  if (kind === "movie") return { keys: ["*"], seasons: [] };

  const marks = tags
    .map((tag) => SE_TAG.exec(tag))
    .filter((mark): mark is RegExpExecArray => mark !== null);

  const wanted =
    marks.length === 0
      ? [...expectedBySeason.keys()].map((n) => [n, null] as const)
      : marks.map((mark) => [Number(mark[1]), mark[2] ? Number(mark[2]) : null] as const);

  const keys: string[] = [];
  const whole: number[] = [];

  for (const [season, episode] of wanted) {
    if (episode !== null) {
      keys.push(`S${pad(season)}E${pad(episode)}`);
      continue;
    }
    const count = expectedBySeason.get(season) ?? 0;
    // tmdb names zero episodes for that season, so the comparison has empty
    // ground.
    if (count <= 0) return { keys: [], seasons: [] };
    keys.push(...episodeKeys(season, count));
    whole.push(season);
  }

  return { keys, seasons: whole };
}

/** The sentence telling that the library already holds everything the release
    covers, null while it holds it partly. */
function alreadyCovered(
  kind: WishKind,
  covered: { keys: string[]; seasons: number[] },
  have: Set<string>,
): string | null {
  if (kind === "movie") return have.has("*") ? "Der Film ist bereits in der Bibliothek" : null;
  if (covered.keys.length === 0 || !covered.keys.every((key) => have.has(key))) return null;

  if (covered.seasons.length > 0) {
    const seasons = [...new Set(covered.seasons)].sort((a, b) => a - b);
    return `${listOf(seasons.map((season) => `S${pad(season)}`))} ${verb(seasons.length)} bereits vollständig in der Bibliothek`;
  }

  const keys = [...covered.keys].sort();
  const oneSeason = new Set(keys.map((key) => EP_KEY.exec(key)?.[1])).size === 1;
  const labels = keys.map((key) => {
    const mark = EP_KEY.exec(key);
    return mark ? (oneSeason ? `E${mark[2]}` : `S${mark[1]}E${mark[2]}`) : key;
  });

  return `${listOf(labels)} ${verb(labels.length)} bereits in der Bibliothek`;
}

type Stored = {
  identity: WishIdentity;
  original: string | null;
  expectedBySeason: Map<number, number>;
  posters: Map<number, string | null>;
  airBySeason: Map<number, string | null>;
};

type MovieRow = NonNullable<ReturnType<typeof storedMovie>>;
type SeriesRow = NonNullable<ReturnType<typeof storedSeries>>;

export function movieIdentity(row: MovieRow): WishIdentity {
  return {
    title: row.title,
    originalTitle: row.originalTitle,
    year: row.year,
    imdbId: row.imdbId,
    posterPath: row.posterPath,
    overview: row.overview,
    genres: genresOf(row.genres),
    certification: row.certification,
    rating: row.voteAverage,
    voteCount: row.voteCount,
    originalLanguage: row.originalLanguage,
    productionCountry: row.productionCountry,
    releaseDate: row.releaseDate,
    seriesStatus: null,
    firstAirYear: null,
    lastAirYear: null,
    numberOfSeasons: null,
    numberOfEpisodes: null,
  };
}

export function seriesIdentity(row: SeriesRow): WishIdentity {
  return {
    title: row.title,
    originalTitle: row.originalTitle,
    year: row.firstAirYear,
    imdbId: row.imdbId,
    posterPath: row.posterPath,
    overview: row.overview,
    genres: genresOf(row.genres),
    certification: row.certification,
    rating: row.voteAverage,
    voteCount: row.voteCount,
    originalLanguage: row.originalLanguage,
    productionCountry: row.productionCountry,
    releaseDate: null,
    seriesStatus: row.status,
    firstAirYear: row.firstAirYear,
    lastAirYear: row.lastAirYear,
    numberOfSeasons: row.numberOfSeasons,
    numberOfEpisodes: row.numberOfEpisodes,
  };
}

// The title of a wish as tmdb stored it; null while the title row is absent.
export function identityFor(kind: WishKind, tmdbId: number): WishIdentity | null {
  if (kind === "movie") {
    const row = storedMovie(tmdbId);
    return row ? movieIdentity(row) : null;
  }

  const row = storedSeries(tmdbId);
  return row ? seriesIdentity(row) : null;
}

// Seasons this process already asked tmdb for, so each build leaves a season that
// stayed unanswered alone.
const pulled = new Set<string>();

// The count of a series is only as good as its stored season rows: a season tmdb
// announces stays out of the target count until a fetch stores its row.
async function pullSeasons(seriesTmdbId: number, total: number): Promise<void> {
  const known = new Set(storedSeasons(seriesTmdbId).map((row) => row.seasonNumber));

  for (let number = 1; number <= total; number += 1) {
    if (known.has(number)) continue;

    const key = `${seriesTmdbId}#${number}`;
    if (pulled.has(key)) continue;
    pulled.add(key);

    try {
      await fetchSeason(seriesTmdbId, number);
    } catch {
      // tmdb answers an empty season: the season keeps an episode count of zero.
    }
  }
}

/** Identity plus the per-season target counts, posters and air dates of one wish
    title. */
async function storedFor(kind: WishKind, tmdbId: number): Promise<Stored> {
  const stored: Stored = {
    identity: blankIdentity(tmdbId),
    original: null,
    expectedBySeason: new Map(),
    posters: new Map(),
    airBySeason: new Map(),
  };

  const identity = identityFor(kind, tmdbId);
  if (identity === null) return stored;

  stored.identity = identity;
  stored.original = identity.originalLanguage;

  if (kind === "movie") return stored;

  await pullSeasons(tmdbId, identity.numberOfSeasons ?? 0);

  for (const row of storedSeasons(tmdbId)) {
    stored.expectedBySeason.set(row.seasonNumber, row.episodeCount);
    stored.posters.set(row.seasonNumber, row.posterPath);
  }

  for (const number of stored.expectedBySeason.keys()) {
    const dates = storedEpisodes(tmdbId, number)
      .map((episode) => episode.airDate)
      .filter((date): date is string => date !== null);

    if (dates.length === 0) continue;

    const sorted = [...dates].sort();
    const first = sorted[0] as string;
    const last = sorted.at(-1) as string;
    stored.airBySeason.set(number, first === last ? first : `${first} .. ${last}`);
  }

  return stored;
}

/** The video files of a season folder, samples left out. */
function mediaOf(season: LibrarySeason): LibraryFile[] {
  return season.children.filter((file) => file.video && !file.sample);
}

// Folder quality: the best file in the folder decides.
function folderQuality(season: LibrarySeason): { res: string | null; hdr: string | null } {
  let best: number | null = null;
  let hdr: string | null = null;

  for (const file of mediaOf(season)) {
    if (!file.probe) continue;
    const height = probeRes(file.probe);
    if (height !== null && (best === null || height > best)) best = height;
    if (file.probe.hdr) hdr = file.probe.hdr;
  }

  return { res: best === null ? null : bandLabel(best), hdr };
}

/** One row per season with its target count, its held count and the episode chips. */
function seasonsOf(
  target: WishTarget,
  stored: Stored,
  hit: LibraryHit | undefined,
): { rows: WishSeason[]; have: Set<string> } {
  const numbers = [...new Set([...stored.expectedBySeason.keys(), ...(hit?.seasons.keys() ?? [])])];
  const have = new Set<string>();
  const rows: WishSeason[] = [];

  for (const number of numbers.sort((a, b) => a - b)) {
    const folder = hit?.seasons.get(number) ?? null;

    // Only a file that reaches the target counts; the ones below it stay visible
    // in the folder line and out of the count.
    const at = new Map<number, string>();
    for (const file of folder ? mediaOf(folder) : []) {
      if (!file.episode || !file.probe) continue;
      if (!probeFits(target, file.probe, stored.original).ok) continue;
      if (!at.has(file.episode.number)) at.set(file.episode.number, file.name);
    }

    for (const episode of at.keys()) have.add(`S${pad(number)}E${pad(episode)}`);

    const expected = stored.expectedBySeason.get(number) ?? 0;
    const quality = folder ? folderQuality(folder) : { res: null, hdr: null };
    const chips: WishEpisode[] = [];

    for (let episode = 1; episode <= expected; episode += 1) {
      chips.push({ number: episode, have: at.has(episode), file: at.get(episode) ?? null });
    }

    rows.push({
      number,
      have: at.size,
      expected,
      status: statusOf(at.size, expected),
      path: folder?.path ?? null,
      res: quality.res,
      hdr: quality.hdr,
      air: stored.airBySeason.get(number) ?? null,
      posterPath: stored.posters.get(number) ?? folder?.posterPath ?? null,
      episodes: chips,
    });
  }

  return { rows, have };
}

/** One line per file of the movie folder, each with its fit verdict. */
function filesOf(
  hit: LibraryHit | undefined,
  target: WishTarget,
  original: string | null,
): WishFile[] {
  return (hit?.files ?? []).map((file) => {
    const check = file.probe
      ? probeFits(target, file.probe, original)
      : { ok: false, why: "keine Messung" as string | null };

    return {
      name: file.name,
      path: file.path,
      size: file.size,
      modifiedAt: file.modifiedAt,
      probe: file.probe,
      verdict: check.ok ? "ok" : "no",
      why: check.why,
    };
  });
}

/** One line per board release mapped to this title, with its fit verdict and the
    reason of a refusal. */
function matchesOf(
  kind: WishKind,
  tmdbId: number,
  target: WishTarget,
  stored: Stored,
  have: Set<string>,
): WishMatch[] {
  const rows = db
    .select({
      threadId: releases.threadId,
      title: releases.title,
      tags: releases.tags,
      subcategory: releases.subcategory,
      publishedAt: releases.publishedAt,
    })
    .from(releases)
    .innerJoin(mappings, eq(mappings.threadId, releases.threadId))
    .where(eq(mappings.tmdbId, tmdbId))
    .all();

  return rows.map((row) => {
    const tags = tagsOf(row.tags);
    const check = tagFits(target, tags, stored.original, releaseRes(row.subcategory, tags));
    const why = check.ok
      ? alreadyCovered(kind, coveredOf(kind, tags, stored.expectedBySeason), have)
      : check.why;

    return {
      threadId: row.threadId,
      title: row.title,
      tags,
      publishedAt: row.publishedAt,
      verdict: why === null ? "ok" : "no",
      why,
    };
  });
}

/** The label of the first open piece: a season, an episode range, or none. */
function missingText(
  kind: WishKind,
  seasons: WishSeason[],
  have: number,
  expected: number,
): string {
  if (kind === "movie") return have >= 1 ? "none" : "-";
  if (expected > 0 && have >= expected) return "none";

  const open = seasons.filter((season) => season.have < season.expected)[0];
  if (!open) return "none";

  const season = `S${pad(open.number)}`;
  if (open.expected === 0 || open.have + 1 > open.expected) return season;

  const from = open.have + 1;
  return from === open.expected
    ? `${season} E${pad(from)}`
    : `${season} E${pad(from)}-${pad(open.expected)}`;
}

/** Held and expected counts of a wish: files for a movie, seasons for a series. */
function progressOf(
  kind: WishKind,
  seasons: WishSeason[],
  files: WishFile[],
): { have: number; expected: number } {
  if (kind === "movie") {
    return { have: files.filter((file) => file.verdict === "ok").length, expected: 1 };
  }

  return {
    have: seasons.reduce((sum, season) => sum + season.have, 0),
    expected: seasons.reduce((sum, season) => sum + season.expected, 0),
  };
}

/** Measures every wish row against the tmdb rows, the library stand and the board
    snapshot. */
export async function buildWishes(): Promise<WishEntry[]> {
  const library = indexLibrary(currentStand().roots);
  const out: WishEntry[] = [];

  for (const row of db.select().from(wishes).all()) {
    const target: WishTarget = { minRes: row.minRes, hdr: row.hdr, audio: row.audio };
    const stored = await storedFor(row.kind, row.tmdbId);
    const hit = library.get(libraryKey(row.kind, row.tmdbId));

    const seasons =
      row.kind === "tv" ? seasonsOf(target, stored, hit) : { rows: [], have: new Set<string>() };
    const files = row.kind === "movie" ? filesOf(hit, target, stored.original) : [];
    const progress = progressOf(row.kind, seasons.rows, files);

    const have = row.kind === "movie" ? new Set(progress.have > 0 ? ["*"] : []) : seasons.have;

    out.push({
      id: row.id,
      tmdbId: row.tmdbId,
      kind: row.kind,
      target,
      note: row.note,
      createdAt: row.createdAt,
      identity: stored.identity,
      progress,
      status: statusOf(progress.have, progress.expected),
      missing: missingText(row.kind, seasons.rows, progress.have, progress.expected),
      inLibrary: progress.have > 0,
      seasons: seasons.rows,
      files,
      matches: matchesOf(row.kind, row.tmdbId, target, stored, have),
    });
  }

  return out;
}
