// The plan of one release folder: which file becomes which file in the library.
// Built from the link in `mappings`, the file names and the settings.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { bandOf, probeRes } from "@shared/types/band";
import type { DownloadPlan, PlanEntry } from "@shared/types/downloads";
import type { NameInfo } from "@shared/types/library";
import { eq } from "drizzle-orm";
import { publish } from "../app/events";
import { db } from "../db/db";
import { mappings } from "../db/schema";
import { nameInfoOf } from "../library/name-info";
import { probeMeasured } from "../library/probe";
import { libraryRoot } from "../library/root";
import { currentStand, type Placed, placedKey, refreshPlaced } from "../library/stand";
import { on } from "../settings/store";
import { parseName } from "../tmdb/name";
import { contentsOfNfo } from "../tmdb/nfo";
import { setImdbId, storedEpisodes, storedMovie, storedSeries } from "../tmdb/title";
import { isArchive } from "../unpack/rar";
import { indexLibrary, libraryKey } from "../wishlist/library";
import { downloadFolder, nameFormats, subfolders } from "./config";
import { metadataTargets, writeMetadata } from "./metadata";
import { findDownload, setOrganized } from "./store";

const VIDEO_EXTENSIONS = new Set([
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

const SUBTITLE_EXTENSIONS = new Set(["srt", "sub", "idx", "ass", "ssa"]);

// Extras that ride along with a release: a video file carrying the release name,
// while the title of its own stays with the release itself.
const SAMPLE_RE = /(?:^|[\s._([-])(?:sample|trailer)(?:$|[\s._)\]-])/i;

export function isVideo(name: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(name).slice(1).toLowerCase());
}

export function isSubtitle(name: string): boolean {
  return SUBTITLE_EXTENSIONS.has(extname(name).slice(1).toLowerCase());
}

/** Bytes a file holds right now; 0 once the file is gone. */
function sizeOf(file: string): number {
  return existsSync(file) ? statSync(file).size : 0;
}

/** Characters a file name has to stay clear of. */
function clean(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[ .]+$/, "")
    .trim();
}

export type TemplateValues = Record<string, string | number | null | undefined>;

/** Fills the placeholders of a name format; a missing value leaves a gap the
    tidy pass closes. */
export function render(template: string, values: TemplateValues): string {
  const filled = template.replace(/<([a-z_]+)>/g, (_whole, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? "" : String(value);
  });

  const tidy = filled
    .replace(/[([(]\s*[)]}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/(\s*-\s*){2,}/g, " - ")
    .replace(/^[-\s]+|[-\s]+$/g, "");

  return clean(tidy);
}

const two = (value: number): string => String(value).padStart(2, "0");

export type Mapping = typeof mappings.$inferSelect | null;

export function mappingOf(threadId: number): Mapping {
  return db.select().from(mappings).where(eq(mappings.threadId, threadId)).get() ?? null;
}

/**
 * The NFO the packer left in the release folder names its own tmdb number, and
 * that number wins over the link. The IMDb id is taken over when the switch
 * asks for it.
 */
export function adoptNfoIds(threadId: number, folder: string): void {
  const link = mappingOf(threadId);
  if (!link) return;

  for (const nfo of contentsOfNfo(folder)) {
    if (nfo.tmdbId === null) continue;

    if (nfo.tmdbId !== link.tmdbId) {
      db.update(mappings)
        .set({ tmdbId: nfo.tmdbId, origin: "manual" })
        .where(eq(mappings.threadId, threadId))
        .run();
      link.tmdbId = nfo.tmdbId;
    }

    if (nfo.imdbId && on("movie_imdb_from_nfo")) {
      const movie = storedMovie(nfo.tmdbId);
      if (movie && !movie.imdbId) setImdbId(nfo.tmdbId, nfo.imdbId);
    }

    return;
  }
}

export function releasePathOf(folder: string): string {
  return join(downloadFolder(), folder);
}

/** Every file below the release folder; empty when the folder is gone. */
export function releaseFilesOf(folder: string): string[] {
  const root = releasePathOf(folder);
  if (!existsSync(root)) return [];

  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) found.push(path);
    }
  };

  walk(root);
  return found;
}

type Target = { folder: string; name: string };

/**
 * The episode the folders above a file name. A pack leaves its episodes in one
 * folder each and names the files after itself, so the folder of the episode is
 * the only place its number stands; the release folder is the last to answer.
 */
function folderEpisode(below: string, folder: string): { season: number; episode: number } | null {
  for (const name of [...below.split("/").filter(Boolean).reverse(), folder]) {
    const tokens = parseName(name);
    const episode = tokens.episodes[0];

    if (episode !== undefined && tokens.season !== null) {
      return { season: tokens.season, episode };
    }
  }

  return null;
}

