// Names of folders, files and board titles. The obvious tokens come out first:
// numbers, year, genre tails and the release group. The rest of the release name
// stays in the query, and the resolver cleans it against its own token list.

const EXTENSION_RE = /\.[a-z0-9]{2,5}$/i;
const TMDB_RE = /(?:\{[^{}]*\btmdb[^{}]*?(\d{1,9})[^{}]*\}|\btmdb(?:id)?[\s._-]*(\d{1,9})\b)/i;
const IMDB_RE = /\b(tt\d{7,8}|imdb\d{7,8})\b/i;
const EPISODE_RE =
  /\bs(?:eason|taffel)?[\s._-]*(\d{1,2})[\s._-]*[ex](\d{1,3})((?:[\s._-]*[ex]\d{1,3})*)/i;
const ALT_EPISODE_RE = /\b(\d{1,2})x(\d{1,3})\b/;
const FOLGE_RE = /\bfolge[\s._-]*(\d{1,3})\b/i;
const SEASON_WORDS_RE = /\b(?:staffel|season)[\s._-]*(\d{1,2})\b/i;
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;
const BRACKET_RE = /[([]([^()[\]]{0,120})[)\]]/g;

// Helper files inside a media folder: their stem names the helper, while the
// title comes from the folder around them.
const PLACEHOLDER_STEMS = new Set([
  "movie",
  "tvshow",
  "season",
  "poster",
  "fanart",
  "backdrop",
  "clearart",
  "clearlogo",
  "logo",
  "extrafanart",
  "extrathumbs",
  "cd1",
  "cd2",
  "disc1",
  "disc2",
  "part1",
  "part2",
]);

