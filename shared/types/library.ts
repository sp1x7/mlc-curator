/** What a folder or file on disk stands for. */
export type LibraryKind = "movie" | "series" | "other";

export type AudioTrack = {
  // Display language; null while the stream header stays empty.
  language: string | null;
  codec: string;
  channels: number | null;
  title: string | null;
};

// Measured values of one video file.
export type Probe = {
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  container: string | null;
  hdr: string | null;
  runtimeMinutes: number | null;
  audio: AudioTrack[];
  subtitles: string[];
};

// The words the name carried, kept apart from the measured values.
export type NameInfo = {
  episodeLabel: string | null;
  season: number | null;
  episodes: number[];
  quality: string | null;
  codec: string | null;
  hdr: string | null;
  audio: string | null;
  group: string | null;
};

/** One episode of a tmdb season. */
export type TmdbEpisode = {
  season: number;
  number: number;
  name: string | null;
  originalName: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  overview: string | null;
  stillPath: string | null;
};

/** A tmdb title as stored with the library node. */
export type TmdbTitle = {
  kind: "movie" | "series";
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  year: number | null;
  overview: string | null;
  rating: number | null;
  voteCount: number | null;
  // Empty until the genres are stored with the title.
  genres: string[];
  // Empty until the certification is stored with the title.
  certification: string | null;
  seasonsExpected: number | null;
  posterPath: string | null;
  backdropPath: string | null;
};

export type LibraryFile = {
  type: "file";
  name: string;
  // Path below the library root; also the identity of the row.
  path: string;
  size: number;
  modifiedAt: string;
  video: boolean;
  // A sample, trailer or clip: a video that stands outside titles and episodes.
  sample: boolean;
  // Null while the measurement stays absent: off video, or the pass failed.
  probe: Probe | null;
  probeFailed: boolean;
  nameInfo: NameInfo;
  // A movie that is the file itself, standing outside a title folder.
  flat: boolean;
  // Set for a flat file whose own name or nfo named a title.
  tmdb: TmdbTitle | null;
  // The tmdb episode this file was matched to.
  episode: TmdbEpisode | null;
};

export type LibrarySeason = {
  type: "season";
  // Folder name on disk.
  name: string;
  path: string;
  // The season number of the folder name, null for a folder named freely.
  number: number | null;
  tmdbName: string | null;
  year: number | null;
  airDate: string | null;
  overview: string | null;
  // Episode count from tmdb; the files are compared against this.
  expected: number;
  episodes: TmdbEpisode[];
  posterPath: string | null;
  children: LibraryFile[];
};

export type LibraryTitle = {
  type: "title";
  kind: LibraryKind;
  name: string;
  path: string;
  // Which number was found, and where.
  hint: { tmdbId: number | null; imdbId: string | null; from: "name" | "nfo" | null };
  tmdb: TmdbTitle | null;
  children: Array<LibrarySeason | LibraryFile>;
};

/** One configured library folder with its titles. */
export type LibraryRoot = {
  type: "root-folder";
  name: string;
  path: string;
  children: Array<LibraryTitle | LibraryFile>;
};

/** Progress counters of one library pass. */
export type ScanState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  folders: number;
  files: number;
  probed: number;
  probeFailures: number;
  // Titles asked of tmdb, and how many of them answered.
  titles: number;
  resolved: number;
  error: string | null;
};

// One pass over the library folders. Replaced as a whole by the next pass.
export type LibraryStand = {
  // The configured folder; null until it is set.
  root: string | null;
  scannedAt: string | null;
  scan: ScanState;
  roots: LibraryRoot[];
};