/** Where one video of the release lands in the library. */
function targetOf(file: string, info: NameInfo, link: Mapping, folder: string): Target | null {
  const root = libraryRoot();
  if (!root) return null;

  const groups = subfolders();
  const formats = nameFormats();
  const extension = extname(file);
  const below = dirname(file).slice(releasePathOf(folder).length + 1);

  if (!link) {
    return { folder: join(root, groups.other, below), name: basename(file) };
  }

  if (link.kind === "movie") {
    const movie = storedMovie(link.tmdbId);
    if (!movie) return null;

    const values = {
      title: movie.title,
      year: movie.year,
      quality: info.quality,
      audio: info.audio,
    };
    const folderName = render(formats.name_movie_folder, values);

    return {
      folder: on("flat_mode") ? join(root, groups.movies) : join(root, groups.movies, folderName),
      name: `${render(formats.name_movie_file, values)}${extension}`,
    };
  }

  const series = storedSeries(link.tmdbId);
  if (!series) return null;

  // The number of an episode may sit in the folder of the file instead of in its
  // own name; the file keeps priority when it names one itself.
  const fromFolders = folderEpisode(below, folder);
  const season = info.season ?? fromFolders?.season ?? parseName(folder).season ?? 1;
  const episode = info.episodes[0] ?? fromFolders?.episode ?? null;

  // A series file whose name and folders both stay unnumbered is left out of the
  // plan: its episode stays open.
  if (episode === null) return null;

  const episodeRow =
    storedEpisodes(link.tmdbId, season).find((row) => row.episodeNumber === episode) ?? null;

  const values = {
    title: series.title,
    year: series.firstAirYear,
    season: two(season),
    episode: episode === null ? null : two(episode),
    episode_title: episodeRow?.name ?? episodeRow?.originalName,
    quality: info.quality,
    audio: info.audio,
  };

  return {
    folder: join(
      root,
      groups.series,
      render(formats.name_series_folder, values),
      render(formats.name_season_folder, values),
    ),
    name: `${render(formats.name_episode_file, values)}${extension}`,
  };
}

function kindOf(file: string): PlanEntry["kind"] {
  const name = basename(file);
  if (isArchive(name)) return "archive";
  if (isVideo(name)) return "video";
  if (isSubtitle(name)) return "subtitle";
  if (extname(name).toLowerCase() === ".nfo") return "nfo";
  if (/\.(jpg|png)$/i.test(name)) return "image";
  return "other";
}

/**
 * One entry per file of the release folder. Videos get a library path, the
 * subtitle of a video follows it, archives and the NFO of the packer stay.
 */
export async function planOf(threadId: number, folder: string): Promise<DownloadPlan> {
  const root = libraryRoot();
  const files = releaseFilesOf(folder);
  const entries: PlanEntry[] = [];
  const measured: DownloadPlan["measured"] = {};

  if (!root)
    return {
      threadId,
      folder,
      root: "",
      entries,
      measured,
      organizedAt: null,
      metadataNote: "no library folder",
    };

  adoptNfoIds(threadId, releasePathOf(folder));
  const link = mappingOf(threadId);
  const hit = link
    ? indexLibrary(currentStand().roots).get(libraryKey(link.kind, link.tmdbId))
    : undefined;

  for (const file of files.filter((candidate) => isVideo(basename(candidate)))) {
    // A sample carries the release name, while the release itself holds the
    // title.
    if (SAMPLE_RE.test(basename(file))) continue;

    const info = nameInfoOf(basename(file));

    // The measurement comes from the shared cache, so the plan of a folder and
    // the detail of the same folder measure once.
    const { probe: mass } = await probeMeasured(file);
    measured[file] = {
      width: mass?.width ?? null,
      height: mass?.height ?? null,
      duration: mass?.runtimeMinutes ?? null,
    };

    const target = targetOf(file, info, link, folder);
    const video = target === null ? file : join(target.folder, target.name);
    const taken = target !== null && existsSync(video);
    const probe = [
      ...(hit?.files ?? []),
      ...[...(hit?.seasons.values() ?? [])].flatMap((s) => s.children),
    ].find((entry) => entry.path === video.slice(root.length + 1))?.probe;

    entries.push({
      from: file,
      to: video,
      kind: "video",
      bytes: sizeOf(file),
      exists: taken,
      move:
        target !== null &&
        (!taken ||
          (probe != null &&
            (bandOf(probeRes(measured[file])) ?? 0) > (bandOf(probeRes(probe)) ?? 0))),
      role: null,
      added: false,
      reason:
        target === null
          ? link?.kind === "tv"
            ? "no episode number"
            : "title not in the database"
          : null,
    });

    if (!target) continue;
  }

  const taken = new Set(entries.map((entry) => entry.from));

  for (const file of files) {
    if (taken.has(file)) continue;
    const kind = kindOf(file);

    entries.push({
      from: file,
      to: file,
      kind,
      bytes: sizeOf(file),
      exists: true,
      move: false,
      role: kind === "nfo" ? "from the board" : null,
      added: false,
      reason:
        kind === "archive"
          ? "archive"
          : kind === "nfo"
            ? "NFO from the thread"
            : SAMPLE_RE.test(basename(file))
              ? "extra"
              : null,
    });
  }

  // The nfo and picture files the sort adds on top of the moved videos.
  const { targets, skipped } = await metadataTargets(
    { threadId, folder, root, measured },
    entries.filter((entry) => entry.kind === "video" && entry.move),
    link,
  );

  for (const target of targets) {
    entries.push({
      from: target.file,
      to: target.file,
      kind: target.kind,
      bytes: 0,
      exists: target.exists,
      move: !target.exists,
      role: target.role,
      added: true,
      reason: target.exists ? "already there" : null,
    });
  }

  return {
    threadId,
    folder,
    root,
    entries,
    measured,
    organizedAt: null,
    metadataNote: skipped,
  };
}

