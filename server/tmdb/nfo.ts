import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const TMDB_RE = /<(?:tmdbid|tmdb_id)>\s*(\d+)\s*<\/(?:tmdbid|tmdb_id)>/i;
const IMDB_RE = /<(?:imdbid|imdb_id)>\s*(tt\d{7,8})\s*<\/(?:imdbid|imdb_id)>/i;
// Newer nfo files keep the numbers in uniqueid elements, Plex in guid elements.
const UNIQUE_ID_RE = /<uniqueid[^>]*type="(tmdb|movie|tv|imdb)"[^>]*>\s*([^\s<]+)\s*<\/uniqueid>/gi;
const GUID_RE = /<guid>\s*(tmdb-movie|tmdb-tv|tmdb|imdb):\/\/([^\s<]+)\s*<\/guid>/i;
const TITLE_RE = /<(?:title|name)>([^<]{2,200})<\/(?:title|name)>/i;
// An episode nfo names the series it belongs to, that is the searchable title.
const SHOW_TITLE_RE = /<showtitle>([^<]{2,200})<\/showtitle>/i;
const SHOW_ID_RE =
  /<showid[^>]*>\s*(?:(?:tmdb|themoviedb)[\s._-]*(\d{1,9})|(tt\d{7,8})|(\d{1,9}))\s*<\/showid>/i;
const YEAR_RE = /<(?:year|premiered|firstaired|aired-id)>\s*(19\d{2}|20\d{2})/i;
const SEASON_RE = /<season>\s*(\d{1,2})\s*<\/season>/i;
const EPISODE_RE = /<episode>\s*(\d{1,3})\s*<\/episode>/i;

export interface NfoContent {
  file: string;
  // The element the file is built from; a <season> file and other shapes answer
  // null for movie versus series.
  kind: "movie" | "tv" | "episode" | null;
  // Which table a number inside the file belongs to, when the file says so.
  numberKind: "movie" | "tv" | null;
  tmdbId: number | null;
  imdbId: string | null;
  title: string | null;
  showTitle: string | null;
  year: number | null;
  season: number | null;
  episode: number | null;
}

/** Reads ids, kind and numbers out of nfo text, uniqueid and guid elements
    first. */
export function parseNfoText(file: string, text: string): NfoContent {
  let tmdbId: number | null = null;
  let imdbId: string | null = null;
  let numberKind: "movie" | "tv" | null = null;

  for (const match of text.matchAll(UNIQUE_ID_RE)) {
    const type = (match[1] ?? "").toLowerCase();
    const value = match[2] ?? "";

    if (type === "imdb") {
      if (!imdbId) imdbId = value;
      continue;
    }

    if (!tmdbId) {
      tmdbId = Number(value) || null;
      if (type === "movie") numberKind = "movie";
      if (type === "tv") numberKind = "tv";
    }
  }

  const guid = GUID_RE.exec(text);
  if (guid) {
    const scheme = (guid[1] ?? "").toLowerCase();
    const value = guid[2] ?? "";

    if (scheme === "imdb") {
      if (!imdbId) imdbId = value;
    } else if (!tmdbId) {
      tmdbId = Number(value) || null;
      if (scheme === "tmdb-movie") numberKind = "movie";
      if (scheme === "tmdb-tv") numberKind = "tv";
    }
  }

  if (!tmdbId) tmdbId = Number(TMDB_RE.exec(text)?.[1] ?? "") || null;
  if (!imdbId) imdbId = IMDB_RE.exec(text)?.[1] ?? null;

  // The series of an episode file is a tv entry, its number belongs to tv.
  const showId = SHOW_ID_RE.exec(text);
  if (showId) {
    if (!tmdbId) {
      const number = Number(showId[1] ?? showId[3] ?? "") || null;
      if (number) {
        tmdbId = number;
        numberKind = "tv";
      }
    }
    if (!imdbId && showId[2]) {
      imdbId = showId[2];
      numberKind = "tv";
    }
  }

  const kind = /<episodedetails/i.test(text)
    ? "episode"
    : /<tvshow|<episode_list|<season[\s>]/i.test(text)
      ? "tv"
      : /<movie[\s>]/i.test(text)
        ? "movie"
        : null;

  return {
    file,
    kind,
    numberKind,
    tmdbId,
    imdbId,
    title: TITLE_RE.exec(text)?.[1]?.trim() ?? null,
    showTitle: SHOW_TITLE_RE.exec(text)?.[1]?.trim() ?? null,
    year: Number(YEAR_RE.exec(text)?.[1] ?? "") || null,
    season: Number(SEASON_RE.exec(text)?.[1] ?? "") || null,
    episode: Number(EPISODE_RE.exec(text)?.[1] ?? "") || null,
  };
}

/** The nfo files of a folder: the one named after the folder, plus movie, tvshow
    and season. */
function folderNfos(folder: string): string[] {
  const name = basename(folder);
  const found: string[] = [];

  for (const candidate of [name, "movie", "tvshow", "season"]) {
    const path = join(folder, `${candidate}.nfo`);
    if (existsSync(path)) found.push(path);
  }

  return found;
}

// The nfo itself, the sidecar of a video, or the nfo files of a folder.
export function nfoFilesOf(entry: string): string[] {
  if (!existsSync(entry)) return [];

  if (statSync(entry).isDirectory()) return folderNfos(entry);

  // An nfo file also belongs to a folder with tvshow.nfo / season.nfo.
  if (/\.nfo$/i.test(entry)) return [entry, ...folderNfos(dirname(entry))];

  const sidecar = `${entry.replace(/\.[a-z0-9]{2,5}$/i, "")}.nfo`;
  const found = existsSync(sidecar) ? [sidecar] : [];

  return [...found, ...folderNfos(dirname(entry))];
}

/** Reads every nfo of the entry and keeps the ones that carry an id or a
    title. */
export function contentsOfNfo(entry: string): NfoContent[] {
  const list: NfoContent[] = [];

  for (const file of nfoFilesOf(entry)) {
    const content = parseNfoText(file, readFileSync(file, "utf8"));
    if (content.tmdbId || content.imdbId || content.title || content.showTitle) list.push(content);
  }

  return list;
}
