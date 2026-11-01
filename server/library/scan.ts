import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  LibraryFile,
  LibraryRoot,
  LibrarySeason,
  LibraryTitle,
  NameInfo,
  TmdbEpisode,
  TmdbTitle,
} from "@shared/types/library";
import { type Subfolders, subfolders } from "../downloads/config";
import type { Kind } from "../tmdb/gates";
import { parseName } from "../tmdb/name";
import { contentsOfNfo } from "../tmdb/nfo";
import { type Hit, resolveText } from "../tmdb/resolve";
import { genreNames } from "../tmdb/store";
import {
  certificationOf,
  type EpisodeRow,
  type MovieRow,
  movie,
  type SeasonRow,
  type SeriesRow,
  season,
  series,
} from "../tmdb/title";
import { nameInfoOf } from "./name-info";
import { ffprobeExists, probeFile } from "./probe";
import { libraryRoot } from "./root";

export const VIDEO_EXTENSIONS = new Set([
  "mkv",
  "mp4",
  "m4v",
  "avi",
  "mov",
  "webm",
  "ts",
  "m2ts",
  "mts",
  "flv",
  "wmv",
  "mpg",
  "mpeg",
  "divx",
]);

export const SEASON_FOLDER_RE = /^(?:staffel|season)[\s._-]*(\d{1,2})$/i;

// Extras that sit next to the real files: a video carrying the release name,
// while title and episode stay with the release itself.
export const SAMPLE_RE = /(?:^|[\s._([-])(?:sample|trailer)(?:$|[\s._)\]-])/i;

// Jellyfin writes its trickplay tiles into a folder of that name.
export const TRICKPLAY_RE = /\.trickplay$/i;

export interface ScanHooks {
  onFolder(): void;
  onFile(): void;
  onProbed(ok: boolean): void;
  onTmdb(found: boolean): void;
  // Called once the folders are walked, before the measuring starts.
  onTree(roots: LibraryRoot[]): void;
}

/** Extension test against VIDEO_EXTENSIONS, case aside. */
function isVideo(name: string): boolean {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return VIDEO_EXTENSIONS.has(extension);
}

/** Path below the library root, `/` as separator. */
function relativeOf(root: string, file: string): string {
  return file
    .slice(root.length + 1)
    .split(/[\\/]/)
    .join("/");
}

/** German collation with numbers read as numbers, the order the tree shows. */
function sortByName(nodes: Array<{ name: string }>): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }));
}

// A cover or an nfo file keeps every read-out field empty.
const NOT_NAMED: NameInfo = {
  episodeLabel: null,
  season: null,
  episodes: [],
  quality: null,
  codec: null,
  hdr: null,
  audio: null,
  group: null,
};

// Files below a title folder, however deep they sit. The season folders are
// left out: their files belong to the season node.
async function filesUnder(
  root: string,
  folder: string,
  hooks: ScanHooks,
  skip: Set<string>,
): Promise<LibraryFile[]> {
  const found: LibraryFile[] = [];

  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);

    if (entry.isDirectory()) {
      if (skip.has(full) || TRICKPLAY_RE.test(entry.name)) continue;
      hooks.onFolder();
      found.push(...(await filesUnder(root, full, hooks, skip)));
      continue;
    }

    if (!entry.isFile()) continue;

    const info = await stat(full);
    found.push({
      type: "file",
      name: entry.name,
      path: relativeOf(root, full),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
      video: isVideo(entry.name),
      sample: isVideo(entry.name) && SAMPLE_RE.test(entry.name),
      probe: null,
      probeFailed: false,
      nameInfo: isVideo(entry.name) ? nameInfoOf(entry.name) : NOT_NAMED,
      flat: false,
      tmdb: null,
      episode: null,
    });
    hooks.onFile();
  }

  sortByName(found);
  return found;
}

async function seasonFoldersOf(folder: string): Promise<Array<{ name: string; number: number }>> {
  const found: Array<{ name: string; number: number }> = [];

  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const number = SEASON_FOLDER_RE.exec(entry.name)?.[1];
    if (number) found.push({ name: entry.name, number: Number(number) });
  }

  found.sort((a, b) => a.number - b.number);
  return found;
}

interface Hint {
  tmdbId: number | null;
  imdbId: string | null;
  from: "name" | "nfo" | null;
}