// A release group sits behind a hyphen that follows a quality token.
const QUALITY_TOKENS = new Set([
  "x264",
  "x265",
  "h264",
  "h265",
  "hevc",
  "avc",
  "av1",
  "web",
  "web-dl",
  "webrip",
  "bluray",
  "bdrip",
  "remux",
  "dvd",
  "dvdc",
  "ac3",
  "eac3",
  "dd",
  "ddp5",
  "dtshd",
  "dts",
  "truehd",
  "ma",
  "aac",
  "mp3",
  "flac",
  "opus",
  "1080p",
  "2160p",
  "1440p",
  "720p",
  "480p",
  "4k",
  "uhd",
  "hd",
]);
const GROUP_RE = /([A-Za-z0-9]{2,20})-([A-Za-z0-9]{2,20})(?=$|[\s(])/g;

export interface NameTokens {
  raw: string;
  query: string;
  year: number | null;
  season: number | null;
  episodes: number[];
  genres: string[];
  tmdbId: number | null;
  imdbId: string | null;
}

/** Turns separator characters into spaces and collapses the runs. */
function separated(text: string): string {
  return text
    .replace(/[._+~¡!?"'`§]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Pulls ids, year, season, episodes and genres out of one name; the text that
 * stays is the query. An nfo named after a helper file answers an empty query.
 */
export function parseName(name: string): NameTokens {
  const raw = name;
  const extension = (raw.match(EXTENSION_RE)?.[1] ?? "").toLowerCase();
  const stem = raw.replace(EXTENSION_RE, " ").replace(/^@+/, "");
  const placeholder = extension === "nfo" && PLACEHOLDER_STEMS.has(stem.trim().toLowerCase());

  let working = separated(stem);
  const genres: string[] = [];

  const tmdbMatch = TMDB_RE.exec(working);
  const tmdbId = tmdbMatch ? Number(tmdbMatch[1] ?? tmdbMatch[2]) || null : null;
  if (tmdbMatch) working = working.replace(tmdbMatch[0], " ");

  const imdbMatch = IMDB_RE.exec(working);
  const imdbNumber = imdbMatch?.[1] ?? "";
  const imdbId = imdbNumber
    ? imdbNumber.startsWith("tt")
      ? imdbNumber
      : `tt${imdbNumber.slice(4)}`
    : null;
  if (imdbMatch) working = working.replace(imdbMatch[0], " ");

  let year: number | null = null;
  for (const bracket of working.matchAll(BRACKET_RE)) {
    const inner = bracket[1] ?? "";
    const innerYear = YEAR_RE.exec(inner);
    if (innerYear) year = Number(innerYear[1]);
    else
      genres.push(
        ...inner
          .split(/[,;]/)
          .map((value) => value.trim())
          .filter(Boolean),
      );
    working = working.replace(bracket[0], " ");
  }

  // The hyphen part behind a quality token is the release group; two quality
  // words in a row keep both in the name.
  for (const match of working.matchAll(GROUP_RE)) {
    const before = match[1] ?? "";
    const after = match[2] ?? "";
    if (!QUALITY_TOKENS.has(before.toLowerCase())) continue;
    if (QUALITY_TOKENS.has(after.toLowerCase())) continue;
    working = working.replace(`-${after}`, " ");
  }

  let season: number | null = null;
  const seasonWords = SEASON_WORDS_RE.exec(working);
  if (seasonWords) {
    season = Number(seasonWords[1]);
    working = working.replace(seasonWords[0], " ");
  }

  const episodes: number[] = [];
  const episodeMatch = EPISODE_RE.exec(working) ?? ALT_EPISODE_RE.exec(working);
  if (episodeMatch) {
    season = Number(episodeMatch[1]);
    episodes.push(Number(episodeMatch[2]));
    for (const extra of episodeMatch[3]?.match(/\d{1,3}/g) ?? []) episodes.push(Number(extra));
    working = working.replace(episodeMatch[0], " ");
  }

  const folgeMatch = FOLGE_RE.exec(working);
  if (folgeMatch) {
    episodes.push(Number(folgeMatch[1]));
    working = working.replace(folgeMatch[0], " ");
  }

  if (year === null) {
    const yearMatch = YEAR_RE.exec(working);
    if (yearMatch) {
      year = Number(yearMatch[1]);
      working = working.replace(yearMatch[0], " ");
    }
  } else {
    working = working.replace(YEAR_RE, " ");
  }

  working = separated(working.replace(/[()[\]{}]/g, " "));

  return {
    raw,
    query: placeholder ? "" : working,
    year,
    season,
    episodes,
    genres,
    tmdbId,
    imdbId,
  };
}

const SEASON_FOLDER_RE = /^\s*(?:staffel|season)\s*\d{1,2}\s*$/i;
const SEASON_NUMBER_RE = /^\s*(?:staffel|season)\s*(\d{1,2})\s*$/i;
// Marks a path part as a file: an extension, an SxxExx block or an NxExx block.
export const FILE_LIKE_RE = /\.\w{2,5}$|\bs\d{1,2}[\s._-]*[ex]\d{1,3}\b|\b\d{1,2}x\d{1,3}\b/i;

// In a library path the title comes from the title folder, the numbers come from
// the season folder or the file; a file hands over its numbers and leaves its
// title text behind.
export function tokensFromPath(libraryPath: string): NameTokens {
  const parts = libraryPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const last = parts[parts.length - 1] ?? "";
  const file = parts.length > 1 && FILE_LIKE_RE.test(last) ? last : null;
  const folders = file ? parts.slice(0, -1) : parts;

  // The title folder sits directly above the season folders; everything above
  // it is the library root.
  let end = folders.length;
  while (end > 0 && SEASON_FOLDER_RE.test(folders[end - 1] ?? "")) end -= 1;

  const titleFolder = folders[end - 1] ?? "";
  const seasonFolder = [...folders]
    .reverse()
    .map((folder) => SEASON_NUMBER_RE.exec(folder))
    .find(Boolean);

  const fromFolder = parseName(titleFolder);
  const fromFile = file ? parseName(file) : null;

  return {
    raw: libraryPath,
    query: fromFolder.query,
    year: fromFolder.year ?? fromFile?.year ?? null,
    season: fromFile?.season ?? (seasonFolder ? Number(seasonFolder[1]) : null),
    episodes: fromFile?.episodes ?? [],
    genres: fromFolder.genres,
    tmdbId: fromFolder.tmdbId ?? fromFile?.tmdbId ?? null,
    imdbId: fromFolder.imdbId ?? fromFile?.imdbId ?? null,
  };
}

/** A path goes to the path reader, a single name to the name reader. */
export function tokensOf(text: string): NameTokens {
  return text.includes("/") ? tokensFromPath(text) : parseName(text);
}
