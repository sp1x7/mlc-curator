// What the tmdb boundary answers: the shape of its settings and the way a poster
// path becomes a url.

/** Poster sizes the image server answers, from small to the untouched file. */
export type PosterSize = "w185" | "w300" | "w500" | "original";

// Host and path prefix every poster size hangs under.
const IMAGE_BASE = "https://image.tmdb.org/t/p";

/**
 * The url of one poster. tmdb names the path alone, so the host and the size go
 * in front here. An absent path answers null, and the caller leaves the place
 * empty.
 */
export function posterUrl(
  path: string | null | undefined,
  size: PosterSize = "w300",
): string | null {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

/** Answer of `GET /api/tmdb/settings`: the key arrives as a flag, its value stays
    behind. */
export type TmdbSettings = {
  keySet: boolean;
  language: string;
};

/** Body of `PUT /api/tmdb/settings`. An empty key leaves the stored one alone. */
export type TmdbSettingsPatch = {
  apiKey?: string;
  language?: string;
};
