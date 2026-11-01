// Client of the catalog area: the snapshot list, its run, the board session and
// the manual link of a release.

import type {
  AssignCandidate,
  Category,
  LinkState,
  ReleaseFtp,
  ReleasePage,
  SessionState,
  SyncState,
} from "@shared/types/catalog";
import { clientOf } from "@web/lib/api";

const catalog = clientOf("catalog");

/** Three answers of an assign call: stored, an error text, or candidates to pick. */
export type AssignAnswer = { ok: true } | { error: string } | { candidates: AssignCandidate[] };

/**
 * Statuses of a link attempt that carry an answer: 200 stores the title, 409
 * returns candidates to pick from, 400 says the search text matched zero titles.
 * All three arrive as data, so the caller can ask again.
 */
const LINKED = [200, 400, 409];

/** The catalog endpoints, one function each. */
export const catalogApi = {
  /** Categories with their forums and release counts. */
  categories: () => catalog.get<{ total: number; categories: Category[] }>("/categories"),

  /** One category page of releases. */
  releases: (category: string) => catalog.get<ReleasePage>("/releases", { category }),

  /** Progress of the snapshot run and of the link run. */
  sync: () => catalog.get<{ sync: SyncState; links: LinkState }>("/sync"),

  /** Starts a snapshot run. */
  startSync: () => catalog.post<{ sync: SyncState; links: LinkState }>("/sync"),

  /** Queues the releases that wait for a title. */
  link: () => catalog.post<{ queued: number }>("/link"),

  /** Drops the queued link work. */
  stopLink: () => catalog.post<{ dropped: number }>("/link/stop"),

  /** User, cookie flag and password flag of the board session. */
  session: () => catalog.get<SessionState>("/session"),

  /** One search text onto one thread. */
  assign: (threadId: number, query: string) =>
    catalog.post<AssignAnswer>("/assign", { threadId, query }, LINKED),

  /** One title picked from the candidate list, onto one thread. */
  assignId: (threadId: number, tmdbId: number, kind: "movie" | "tv") =>
    catalog.post<AssignAnswer>("/assign", { threadId, tmdbId, kind }, LINKED),

  /** Takes the mapping off one thread. */
  unassign: (threadId: number) => catalog.del<{ ok: boolean }>(`/assign/${threadId}`),

  // Info file of a thread: one thanks unlocks the hidden block, the file is
  // decrypted and its ftp access lands on the row.
  info: (threadId: number) =>
    catalog.post<{
      ok: boolean;
      thanks: boolean;
      host?: string;
      ftp: ReleaseFtp | null;
      problems?: string[];
    }>(`/info/${threadId}`),
};
