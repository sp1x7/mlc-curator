// Client of the library area: the stand of the last pass, a new pass and the folder
// the pass reads. A folder the server rejects answers with its reason.

import type { LibraryStand } from "@shared/types/library";
import { clientOf } from "@web/lib/api";

// The area prefix of every path.
const library = clientOf("library");

/** The library endpoints, one function each. */
export const libraryApi = {
  /** The stand of the last pass: roots, titles and scan counters. */
  stand: () => library.get<LibraryStand>("/stand"),

  /** Starts a pass over the library folders. */
  scan: () => library.post<{ ok: boolean; running: boolean }>("/scan"),

  /** Writes the library folder; a folder the server refuses answers 400 with its
      reason, listed here so the reason arrives as data. */
  root: (root: string) =>
    library.put<{ root: string } | { error: string }>("/root", { root }, [200, 400]),
};
