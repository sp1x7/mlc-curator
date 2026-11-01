import type { Probe } from "./library";

// The resolution words a wish speaks live with the band ladder; `none` is the
// wish's own word for "whatever is there".
export type { MinRes } from "./band";

import type { MinRes } from "./band";

/** A wish for a film or for a series. */
export type WishKind = "movie" | "tv";

/** Colour demand: `any` takes both, `only` wants hdr, `never` wants sdr. */
export type HdrMode = "any" | "only" | "never";

/** Language demand: `any` takes both, `ger` wants a German track, `orig` the
 *  language of the original title. */
export type AudioMode = "any" | "ger" | "orig";

/** The three demands one wish puts on a release. */
export type WishTarget = { minRes: MinRes; hdr: HdrMode; audio: AudioMode };

/** open: zero files at target, part: some of them, done: the full count. */
export type WishStatus = "open" | "part" | "done";

/** One release or one file measured against a target. */
export type Verdict = "ok" | "no";

export type WishMatch = {
  threadId: number;
  // Scene name as the board writes it.
  title: string;
  tags: string[];
  publishedAt: number | null;
  verdict: Verdict;
  // Reason of a "no", null when the release meets the target.
  why: string | null;
};

/** One episode chip of a season row. */
export type WishEpisode = {
  number: number;
  // On disk at the wish's target.
  have: boolean;
  // File behind the chip.
  file: string | null;
};

/** One season row of a wish: its counts, its folder, its quality and the episode
 *  chips. */
export type WishSeason = {
  number: number;
  have: number;
  // tmdb_seasons.episode_count, 0 while the tmdb season row stays absent.
  expected: number;
  status: WishStatus;
  // Season folder in the library, null for a season off disk.
  path: string | null;
  // Resolution and HDR of the folder's files.
  res: string | null;
  hdr: string | null;
  // "2022-02-18 .. 2022-04-15", from the season's episode air dates.
  air: string | null;
  posterPath: string | null;
  episodes: WishEpisode[];
};

/** One film file on disk, measured against the target; a film stands outside the
 *  season breakdown. */
export type WishFile = {
  name: string;
  path: string;
  size: number;
  modifiedAt: string | null;
  probe: Probe | null;
  verdict: Verdict;
  why: string | null;
};

/** The title block of a wish: the identity fields of the tmdb row behind it. */
export type WishIdentity = {
  title: string;
  originalTitle: string | null;
  year: number | null;
  imdbId: string | null;
  posterPath: string | null;
  overview: string | null;
  genres: string[];
  certification: string | null;
  rating: number | null;
  voteCount: number | null;
  originalLanguage: string | null;
  productionCountry: string | null;
  // Movie: its release date.
  releaseDate: string | null;
  // Series: tmdb status and the two air years.
  seriesStatus: string | null;
  firstAirYear: number | null;
  lastAirYear: number | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
};

/** One wish measured against the tmdb rows, the library and the board snapshot. */
export type WishEntry = {
  id: number;
  tmdbId: number;
  kind: WishKind;
  target: WishTarget;
  note: string | null;
  createdAt: number;
  identity: WishIdentity;
  progress: { have: number; expected: number };
  status: WishStatus;
  // "S02 E05-E10", "none" when met, "-" for a film below target.
  missing: string;
  inLibrary: boolean;
  seasons: WishSeason[];
  files: WishFile[];
  matches: WishMatch[];
};

/** Answer of the wish list route: every row plus the scan stamp they were measured
    against. */
export type WishList = {
  rows: WishEntry[];
  // Last library scan, null while the library stays unscanned.
  scannedAt: string | null;
};

/** One title a search offers for a wish that stands unresolved. */
export type ResolveCandidate = {
  kind: WishKind;
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterPath: string | null;
  voteCount: number;
};

/** A wish pointed at one tmdb title: the identity plus kind and id. */
export type ResolvedWish = WishIdentity & { kind: WishKind; tmdbId: number };

// One of three answers: a title, a list to pick from, or an empty `none`.
export type ResolveAnswer =
  | { hit: ResolvedWish }
  | { candidates: ResolveCandidate[] }
  | { none: true };
