// The hard proofs.
//
// - T (title):   the release name must be the identity of a tmdb entry
// - Y (year):    disambiguation aid; a remaster year shifts, so it carries zero
//                proof on its own
// - E (episode): SxxExx has to exist in the tmdb season list
// - genre:       board genres ⊆ tmdb genres, tie-break only

import { norm } from "@shared/types/text";
import { tmdbGet } from "./client";
import { CONNECTORS, LANG_WORDS } from "./text";

export type Kind = "movie" | "tv";

export interface Named {
  title?: string | null;
  name?: string | null;
}

// The parts of a tmdb answer this module reads. tmdb sends far more, and every
// field outside this list arrives as unknown.
export interface Answer extends Named {
  id?: number;
  media_type?: string;
  original_title?: string | null;
  original_name?: string | null;
  imdb_id?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
  vote_count?: number | null;
  poster_path?: string | null;
  genre_ids?: number[];
  genres?: Array<{ id?: number; name?: string }>;
  seasons?: Array<{ season_number?: number; episode_count?: number }>;
  alternative_titles?: Array<Named | string> | { titles?: Array<Named | string> };
  translations?: Array<Named | string> | { titles?: Array<Named | string> };
  results?: Answer[];
  movie_results?: Answer[];
  tv_results?: Answer[];
  [key: string]: unknown;
}

const GENRE_SYNONYMS: Record<string, string> = {
  comedy: "komödie",
  comedie: "komödie",
  humor: "komödie",
  "sci-fi": "science fiction",
  "science-fiction": "science fiction",
  kriegsfilm: "krieg",
  kids: "kindersendungen",
  romantik: "romanze",
};

let genreNamesCache: Map<number, Set<string>> | null = null;

// alternative_titles and translations are asked for: they carry the German title
// of a foreign entry.
export async function details(kind: Kind, tmdbId: number): Promise<Answer | null> {
  return (await tmdbGet(`/${kind}/${tmdbId}`, {
    append_to_response: "alternative_titles,translations",
  })) as Answer | null;
}

/** The imdb id of an entry, read from the external ids endpoint. */
export async function imdbOf(kind: Kind, tmdbId: number): Promise<string | null> {
  const answer = (await tmdbGet(`/${kind}/${tmdbId}/external_ids`)) as Answer | null;
  return answer?.imdb_id ?? null;
}

// Every name of an entry, normalized. The endpoints use different shapes, so
// all of them are collected.
export function candidateNames(answer: Answer): Set<string> {
  const names: (string | null | undefined)[] = [
    answer.title,
    answer.name,
    answer.original_title,
    answer.original_name,
  ];

  const rawAlternatives = answer.alternative_titles;
  const alternatives = Array.isArray(rawAlternatives)
    ? rawAlternatives
    : (rawAlternatives?.titles ?? []);

  for (const alternative of alternatives) {
    if (alternative && typeof alternative === "object") names.push(alternative.title);
    else if (typeof alternative === "string") names.push(alternative);
  }

  const rawTranslations = answer.translations;
  const translations = Array.isArray(rawTranslations)
    ? rawTranslations
    : (rawTranslations?.titles ?? []);

  for (const translation of translations) {
    if (translation && typeof translation === "object")
      names.push(translation.title ?? translation.name);
  }

  return new Set(
    names
      .filter((name): name is string => typeof name === "string" && Boolean(name))
      .map((name) => norm(name)),
  );
}

/** The release year of an entry, first four digits of its date field. */
export function candidateYear(answer: Answer): string {
  return (answer.release_date ?? answer.first_air_date ?? "").slice(0, 4);
}

/** Season number to episode count, straight from the season list of the entry. */
export function candidateSeasons(answer: Answer): Map<number, number> {
  const seasons = new Map<number, number>();
  for (const entry of answer.seasons ?? []) {
    const seasonNumber = entry.season_number;
    if (seasonNumber == null) continue;
    seasons.set(seasonNumber, entry.episode_count ?? 0);
  }
  return seasons;
}

// Genre id -> normalized names, fetched once per run.
export async function genreNames(): Promise<Map<number, Set<string>>> {
  if (genreNamesCache) return genreNamesCache;

  const map = new Map<number, Set<string>>();
  for (const kind of ["movie", "tv"] as Kind[]) {
    const answer = (await tmdbGet(`/genre/${kind}/list`)) as Answer | null;
    for (const genre of answer?.genres ?? []) {
      const genreId = genre.id;
      if (genreId === undefined) continue;
      const names = map.get(genreId) ?? new Set<string>();
      names.add(norm(genre.name ?? ""));
      map.set(genreId, names);
    }
  }

  genreNamesCache = map;
  return map;
}

