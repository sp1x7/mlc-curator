// Types of the download flow: one release from the ftp folder into the library.

import type { Probe } from "./library";

/** Where one release stands in the flow. */
export type DownloadState =
  | "queued"
  | "listing"
  | "downloading"
  | "extracting"
  | "measuring"
  | "planned"
  | "stopped"
  | "error";

/** The tmdb data a release is linked to. */
export type ReleaseInfo = {
  kind: "movie" | "tv" | null;
  tmdbId: number | null;
  /** Stored title; null while the mapping row keeps the title empty. */
  title: string | null;
  year: number | null;
};

/** One row of the Downloads window. */
export type DownloadRow = {
  threadId: number;
  /** Board title; the folder name when the thread left the board. */
  title: string;
  /** Release folder inside the download folder. */
  folder: string;
  state: DownloadState;
  note: string | null;
  info: ReleaseInfo;
  /** Bytes under the release folder right now. */
  bytesOnDisk: number;
  /** Files under the release folder, named below it, with their bytes. */
  disk: { path: string; bytes: number }[];
  /** Sum of the chosen files as the ftp server named them; null until listed. */
  bytesWanted: number | null;
  /** Bytes per second while downloading. */
  speed: number | null;
  /** Chosen paths below the release folder. */
  files: string[];
  startedAt: string | null;
  finishedAt: string | null;
  /** Set when the files moved into the library. */
  organizedAt: string | null;
};

/** Answer of `GET /api/downloads/detail/:threadId`. */
export type ReleaseDetail = {
  threadId: number;
  info: ReleaseInfo & {
    overview: string | null;
    posterPath: string | null;
    /** Title in its own language. */
    originalName: string | null;
    genres: string[];
    /** tmdb vote average. */
    rating: number | null;
    /** Votes behind the rating. */
    votes: number | null;
    /** Age label tmdb knows for the title. */
    certification: string | null;
    /** Board link of the thread. */
    boardUrl: string | null;
    /** Season the release files name; null for a movie or mixed seasons. */
    season: number | null;
    /** Episodes the season has at tmdb. */
    seasonEpisodes: number | null;
    /** Words tmdb states about that season. */
    seasonOverview: string | null;
  };
  /** Episodes the release names, with the files that name them. */
  episodes: {
    season: number;
    episode: number;
    name: string | null;
    overview: string | null;
    runtimeMinutes: number | null;
    airDate: string | null;
    stillPath: string | null;
    files: string[];
  }[];
  /** Every video under the release folder with what ffprobe says. */
  videos: { path: string; bytes: number; probe: Probe | null; note: string | null }[];
};

/** One entry of the ftp listing of a release. */
export type FtpEntry = {
  /** Path below the release folder, with `/` as separator. */
  path: string;
  size: number;
  directory: boolean;
  /** Already under the release folder on disk. */
  onDisk: boolean;
  /** Bytes present on disk for this entry. */
  bytesOnDisk: number;
};

/** Answer of `GET /api/downloads/files/:threadId`. */
export type FtpListing = {
  host: string;
  /** Release folder name taken from the ftp path. */
  folder: string;
  entries: FtpEntry[];
  /** Sizes read over ftp; the flag stays off until the listing is fetched. */
  listed: boolean;
};

/** What one file of the release becomes in the library. */
export type PlanEntry = {
  /** Path inside the download folder, absolute. */
  from: string;
  /** Path inside the library folder, absolute. */
  to: string;
  kind: "video" | "subtitle" | "nfo" | "image" | "archive" | "other";
  /** Bytes the file holds in the download folder. */
  bytes: number;
  /** Target already holds a file of this name. */
  exists: boolean;
  /** False for files the plan leaves where they are. */
  move: boolean;
  /** What the file is for: episode, season, series, poster, backdrop. */
  role: string | null;
  /** The organizer writes this file instead of moving one. */
  added: boolean;
  /** Why the entry is left alone, shown next to it. */
  reason: string | null;
};

/** Answer of `GET /api/downloads/plan/:threadId`. */
export type DownloadPlan = {
  threadId: number;
  folder: string;
  /** Library folder the plan writes into. */
  root: string;
  entries: PlanEntry[];
  /** Measured values per video, keyed by source path. */
  measured: Record<
    string,
    { width: number | null; height: number | null; duration: number | null }
  >;
  /** Written once the plan is applied. */
  organizedAt: string | null;
  /** Why the plan adds zero nfo and picture files; null when it adds them. */
  metadataNote: string | null;
};

/** Answer of `POST /api/downloads/organize`. */
export type OrganizeResult = {
  /** Files that moved into the library. */
  moved: number;
  /** NFO files written, absolute. */
  nfo: string[];
  /** Pictures written, absolute. */
  images: string[];
  /** Why the run wrote zero files; null when it wrote something. */
  skipped: string | null;
  /** Release folder still there; null when it went away. */
  kept: string | null;
};