// A number in the folder or file name, or one inside an nfo file.
function hintOf(name: string, entry: string): Hint {
  const tokens = parseName(name);
  if (tokens.tmdbId !== null || tokens.imdbId !== null) {
    return { tmdbId: tokens.tmdbId, imdbId: tokens.imdbId, from: "name" };
  }

  for (const nfo of contentsOfNfo(entry)) {
    if (nfo.tmdbId !== null || nfo.imdbId !== null) {
      return { tmdbId: nfo.tmdbId, imdbId: nfo.imdbId, from: "nfo" };
    }
  }

  return { tmdbId: null, imdbId: null, from: null };
}

/** The stored movie row shaped into the title payload of the tree. */
function movieTitle(row: MovieRow, certification: string | null): TmdbTitle {
  return {
    kind: "movie",
    tmdbId: row.tmdbId,
    imdbId: row.imdbId,
    title: row.title,
    originalTitle: row.originalTitle,
    year: row.year,
    overview: row.overview,
    rating: row.voteAverage,
    voteCount: row.voteCount,
    genres: genreNames(row.genres),
    certification,
    seasonsExpected: null,
    posterPath: row.posterPath,
    backdropPath: row.backdropPath,
  };
}

/** The stored series row shaped into the title payload of the tree. */
function seriesTitle(row: SeriesRow, certification: string | null): TmdbTitle {
  return {
    kind: "series",
    tmdbId: row.tmdbId,
    imdbId: row.imdbId,
    title: row.title,
    originalTitle: row.originalTitle,
    year: row.firstAirYear,
    overview: row.overview,
    rating: row.voteAverage,
    voteCount: row.voteCount,
    genres: genreNames(row.genres),
    certification,
    seasonsExpected: row.numberOfSeasons,
    posterPath: row.posterPath,
    backdropPath: row.backdropPath,
  };
}

/** Episode row renamed to the field names of the tree. */
function toEpisode(row: EpisodeRow): TmdbEpisode {
  return {
    season: row.seasonNumber,
    number: row.episodeNumber,
    name: row.name,
    originalName: row.originalName,
    airDate: row.airDate,
    runtimeMinutes: row.runtimeMinutes,
    overview: row.overview,
    stillPath: row.stillPath,
  };
}

/** Season name, year and expected episode count of a season; the number of tmdb
 *  episode rows stands in when the season row is absent. */
function seasonFields(
  row: SeasonRow | null,
  episodes: EpisodeRow[],
): {
  tmdbName: string | null;
  year: number | null;
  expected: number;
} {
  return {
    tmdbName: row?.name ?? null,
    year: row?.year ?? null,
    expected: row?.episodeCount ?? episodes.length,
  };
}

// The group folder says what kind is expected inside it: series in the series
// folder, movies in the movie folder. Only an nfo file and season or episode
// numbers in the name outrank it; "Unsortiert" and unknown folders answer null.
function kindOfGroup(group: string, groups: Subfolders): Kind | null {
  if (group === groups.movies) return "movie";
  if (group === groups.series) return "tv";
  return null;
}

// The resolver decides: number in the name or nfo first, then the stored titles,
// then a tmdb search with its gates.
async function fillTitle(
  title: LibraryTitle,
  folder: string,
  hooks: ScanHooks,
  kindHint: Kind | null,
): Promise<void> {
  const found = await resolveText(folder, kindHint);
  hooks.onTmdb(found !== null && "row" in found);
  if (!found || !("row" in found)) return;

  const hit: Hit = found;
  title.kind = hit.kind === "movie" ? "movie" : "series";

  // A stored row whose genres column stands empty is fetched again in full
  // detail.
  const row =
    hit.kind === "movie"
      ? (hit.row as MovieRow).genres !== null
        ? (hit.row as MovieRow)
        : ((await movie(hit.tmdbId, true)) ?? (hit.row as MovieRow))
      : (hit.row as SeriesRow).genres !== null
        ? (hit.row as SeriesRow)
        : ((await series(hit.tmdbId, true)) ?? (hit.row as SeriesRow));

  const certification = await certificationOf(hit.kind === "movie" ? "movie" : "tv", hit.tmdbId);

  title.tmdb =
    hit.kind === "movie"
      ? movieTitle(row as MovieRow, certification)
      : seriesTitle(row as SeriesRow, certification);

  if (hit.kind !== "tv") {
    // The files next to a movie belong to that movie: the folder holds one
    // title.
    for (const child of title.children) {
      if (child.type === "file" && child.video && !child.sample) child.tmdb = title.tmdb;
    }
    return;
  }

  for (const child of title.children) {
    if (child.type !== "season" || child.number === null) continue;
    await fillSeason(hit.tmdbId, child, child.number);
  }
}

