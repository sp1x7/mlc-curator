// One name in, one tmdb title out.
//
// Order: number in the name or nfo file -> stored titles -> tmdb search with
// the gates (T title identity, Y year as disambiguator only, E episode list).
// Exactly one survivor links, several survivors stay candidates, and an empty
// list ends the search.

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { norm } from "@shared/types/text";
import {
  type Answer,
  candidateNames,
  candidateSeasons,
  candidateYear,
  details,
  genreOk,
  imdbOf,
  type Kind,
  titleOk,
} from "./gates";
import { FILE_LIKE_RE, type NameTokens, tokensOf } from "./name";
import { contentsOfNfo, type NfoContent, parseNfoText } from "./nfo";
import { findByImdbId, prefilter, searchResults } from "./search";
import { cleanName } from "./text";
import {
  allMovies,
  allSeries,
  type EpisodeRow,
  findStoredMovieByImdbId,
  findStoredSeriesByImdbId,
  type MovieRow,
  movie,
  type SeasonRow,
  type SeriesRow,
  season,
  series,
  storedEpisodes,
  storedSeasons,
} from "./title";

export type TitleRow = MovieRow | SeriesRow;

export interface Hit {
  kind: Kind;
  tmdbId: number;
  row: TitleRow;
  seasonNumber: number | null;
  seasonRow: SeasonRow | null;
  episodes: EpisodeRow[];
}

export interface Candidate {
  kind: Kind;
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterPath: string | null;
  voteCount: number;
}

// A hit when one title fits, a candidate list when several fit, null when the
// search ends with an empty list.
export type Found = Hit | { kind: Kind; candidates: Candidate[] } | null;

interface Survivor {
  kind: Kind;
  tmdbId: number;
  display: string;
  original: string | null;
  names: Set<string>;
  year: string;
  votes: number;
  poster: string | null;
  answer: Answer | null;
  seasons: Map<number, number>;
  exact: boolean;
  prefix: boolean;
  yearOk: boolean | null;
  titleOk: boolean;
  episodeOk: boolean;
}

interface Source {
  text: string;
  nfos: NfoContent[];
  missingFile: boolean;
}

// The folder of an nfo file is part of the library path and carries the title.
function folderOf(file: string): string {
  const parent = dirname(file);
  return parent === "." ? "" : parent;
}

// An entry starting with @ reads its input from the named file. An nfo file is
// read as nfo content, any other file as one name per line.
function sourceOf(entry: string): Source {
  if (entry.startsWith("@")) {
    const file = entry.slice(1).trim();
    if (!existsSync(file)) return { text: "", nfos: [], missingFile: true };

    if (/\.nfo$/i.test(file)) {
      const own = parseNfoText(file, readFileSync(file, "utf8"));
      const nfos = [own, ...contentsOfNfo(file).filter((other) => other.file !== file)];
      const usable = nfos.some((nfo) => nfo.tmdbId || nfo.imdbId || nfo.title || nfo.showTitle);
      return { text: folderOf(file), nfos: usable ? nfos : [], missingFile: false };
    }

    const line =
      readFileSync(file, "utf8")
        .split("\n")
        .map((value) => value.trim())
        .find(Boolean) ?? "";

    return { text: line, nfos: contentsOfNfo(line), missingFile: false };
  }

  // A path to an nfo file still names its folder, and that folder is the title.
  if (/\.nfo$/i.test(entry))
    return { text: folderOf(entry), nfos: contentsOfNfo(entry), missingFile: false };

  // A path that ends in a file is that file itself. In flat mode the file
  // carries the title: only the group folder stands around it, and that folder
  // would be searched as the title of every file.
  const last = basename(entry);
  if (entry.includes("/") && FILE_LIKE_RE.test(last))
    return { text: last, nfos: contentsOfNfo(entry), missingFile: false };

  return { text: entry, nfos: contentsOfNfo(entry), missingFile: false };
}