/** Variants of a name with each digit token dropped once. */
function digitVariants(name: string): Set<string> {
  const variants = new Set([name]);
  const tokens = name.split(" ");

  for (let index = 0; index < tokens.length; index += 1) {
    if (/^\d+$/.test(tokens[index] ?? ""))
      variants.add([...tokens.slice(0, index), ...tokens.slice(index + 1)].join(" "));
  }

  return variants;
}

/** Drops connector tokens and `und` from a name. */
function withoutConnectors(name: string): string {
  return name
    .split(" ")
    .filter((token) => !CONNECTORS.has(token) && token !== "und")
    .join(" ");
}

/** Cuts a trailing s off every token longer than three letters. */
function singular(name: string): string {
  return name
    .split(" ")
    .map((token) => (token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token))
    .join(" ");
}

// T gate: the release name must be the identity of one tmdb name.
export function titleOk(release: string, names: Set<string>): boolean {
  const releases = new Set([release]);
  if (release.startsWith("marvels ")) releases.add(release.slice("marvels ".length).trim());

  // a) exact, spaces ignored
  const compact = new Set([...names].map((name) => name.replace(/ /g, "")));
  for (const candidate of releases) {
    if (compact.has(candidate.replace(/ /g, ""))) return true;
  }

  // b) plural and connector invariant
  const bareNames = new Set([...names].map((name) => singular(withoutConnectors(name))));
  for (const candidate of releases) {
    if (bareNames.has(singular(withoutConnectors(candidate)))) return true;
  }

  const releaseVariants = new Set<string>();
  for (const candidate of releases) {
    for (const variant of digitVariants(candidate)) releaseVariants.add(variant);
  }

  for (const name of names) {
    // d) one digit dropped on either side still matches
    for (const variant of digitVariants(name)) {
      if (releaseVariants.has(variant)) return true;
    }

    // f) the tmdb name leads with 1-3 tokens of digit/connector/language word
    if (name.endsWith(` ${release}`)) {
      const lead = name
        .slice(0, name.length - release.length - 1)
        .split(" ")
        .filter(Boolean);
      const head = lead[0] ?? "";
      if (
        lead.length >= 1 &&
        lead.length <= 3 &&
        (/^\d/.test(head) || CONNECTORS.has(head) || LANG_WORDS.has(head))
      ) {
        return true;
      }
    }

    // g) the release name leads with 1-3 letter tokens
    const nameTokens = name.split(" ");
    if (nameTokens.length >= 2 && release.endsWith(` ${name}`)) {
      const lead = release
        .slice(0, release.length - name.length - 1)
        .split(" ")
        .filter(Boolean);
      if (lead.length >= 1 && lead.length <= 3 && lead.every((token) => /^[a-z]/.test(token)))
        return true;
    }

    // A single-word tmdb name counts once it holds real content: 3+ letters and
    // off the connector list.
    if (nameTokens.length === 1 && (CONNECTORS.has(name) || name.length < 3)) continue;

    // c) the release name carries the title plus a subtitle
    if (release.startsWith(`${name} `)) {
      const rest = release
        .slice(name.length + 1)
        .split(" ")
        .filter(Boolean);
      if (rest.length >= 1 && rest.length <= 6 && /^[a-z]/.test(rest[0] ?? "")) return true;
    }

    // c') the tmdb name carries the release name plus a subtitle
    if (name.startsWith(`${release} `)) {
      const rest = name
        .slice(release.length + 1)
        .split(" ")
        .filter(Boolean);
      if (rest.length >= 1 && rest.length <= 8 && rest.every((token) => /^[a-z]/.test(token)))
        return true;
    }
  }

  return false;
}

// Board genres ⊆ tmdb genres. A board genre off the tmdb list stays neutral.
/** True when every board genre that matches the tmdb list also stands in the
    genre list of the entry. */
export async function genreOk(answer: Answer, genres: string[]): Promise<boolean> {
  const map = await genreNames();

  const have = new Set<string>();
  for (const genreId of answer.genre_ids ?? []) {
    for (const name of map.get(genreId) ?? []) have.add(name);
  }

  const all = new Set<string>();
  for (const names of map.values()) {
    for (const name of names) all.add(name);
  }

  const known = new Set(
    genres
      .map((genre) => norm(GENRE_SYNONYMS[genre.toLowerCase()] ?? genre))
      .filter((name) => all.has(name)),
  );

  if (known.size === 0) return true;
  return [...known].every((genre) => have.has(genre));
}