/** Fills one season node with its tmdb episodes and matches the files of the
    season onto them. */
async function fillSeason(
  seriesTmdbId: number,
  child: LibrarySeason,
  number: number,
): Promise<void> {
  const answer = await season(seriesTmdbId, number);
  const rows = answer?.episodes ?? [];
  const fields = seasonFields(answer?.season ?? null, rows);

  child.tmdbName = fields.tmdbName;
  child.year = fields.year;
  child.expected = fields.expected;
  child.episodes = rows.map(toEpisode);
  child.posterPath = answer?.season?.posterPath ?? null;
  child.airDate = rows[0]?.airDate ?? null;
  child.overview = rows[0]?.overview ?? null;

  for (const file of child.children) {
    if (file.sample) continue;
    const number = file.nameInfo.episodes[0];
    const found = rows.find((rowOfSeason) => rowOfSeason.episodeNumber === number);
    if (found) file.episode = toEpisode(found);
  }
}

/** Resolves one loose video file of a group folder and attaches its movie. */
async function fillFlatFile(
  root: string,
  file: LibraryFile,
  hooks: ScanHooks,
  kindHint: Kind | null,
): Promise<void> {
  if (!file.flat || file.sample) return;

  const found = await resolveText(join(root, file.path), kindHint);
  hooks.onTmdb(found !== null && "row" in found);
  if (!found || !("row" in found)) return;

  file.tmdb = movieTitle(found.row as MovieRow, await certificationOf("movie", found.tmdbId));
}

/** True when a title folder holds a video of its own. */
export function holdsVideo(title: LibraryTitle): boolean {
  return title.children.some((child) =>
    child.type === "file"
      ? child.video && !child.sample
      : child.children.some((file) => file.video && !file.sample),
  );
}

/** Builds one title node: season folders first, then the files that sit outside
    them. */
async function buildTitle(
  root: string,
  folder: string,
  name: string,
  hooks: ScanHooks,
): Promise<LibraryTitle> {
  hooks.onFolder();

  const title: LibraryTitle = {
    type: "title",
    kind: "other",
    name,
    path: relativeOf(root, folder),
    hint: hintOf(name, folder),
    tmdb: null,
    children: [],
  };

  const seasonFolders = await seasonFoldersOf(folder);

  for (const seasonFolder of seasonFolders) {
    const seasonPath = join(folder, seasonFolder.name);

    const seasonNode: LibrarySeason = {
      type: "season",
      name: seasonFolder.name,
      path: relativeOf(root, seasonPath),
      number: seasonFolder.number,
      tmdbName: null,
      year: null,
      airDate: null,
      overview: null,
      expected: 0,
      episodes: [],
      posterPath: null,
      children: await filesUnder(root, seasonPath, hooks, new Set()),
    };
    title.children.push(seasonNode);
  }

  const skip = new Set(seasonFolders.map((seasonFolder) => join(folder, seasonFolder.name)));
  title.children.push(...(await filesUnder(root, folder, hooks, skip)));
  return title;
}

/** Builds one group folder: its title folders and the loose files on top of it.
    An unreadable folder answers an empty node. */
async function buildRoot(root: string, name: string, hooks: ScanHooks): Promise<LibraryRoot> {
  const full = join(root, name);
  const node: LibraryRoot = { type: "root-folder", name, path: name, children: [] };

  let entries: Dirent[];
  try {
    entries = await readdir(full, { withFileTypes: true });
  } catch {
    return node;
  }

  for (const entry of entries) {
    const entryFull = join(full, entry.name);

    if (entry.isDirectory()) {
      if (TRICKPLAY_RE.test(entry.name)) continue;
      node.children.push(await buildTitle(root, entryFull, entry.name, hooks));
      continue;
    }

    if (!entry.isFile()) continue;

    const info = await stat(entryFull);
    const file: LibraryFile = {
      type: "file",
      name: entry.name,
      path: relativeOf(root, entryFull),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
      video: isVideo(entry.name),
      sample: isVideo(entry.name) && SAMPLE_RE.test(entry.name),
      probe: null,
      probeFailed: false,
      nameInfo: isVideo(entry.name) ? nameInfoOf(entry.name) : NOT_NAMED,
      flat: isVideo(entry.name),
      tmdb: null,
      episode: null,
    };
    node.children.push(file);
    hooks.onFile();
  }

  sortByName(node.children);
  return node;
}