// Numbers inside an nfo file and its root element steer what is asked for.
function mergeTokens(pathTokens: NameTokens, nfos: NfoContent[]): NameTokens {
  const nfoTitle = nfos.map((nfo) => nfo.title).find((title) => title !== null) ?? "";
  const nfoShow = nfos.map((nfo) => nfo.showTitle).find((title) => title !== null) ?? "";
  // An episode air date names the date of one episode; the year of the series
  // comes from a show-level element.
  const nfoYear =
    nfos.map((nfo) => (nfo.kind === "episode" ? null : nfo.year)).find((value) => value !== null) ??
    null;
  const nfoSeason = nfos.map((nfo) => nfo.season).find((value) => value !== null) ?? null;
  const nfoEpisode = nfos.map((nfo) => nfo.episode).find((value) => value !== null) ?? null;

  return {
    raw: pathTokens.raw,
    query: pathTokens.query || nfoShow || nfoTitle,
    year: pathTokens.year ?? nfoYear,
    season: pathTokens.season ?? nfoSeason,
    episodes:
      pathTokens.episodes.length > 0
        ? pathTokens.episodes
        : nfoEpisode === null
          ? []
          : [nfoEpisode],
    genres: pathTokens.genres,
    tmdbId:
      pathTokens.tmdbId ?? nfos.map((nfo) => nfo.tmdbId).find((value) => value !== null) ?? null,
    imdbId:
      pathTokens.imdbId ?? nfos.map((nfo) => nfo.imdbId).find((value) => value !== null) ?? null,
  };
}

function kindsFor(tokens: NameTokens, nfos: NfoContent[], kindHint: Kind | null): Kind[] {
  // Season and episode numbers make it a series, only an nfo file that says
  // movie out loud may contradict that.
  if (tokens.season !== null || tokens.episodes.length > 0) {
    return nfos.some((nfo) => nfo.kind === "movie" || nfo.numberKind === "movie")
      ? ["movie"]
      : ["tv"];
  }

  if (nfos.some((nfo) => nfo.numberKind === "tv" || nfo.kind === "tv" || nfo.kind === "episode")) {
    return ["tv"];
  }
  if (nfos.some((nfo) => nfo.numberKind === "movie" || nfo.kind === "movie")) return ["movie"];
  // Name and nfo stay silent: the group folder the entry sits in decides. A
  // series is expected in the series folder, a movie in the movie folder, and
  // searching both lets the wrong one of the two win on a shared title.
  if (kindHint) return [kindHint];
  return ["movie", "tv"];
}

function storedSeasonMap(seriesTmdbId: number): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of storedSeasons(seriesTmdbId)) map.set(row.seasonNumber, row.episodeCount ?? 0);
  return map;
}

// Y is a disambiguator: a remaster year one year off still fits the title.
function yearFits(candidate: string, wanted: string | null): boolean | null {
  if (!wanted) return null;
  if (!candidate) return null;
  if (candidate === wanted) return true;
  if (/^\d{4}$/.test(candidate) && /^\d{4}$/.test(wanted)) {
    return Math.abs(Number(candidate) - Number(wanted)) <= 1;
  }
  return false;
}

// E is hard only for concrete episodes: tmdb season data lags behind.
function episodesExist(
  seasons: Map<number, number>,
  tokens: NameTokens,
): { ok: boolean; missing: string[] } {
  if (tokens.episodes.length > 0 && tokens.season !== null) {
    const seasonNumber = tokens.season;
    const missing = tokens.episodes
      .filter((episodeNumber) => (seasons.get(seasonNumber) ?? 0) < episodeNumber)
      .map((episodeNumber) => `S${seasonNumber}E${episodeNumber}`);
    return { ok: missing.length === 0, missing };
  }

  if (tokens.season !== null) return { ok: seasons.has(tokens.season), missing: [] };

  if (tokens.episodes.length > 0) {
    const highest = Math.max(...tokens.episodes);
    return { ok: [...seasons.values()].some((count) => count >= highest), missing: [] };
  }

  return { ok: true, missing: [] };
}

