import type { LibraryFile, LibraryRoot, LibrarySeason, LibraryTitle } from "@shared/types/library";
import type { WishKind } from "@shared/types/wishlist";

// The last library pass, indexed by the tmdb id a title was resolved to.

export type LibraryHit = {
  // Season folders by their number.
  seasons: Map<number, LibrarySeason>;
  // Film files: the files of a title folder and a flat file that names a title.
  files: LibraryFile[];
};

export type LibraryIndex = Map<string, LibraryHit>;

/** The index key of one title. */
export function libraryKey(kind: WishKind, tmdbId: number): string {
  return `${kind}:${tmdbId}`;
}

/** A hit with zero seasons and zero files. */
function empty(): LibraryHit {
  return { seasons: new Map(), files: [] };
}

/** The tmdb id of a title node: the resolved title first, the name hint second. */
function tmdbIdOf(title: LibraryTitle): number | null {
  return title.tmdb?.tmdbId ?? title.hint.tmdbId;
}

// A title folder is wished as a series, a flat file as a film.
function kindOf(title: LibraryTitle): WishKind | null {
  if (title.kind === "series") return "tv";
  if (title.kind === "movie") return "movie";
  return null;
}

/** True for a video file outside the sample set. */
function isMedia(file: LibraryFile): boolean {
  return file.video && !file.sample;
}

/** The library stand indexed by kind and tmdb id, season folders and film files
    apart. */
export function indexLibrary(roots: LibraryRoot[]): LibraryIndex {
  const index: LibraryIndex = new Map();

  for (const root of roots) {
    for (const child of root.children) {
      // A flat file is the film itself and carries its own title.
      if (child.type === "file") {
        const tmdbId = child.tmdb?.tmdbId;
        if (!tmdbId || !isMedia(child)) continue;

        const key = libraryKey("movie", tmdbId);
        const hit = index.get(key) ?? empty();
        hit.files.push(child);
        index.set(key, hit);
        continue;
      }

      if (child.type !== "title") continue;

      const kind = kindOf(child);
      const tmdbId = tmdbIdOf(child);
      if (kind === null || tmdbId === null) continue;

      const key = libraryKey(kind, tmdbId);
      const hit = index.get(key) ?? empty();
      index.set(key, hit);

      for (const entry of child.children) {
        if (entry.type === "season") {
          const number = entry.number ?? entry.children.find((f) => f.episode)?.episode?.season;
          if (number === null || number === undefined) continue;
          if (!hit.seasons.has(number)) hit.seasons.set(number, entry);
          continue;
        }

        if (isMedia(entry)) hit.files.push(entry);
      }
    }
  }

  return index;
}
