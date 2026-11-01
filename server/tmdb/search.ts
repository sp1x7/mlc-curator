// TMDB search. A small candidate pool is the goal: fewer ties, and the gates
// stay the only proofs. Search produces candidates and leaves the decision to
// them.

import { norm } from "@shared/types/text";
import { tmdbGet } from "./client";
import type { Answer, Kind } from "./gates";
import { cleanName } from "./text";

const ENOUGH = 5;

// ae/oe/ue back to umlauts: "Der staehlerne Adler" only finds "Der stählerne Adler".
function umlaut(text: string): string {
  return text.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü");
}

// "und"/"and" kill a query ("Dharma und Greg" -> 0 hits).
function withoutAnd(text: string): string {
  return (
    text
      .split(" ")
      .filter((word) => !["und", "and"].includes(norm(word)))
      .join(" ") || text
  );
}

/** Umlaut spellings and und-stripped spellings of a query, duplicates folded
    out. */
function variants(text: string): string[] {
  return [
    ...new Set([
      withoutAnd(text),
      text,
      withoutAnd(umlaut(text)),
      umlaut(text),
      withoutAnd(umlaut(text.toLowerCase())),
      umlaut(text.toLowerCase()),
    ]),
  ];
}

// Search results for one name.
//
// 1. the full cleaned name, year-bound first, unbound only when too few hits
// 2. then tokens cut off from the back (subtitles and junk sit at the end)
// 3. stop once there are enough candidates
export async function searchResults(
  kind: Kind,
  name: string,
  year: string | null,
  compare?: string,
): Promise<Answer[]> {
  const seen = new Map<number, Answer>();
  const wanted = compare ?? norm(cleanName(name) || name);

  const search = async (query: string, useYear: string | null) => {
    if (!query.trim()) return;

    const params: Record<string, string> = { query, include_adult: "false" };
    if (useYear) params[kind === "movie" ? "year" : "first_air_date_year"] = useYear;

    const answer = (await tmdbGet(`/search/${kind}`, params)) as Answer | null;
    for (const result of answer?.results ?? []) {
      if (result.id != null && !seen.has(result.id)) seen.set(result.id, result);
    }
  };

  // The stop test also weighs relevance: it waits until the name itself shows up
  // in the pool.
  const enough = () => seen.size >= ENOUGH && prefilter([...seen.values()], wanted).length >= 2;

  const clean = cleanName(name);

  for (const query of [...variants(clean), ...variants(name)]) {
    await search(query, year);
    if (enough()) return [...seen.values()];
  }

  if (year && seen.size < 2) {
    for (const query of [...variants(clean), ...variants(name)]) {
      await search(query, null);
      if (enough()) return [...seen.values()];
    }
  }

  const tokens = (clean || name).split(" ").filter(Boolean);
  while (tokens.length > 1) {
    tokens.pop();
    const query = tokens.join(" ");

    await search(query, year);
    await search(umlaut(query.toLowerCase()), year);

    if (enough()) return [...seen.values()];

    if (year && seen.size < 2) {
      await search(query, null);
      await search(umlaut(query.toLowerCase()), null);
      if (enough()) return [...seen.values()];
    }
  }

  return [...seen.values()];
}

// Limits the number of details calls. The top 2 of a search always stay in,
// the rest by exact/prefix/substring/word overlap. This only saves calls.
export function prefilter(results: Answer[], query: string): Answer[] {
  const kept = results.slice(0, 2);
  const queryWords = new Set(query.split(" "));

  for (const result of results.slice(0, 10)) {
    if (kept.includes(result)) continue;

    const name = norm(result.title ?? result.name ?? "");
    if (!name) continue;

    if (
      name === query ||
      name.startsWith(query) ||
      query.startsWith(name) ||
      name.includes(query) ||
      query.includes(name)
    ) {
      kept.push(result);
    } else if (queryWords.size > 0) {
      const nameWords = new Set(name.split(" "));
      let hits = 0;
      for (const word of queryWords) {
        if (nameWords.has(word)) hits += 1;
      }
      if (nameWords.size > 0 && hits / Math.min(queryWords.size, nameWords.size) >= 0.5)
        kept.push(result);
    }

    if (kept.length >= 8) break;
  }

  return kept;
}

/** The find endpoint for one imdb id, movie and tv results merged with their
    media_type. */
export async function findByImdbId(imdbId: string): Promise<Answer[]> {
  const answer = (await tmdbGet(`/find/${imdbId}`, {
    external_source: "imdb_id",
  })) as Answer | null;

  const movies = (answer?.movie_results ?? []).map((entry) => ({
    ...entry,
    media_type: "movie",
  }));
  const shows = (answer?.tv_results ?? []).map((entry) => ({
    ...entry,
    media_type: "tv",
  }));

  return [...movies, ...shows];
}