function storedSurvivors(kind: Kind, compare: string, tokens: NameTokens): Survivor[] {
  const rows: (MovieRow | SeriesRow)[] = kind === "movie" ? allMovies() : allSeries();
  const survivors: Survivor[] = [];

  for (const row of rows) {
    const names = new Set([norm(row.title), norm(row.originalTitle ?? "")].filter(Boolean));
    const year = String(
      kind === "movie" ? ((row as MovieRow).year ?? "") : ((row as SeriesRow).firstAirYear ?? ""),
    );
    const seasons = kind === "tv" ? storedSeasonMap(row.tmdbId) : new Map<number, number>();

    survivors.push({
      kind,
      tmdbId: row.tmdbId,
      display: row.title,
      original: row.originalTitle,
      names,
      year,
      votes: row.voteCount ?? 0,
      poster: row.posterPath,
      answer: null,
      seasons,
      exact: names.has(compare),
      prefix: [...names].some((name) => name.startsWith(`${compare} `)),
      yearOk: yearFits(year, tokens.year === null ? null : String(tokens.year)),
      titleOk: titleOk(compare, names),
      episodeOk: episodesExist(seasons, tokens).ok,
    });
  }

  return survivors;
}

async function tmdbSurvivors(
  kind: Kind,
  searchName: string,
  compare: string,
  tokens: NameTokens,
): Promise<Survivor[]> {
  const results = prefilter(
    await searchResults(
      kind,
      searchName,
      tokens.year === null ? null : String(tokens.year),
      compare,
    ),
    compare,
  );
  // Each answer stands on its own, so the requests go out together and the
  // client's six slots pace them. The order of `results` is kept.
  const detailed = await Promise.all(
    results.map(async (result) => ({
      tmdbId: result.id as number,
      answer: await details(kind, result.id as number),
    })),
  );
  const survivors: Survivor[] = [];

  for (const { tmdbId, answer } of detailed) {
    if (!answer) continue;

    const names = candidateNames(answer);
    const year = candidateYear(answer);

    survivors.push({
      kind,
      tmdbId,
      display: (answer.title ?? answer.name ?? "").trim(),
      original: (answer.original_title ?? answer.original_name ?? "").trim() || null,
      names,
      year,
      votes: answer.vote_count ?? 0,
      poster: answer.poster_path ?? null,
      answer,
      seasons: candidateSeasons(answer),
      exact: names.has(compare),
      prefix: [...names].some((name) => name.startsWith(`${compare} `)),
      yearOk: yearFits(year, tokens.year === null ? null : String(tokens.year)),
      titleOk: titleOk(compare, names),
      episodeOk: episodesExist(candidateSeasons(answer), tokens).ok,
    });
  }

  return survivors;
}

function candidateOf(survivor: Survivor): Candidate {
  return {
    kind: survivor.kind,
    tmdbId: survivor.tmdbId,
    title: survivor.display,
    originalTitle: survivor.original,
    year: /^\d{4}$/.test(survivor.year) ? Number(survivor.year) : null,
    posterPath: survivor.poster,
    voteCount: survivor.votes,
  };
}

