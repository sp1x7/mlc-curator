// One board thread, as the catalog window shows it.
export type Release = {
  // Thread id from the board url.
  threadId: number;
  // Scene name as the board writes it.
  title: string;
  // The scene name with its release tags taken off; an empty guess means: same as
  // title.
  name: string;
  // Normalised tags, e.g. ["2160p", "hdr", "de", "year:2026"].
  tags: string[];
  category: string;
  subcategory: string;
  // ISO 8601, null when the board time was unreadable.
  publishedAt: string | null;
  url: string;
  // Linked title, null while the mapping row is absent.
  tmdb: ReleaseTitle | null;
  // Ftp access from the fetched info file; the password stays on the server.
  ftp: ReleaseFtp | null;
  // What the last library pass holds of the linked title: null for a title off
  // disk, a title off the mapping, or a library still waiting for its first scan.
  have: LibraryHold | null;
};

// What the last library pass found of one title on disk.
export type LibraryHold = {
  files: number;
  // Season folders; a film title keeps the count empty.
  seasons: number;
};

export type ReleaseFtp = {
  host: string;
  port: number | null;
  user: string | null;
  path: string | null;
  passwordSet: boolean;
  fetchedAt: string;
};

// State of the title lookup that runs next to the snapshot.
export type LinkState = {
  running: boolean;
  queued: number;
  processed: number;
  linked: number;
  unmatched: number;
  current: string | null;
};

/** The tmdb title a mapping row stores. */
export type ReleaseTitle = {
  kind: "movie" | "tv";
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  rating: number | null;
  voteCount: number | null;
  overview: string | null;
  posterPath: string | null;
  genres: string[];
};

/** One page of rows plus the total count of the filter. */
export type ReleasePage = {
  rows: Release[];
  total: number;
};

// Titles the resolver leaves open; the window picks one by hand.
export type AssignCandidate = {
  kind: "movie" | "tv";
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterPath: string | null;
  voteCount: number;
};

export type AxisKey = "quality" | "source" | "codec" | "audio" | "color" | "language";

export type Axis = { key: AxisKey; label: string; values: string[] };

// A release has to carry every set value of every set axis.
export type ReleaseFilter = Partial<Record<AxisKey, string[]>>;

// One forum under one category, with its release count.
export type Forum = { id: number; name: string; releases: number };

export type Category = { id: number; name: string; releases: number; forums: Forum[] };

// Where the last board snapshot stands.
export type SyncState = {
  running: boolean;
  forumId: number | null;
  forum: string | null;
  page: number;
  // Pages of the current forum, 0 while the page count stays unread.
  forumPages: number;
  forumsTotal: number;
  forumsDone: number;
  // Threads read in this run; the count moves with progress alone.
  seen: number;
  added: number;
  updated: number;
  removed: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type SessionState = {
  user: string;
  // A board session cookie is stored.
  cookieSet: boolean;
  // A board password is stored.
  passwordSet: boolean;
};