/** Every file node of the tree, in tree order. */
function allFiles(roots: LibraryRoot[]): LibraryFile[] {
  const found: LibraryFile[] = [];

  for (const root of roots) {
    for (const child of root.children) {
      if (child.type === "file") {
        found.push(child);
        continue;
      }
      for (const nested of child.children) {
        if (nested.type === "file") found.push(nested);
        else found.push(...nested.children);
      }
    }
  }

  return found;
}

// One ffprobe run per video file, a few at a time.
async function probeAll(root: string, files: LibraryFile[], hooks: ScanHooks): Promise<void> {
  const videos = files.filter((file) => file.video && !file.sample);
  if (videos.length === 0) return;
  if (!(await ffprobeExists())) return;

  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < videos.length) {
      const file = videos[next++];
      if (!file) continue;

      try {
        file.probe = await probeFile(join(root, file.path));
        hooks.onProbed(true);
      } catch (error) {
        file.probeFailed = true;
        hooks.onProbed(false);
        console.warn("ffprobe", file.path, error instanceof Error ? error.message : error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, videos.length) }, worker));
}

// One title after the other: tmdb is asked at most eight requests per second.
async function fillTmdb(root: string, roots: LibraryRoot[], hooks: ScanHooks): Promise<void> {
  const groups = subfolders();

  for (const entry of roots) {
    const kind = kindOfGroup(entry.name, groups);
    for (const child of entry.children) {
      try {
        if (child.type === "file") await fillFlatFile(root, child, hooks, kind);
        else if (holdsVideo(child)) await fillTitle(child, join(root, child.path), hooks, kind);
      } catch (error) {
        hooks.onTmdb(false);
        console.warn("tmdb", child.path, error instanceof Error ? error.message : error);
      }
    }
  }
}

/** The group folders of the library root, each built into a node, then probe and
    tmdb passes over the tree. */
export async function scanLibrary(hooks: ScanHooks): Promise<LibraryRoot[]> {
  const root = libraryRoot();
  if (root === null) return [];

  const groups: Array<{ name: string }> = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) groups.push({ name: entry.name });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, "de"));

  const roots: LibraryRoot[] = [];
  for (const group of groups) roots.push(await buildRoot(root, group.name, hooks));

  hooks.onTree(roots);

  // Each pass stands on its own: ffprobe reads the files, tmdb answers for the
  // titles. Both start as soon as the tree stands, so a large library keeps tmdb
  // running while the probes are still going.
  await Promise.all([probeAll(root, allFiles(roots), hooks), fillTmdb(root, roots, hooks)]);

  return roots;
}

/** The files a title node holds, the season files with them. */
function titleFiles(title: LibraryTitle): LibraryFile[] {
  const found: LibraryFile[] = [];

  for (const child of title.children) {
    if (child.type === "file") found.push(child);
    else found.push(...child.children);
  }

  return found;
}

/** One title folder below the library root, by its path in the pass. */
export async function scanTitle(
  root: string,
  path: string,
  hooks: ScanHooks,
): Promise<LibraryTitle> {
  const folder = join(root, path);
  const title = await buildTitle(root, folder, path.split("/").pop() ?? path, hooks);

  if (!holdsVideo(title)) return title;

  await Promise.all([
    probeAll(root, titleFiles(title), hooks),
    fillTitle(title, folder, hooks, kindOfGroup(path.split("/")[0] ?? "", subfolders())),
  ]);
  return title;
}

/** One flat file below the library root, by its path in the pass. */
export async function scanFlatFile(
  root: string,
  path: string,
  hooks: ScanHooks,
): Promise<LibraryFile> {
  const name = path.split("/").pop() ?? path;
  const info = await stat(join(root, path));

  const file: LibraryFile = {
    type: "file",
    name,
    path,
    size: info.size,
    modifiedAt: info.mtime.toISOString(),
    video: isVideo(name),
    sample: isVideo(name) && SAMPLE_RE.test(name),
    probe: null,
    probeFailed: false,
    nameInfo: isVideo(name) ? nameInfoOf(name) : NOT_NAMED,
    flat: isVideo(name),
    tmdb: null,
    episode: null,
  };

  await probeAll(root, [file], hooks);
  await fillFlatFile(root, file, hooks, kindOfGroup(path.split("/")[0] ?? "", subfolders()));
  return file;
}