// TMDB duplicates (German entry plus original) share a name; the entry with
// the most votes is the canonical one.
function duplicateGroup(survivors: Survivor[]): Survivor[] {
  const parent = Array.from({ length: survivors.length }, (_, index) => index);
  const find = (index: number): number => {
    for (;;) {
      const up = parent[index];
      if (up === undefined || up === index) return index;
      parent[index] = parent[up] ?? up;
      index = parent[index] ?? index;
    }
  };

  const byName = new Map<string, number>();
  survivors.forEach((survivor, index) => {
    for (const name of survivor.names) {
      if (!name) continue;
      const known = byName.get(name);

      if (known === undefined) {
        byName.set(name, index);
        continue;
      }

      const left = find(known);
      const right = find(index);
      if (left !== right) parent[left] = right;
    }
  });

  const groups = new Map<number, Survivor[]>();
  survivors.forEach((survivor, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(survivor);
    groups.set(root, group);
  });

  return [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
}

// A list of exactly one: its element.
function single<T>(items: T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

async function pickWinner(survivors: Survivor[], tokens: NameTokens): Promise<Survivor | null> {
  let strict = survivors.filter((survivor) => survivor.titleOk && survivor.episodeOk);

  const oneStrict = single(strict);
  if (oneStrict) return oneStrict;
  if (strict.length === 0) return null;

  const exact = strict.filter((survivor) => survivor.exact);
  const oneExact = single(exact);
  if (oneExact) return oneExact;
  if (exact.length > 1) strict = exact;

  const prefixed = strict.filter((survivor) => survivor.prefix);
  const onePrefixed = single(prefixed);
  if (onePrefixed) return onePrefixed;

  if (tokens.year !== null && strict.length > 1) {
    // The year sits inside the title of the entry ("FIFA World Cup (1954)").
    const titleYear = strict.filter((survivor) =>
      survivor.display.split(" ").includes(String(tokens.year)),
    );
    const oneTitleYear = single(titleYear);
    if (oneTitleYear) return oneTitleYear;

    const exactYear = strict.filter((survivor) => survivor.year === String(tokens.year));
    const oneExactYear = single(exactYear);
    if (oneExactYear) return oneExactYear;

    const yearFitsOn = strict.filter((survivor) => survivor.yearOk !== false);
    const oneYearFits = single(yearFitsOn);
    if (oneYearFits) return oneYearFits;
    if (yearFitsOn.length > 1) strict = yearFitsOn;
  }

  if (strict.length > 1) {
    const group = duplicateGroup(strict);
    if (group.length > 1) {
      const best = [...group].sort((a, b) => b.votes - a.votes)[0];
      if (best) return best;
    }
  }

  if (strict.length > 1) {
    // The same imdb id marks the same work across every duplicate.
    const byImdb = new Map<string, Survivor>();
    let everyOneHas = true;

    for (const survivor of strict) {
      const imdb = await imdbOf(survivor.kind, survivor.tmdbId);
      if (!imdb) {
        everyOneHas = false;
        break;
      }
      if (!byImdb.has(imdb)) byImdb.set(imdb, survivor);
    }

    if (everyOneHas && byImdb.size === 1) {
      const [only] = [...byImdb.values()];
      if (only) return only;
    }
  }

  const genreKept: Survivor[] = [];
  for (const survivor of strict) {
    if (!survivor.answer || (await genreOk(survivor.answer, tokens.genres)))
      genreKept.push(survivor);
  }
  const oneGenre = single(genreKept);
  if (oneGenre) return oneGenre;
  if (genreKept.length > 1 && genreKept.length < strict.length) strict = genreKept;

  return null;
}

// Season and episode rows belong to a hit when the name or nfo names them.
async function hitOf(kind: Kind, tmdbId: number, row: TitleRow, tokens: NameTokens): Promise<Hit> {
  const seasonNumber = kind === "tv" ? tokens.season : null;

  if (seasonNumber === null) {
    return { kind, tmdbId, row, seasonNumber: null, seasonRow: null, episodes: [] };
  }

  const answer = await season(tmdbId, seasonNumber);

  return {
    kind,
    tmdbId,
    row,
    seasonNumber,
    seasonRow: answer?.season ?? null,
    episodes: (answer?.episodes ?? []).filter(
      (episodeRow) =>
        tokens.episodes.length === 0 || tokens.episodes.includes(episodeRow.episodeNumber),
    ),
  };
}

async function storedHit(kind: Kind, tmdbId: number, tokens: NameTokens): Promise<Hit | null> {
  const row = kind === "tv" ? await series(tmdbId) : await movie(tmdbId);
  return row ? hitOf(kind, tmdbId, row, tokens) : null;
}

// The nfo file decides which table a number belongs to, ahead of any trial over
// both tables.
function numberOrder(tokens: NameTokens, nfos: NfoContent[]): Kind[] {
  const saysTv = nfos.some(
    (nfo) =>
      nfo.numberKind === "tv" ||
      nfo.kind === "tv" ||
      nfo.kind === "episode" ||
      nfo.showTitle !== null,
  );
  const saysMovie = nfos.some((nfo) => nfo.numberKind === "movie" || nfo.kind === "movie");

  if (saysTv && !saysMovie) return ["tv"];
  if (saysMovie && !saysTv) return ["movie"];
  if (tokens.season !== null || tokens.episodes.length > 0) return ["tv", "movie"];
  return ["movie", "tv"];
}

// A tmdb or imdb number in the name or inside an nfo file settles the title.
async function hitByNumber(tokens: NameTokens, nfos: NfoContent[]): Promise<Found> {
  const order: Kind[] = numberOrder(tokens, nfos);

  const tmdbNumbers = [tokens.tmdbId, ...nfos.map((nfo) => nfo.tmdbId)].filter(
    (value): value is number => value !== null,
  );
  const imdbNumbers = [tokens.imdbId, ...nfos.map((nfo) => nfo.imdbId)].filter(
    (value): value is string => value !== null,
  );

  for (const tmdbId of tmdbNumbers) {
    for (const kind of order) {
      const row = kind === "tv" ? await series(tmdbId) : await movie(tmdbId);
      if (row) return hitOf(kind, tmdbId, row, tokens);
    }
  }

  for (const imdbId of imdbNumbers) {
    for (const kind of order) {
      const stored =
        kind === "tv" ? findStoredSeriesByImdbId(imdbId) : findStoredMovieByImdbId(imdbId);
      if (stored) return hitOf(kind, stored.tmdbId, stored, tokens);
    }

    const found = await findByImdbId(imdbId);
    const kindOf = (entry: Answer): Kind => (entry.media_type === "tv" ? "tv" : "movie");
    const unique = new Map<number, Answer>();
    for (const entry of found) {
      if (entry.id != null && !unique.has(entry.id)) unique.set(entry.id, entry);
    }

    const entries = [...unique.values()];
    const [first] = entries;

    if (first && unique.size === 1) {
      return storedHit(kindOf(first), first.id as number, tokens);
    }

    if (first && unique.size > 1) {
      return {
        kind: kindOf(first),
        candidates: entries.map((entry) => ({
          kind: kindOf(entry),
          tmdbId: entry.id as number,
          title: (entry.title ?? entry.name ?? "").trim(),
          originalTitle: (entry.original_title ?? entry.original_name ?? "").trim() || null,
          year: /^\d{4}$/.test(candidateYear(entry)) ? Number(candidateYear(entry)) : null,
          posterPath: entry.poster_path ?? null,
          voteCount: entry.vote_count ?? 0,
        })),
      };
    }
  }

  return null;
}

/** The chain for one entry: number first, then stored rows, then tmdb search
    with the gates. */
async function resolveInner(entry: string, kindHint: Kind | null): Promise<Found> {
  const source = sourceOf(entry);
  if (source.missingFile) return null;

  const tokens = mergeTokens(tokensOf(source.text), source.nfos);

  const byNumber = await hitByNumber(tokens, source.nfos);
  if (byNumber) return byNumber;

  // An entry whose query text ends up empty has nothing left to search.
  if (!tokens.query) return null;

  const searchName = tokens.query;
  const compare = norm(cleanName(searchName) || searchName);

  const kinds = kindsFor(tokens, source.nfos, kindHint);

  const stored = kinds.flatMap((kind) => storedSurvivors(kind, compare, tokens));
  const survivors = stored.filter((survivor) => survivor.titleOk && survivor.episodeOk);

  if (survivors.length === 0) {
    for (const kind of kinds)
      survivors.push(...(await tmdbSurvivors(kind, searchName, compare, tokens)));
  }

  if (survivors.length === 0) return null;

  const winner = await pickWinner(survivors, tokens);
  if (!winner) {
    const showing = survivors.filter((survivor) => survivor.titleOk);
    const [first] = showing;
    return first ? { kind: first.kind, candidates: showing.map(candidateOf) } : null;
  }

  const hit = await storedHit(winner.kind, winner.tmdbId, tokens);
  if (hit && winner.kind === "tv" && tokens.season !== null && tokens.episodes.length > 0) {
    const present = new Set(hit.episodes.map((episodeRow) => episodeRow.episodeNumber));
    if (!tokens.episodes.every((episodeNumber) => present.has(episodeNumber))) return null;
  }

  return hit;
}

/** Runs the chain and answers null for every failure on the way. */
export async function resolveText(text: string, kindHint: Kind | null = null): Promise<Found> {
  try {
    return await resolveInner(text, kindHint);
  } catch {
    return null;
  }
}

/** Episode numbers 1..expectedCount whose rows the stored season still lacks. */
export function missingEpisodes(
  seriesTmdbId: number,
  seasonNumber: number,
  expectedCount: number,
): number[] {
  const present = new Set(
    storedEpisodes(seriesTmdbId, seasonNumber).map((row) => row.episodeNumber),
  );
  const missing: number[] = [];

  for (let episodeNumber = 1; episodeNumber <= expectedCount; episodeNumber += 1) {
    if (!present.has(episodeNumber)) missing.push(episodeNumber);
  }

  return missing;
}