/** Moves across devices by copying and removing the original. */
function moveTo(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to)) unlinkSync(to);

  try {
    renameSync(from, to);
  } catch {
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

/** Applies the chosen entries: the files that stay are left where they are. */
export function applyEntries(chosen: PlanEntry[]): void {
  for (const entry of chosen) {
    if (!entry.move || entry.added) continue;
    moveTo(entry.from, entry.to);
  }
}

/** True while the release folder holds a video beyond its samples. */
function holdsMedia(files: string[]): boolean {
  return files.some((file) => isVideo(basename(file)) && !SAMPLE_RE.test(basename(file)));
}

/** `prune_empty_source`: the release folder goes once its own media has moved
    out. */
export function pruneRelease(folder: string): void {
  if (!on("prune_empty_source")) return;

  const root = releasePathOf(folder);
  if (!existsSync(root) || holdsMedia(releaseFilesOf(folder))) return;

  rmSync(root, { recursive: true, force: true });
}

/** The plan of a release that is on the list, with the stamp of its last move. */
export type Planned = { plan: DownloadPlan; organizedAt: string | null };

/**
 * The plan of a release on the download list, null for a thread off the list.
 * The record carries the folder, so a caller passes the thread id alone.
 */
export async function planFor(threadId: number): Promise<Planned | null> {
  const record = findDownload(threadId);
  if (!record) return null;

  const stamp = record.organizedAt ? new Date(record.organizedAt * 1000).toISOString() : null;

  return { plan: await planOf(threadId, record.folder), organizedAt: stamp };
}

/** What one move of a release into the library did. */
export type Organized = {
  ok: true;
  moved: number;
  /** The library paths the files went to, in the order they were moved. */
  placed: string[];
  nfo: string[];
  images: string[];
  /** The reason the pass wrote zero metadata files; null once it wrote some. */
  skipped: string | null;
  /** The release folder while it still stands, null once it is empty. */
  kept: string | null;
};

/**
 * Moves the chosen files of a release into the library and writes what belongs
 * with them: nfo, poster, fanart. The plan window click and an upgrade run both
 * take this path, since the library pass has to learn about the new folders
 * either way. A thread off the download list stays where it is.
 */
export async function organize(
  threadId: number,
  paths: string[],
): Promise<Organized | { ok: false; error: string }> {
  const record = findDownload(threadId);
  if (!record) return { ok: false, error: "no entry" };

  const plan = await planOf(threadId, record.folder);
  if (plan.root === "") return { ok: false, error: "no library folder set" };

  const chosen = new Set(paths);
  const moves = plan.entries.filter(
    (entry) => entry.move && !entry.added && chosen.has(entry.from),
  );

  applyEntries(moves);

  const keys = new Map<string, Placed>();
  for (const entry of moves) {
    const key = placedKey(entry.to);
    if (key) keys.set(key.path, key);
  }

  for (const key of keys.values()) await refreshPlaced(key);

  const written = await writeMetadata(plan, chosen, mappingOf(threadId));
  setOrganized(threadId);
  pruneRelease(record.folder);

  publish("downloads.changed", { threadId, state: "planned" });
  publish("library.changed", { threadId });

  return {
    ok: true,
    moved: moves.length,
    placed: moves.map((entry) => entry.to),
    nfo: written.nfo,
    images: written.images,
    skipped: written.skipped,
    kept: existsSync(releasePathOf(record.folder)) ? record.folder : null,
  };
}
