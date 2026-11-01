// Board title -> clean name + normalised tags.
//
// A scene name is dotted: "Vaiana.2026.German.DL.HDR.2160p.WEB.h265-W4K".
// Splitting it into a name and a tag list lets the filter axes test exact tag
// values instead of title patterns.

const TAG_MAP: Record<string, string> = {
  // quality
  "1080p": "1080p",
  "1080": "1080p",
  "720p": "720p",
  "720": "720p",
  "2160p": "2160p",
  "2160": "2160p",
  "4k": "4k",
  uhd: "uhd",
  hdr: "hdr",
  dv: "dv",
  atmos: "atmos",
  sd: "sd",
  "480": "sd",
  "576": "sd",
  // codec
  x264: "x264",
  h264: "x264",
  avc: "x264",
  x265: "x265",
  h265: "x265",
  hevc: "x265",
  xvid: "legacy",
  divx: "legacy",
  vc1: "legacy",
  // source
  web: "web",
  webrip: "web",
  webdl: "web",
  webhd: "web",
  webhdtv: "hdtv",
  bluray: "bluray",
  bdrip: "bluray",
  remux: "bluray",
  hdrip: "bluray",
  hdtv: "hdtv",
  dvd: "sd",
  dvdrip: "sd",
  sdrip: "sd",
  telesync: "sd",
  // scene markers
  internal: "internal",
  limited: "limited",
  proper: "proper",
  // language; "dl" is the german Dolby track, WEB + DL is WEB-DL (see below)
  german: "de",
  deutsch: "de",
  dubbed: "de",
  dl: "de",
  dual: "dual",
  english: "en",
  en: "en",
  // audio
  ac3: "ac3",
  ac3d: "ac3",
  eac3: "ac3",
  dts: "dts",
  dtsd: "dts",
};

const YEAR_RE = /^\(?\b(19\d{2}|20\d{2})\)?$/;
const SE_RE = /^S(\d{1,3})(?:E(\d{1,3}))?$/i;
// The board writes episodes spaced: "S04 E11" arrives as two tokens.
const EPISODE_RE = /^E\d{1,3}$/i;
// Trailing suffix: "(Fantasy)" / "(Animation, Fantasy)". A plain year in the
// parentheses stays a year and stays out of the genre read.
const SUFFIX_RE = /\s*\(([^()]+)\)\s*$/;

/** One token to its tag: TAG_MAP first, then the year shape, then the episode
    shapes. A token that matches every test stays null. */
function classify(token: string): string | null {
  const word = token.toLowerCase().replace(/^[-()[\]]+|[-()[\]]+$/g, "");
  if (!word) return null;
  const mapped = TAG_MAP[word];
  if (mapped) return mapped;
  if (YEAR_RE.test(token)) return `year:${token.replace(/[()]/g, "")}`;
  if (SE_RE.test(token)) return token.toUpperCase();
  if (EPISODE_RE.test(token)) return token.toUpperCase();
  return null;
}

/**
 * Dots, dashes and spaces split the title; each token goes through classify.
 * Tokens that come back null build the name.
 */
function splitTitle(title: string): { name: string; tags: string[] } {
  const tokens = title
    .split(/[._]+/)
    .flatMap((part) => part.split("-"))
    // Some releases carry their tokens spaced instead of dotted
    // ("Herbie.gross.in.Fahrt.1974.German AC3D DL 1080p BluRay x265-FuN").
    .flatMap((part) => part.split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean);

  const tags: string[] = [];
  const nameTokens: string[] = [];

  for (const token of tokens) {
    const tag = classify(token);
    if (!tag) {
      nameTokens.push(token);
      continue;
    }
    // "WEB" + "DL" reads as the source WEB-DL, so the dl marker joins the
    // source and stays out of the language tags.
    if (tag === "de" && token.toLowerCase() === "dl" && tags[tags.length - 1] === "web") continue;
    if (!tags.includes(tag)) tags.push(tag);
  }

  // A title that collects zero tags keeps its full text as name (books, music,
  // ...).
  if (tags.length === 0) return { name: title, tags: [] };

  // The last token that classified as null is the release group ("-W4K").
  const last = tokens[tokens.length - 1];
  if (last && classify(last) === null) {
    const group = last.replace(/^[-()[\]]+|[-()[\]]+$/g, "");
    const tail = nameTokens[nameTokens.length - 1]?.replace(/^[-()[\]]+|[-()[\]]+$/g, "");
    if (group && tail === group) {
      nameTokens.pop();
      tags.push(group);
    }
  }

  // "S04 E11" is one episode: season tag and bare episode tag merge into the SE
  // value.
  const season = tags.find((tag) => /^S\d+$/.test(tag));
  const episode = tags.find((tag) => /^E\d+$/.test(tag));
  if (season && episode) {
    tags.splice(tags.indexOf(episode), 1);
    tags.push(`${season}${episode}`);
  }

  const name = nameTokens
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/^[ -]+|[ -]+$/g, "");

  return name ? { name, tags } : { name: title, tags };
}

/** Cuts the board suffix off the title before the token walk, and keeps a plain
    year in the parentheses as a year tag. */
export function parseTitle(title: string): { name: string; tags: string[] } {
  const suffix = SUFFIX_RE.exec(title);
  if (!suffix) return splitTitle(title);

  const inner = suffix[1]?.trim() ?? "";
  if (/^\d{4}$/.test(inner)) {
    // A plain year is cut off and kept as a year tag; that keeps the release
    // group read away from the last token of the name.
    const rest = splitTitle(title.slice(0, suffix.index));
    if (!rest.tags.some((tag) => tag.startsWith("year:")))
      return { name: rest.name, tags: [`year:${inner}`, ...rest.tags] };
    return rest;
  }

  return splitTitle(title.slice(0, suffix.index));
}

// Genres of the board suffix, when the thread carries one.
export function genresOf(title: string): string[] {
  const suffix = SUFFIX_RE.exec(title);
  if (!suffix || /^\d{4}\s*$/.test(suffix[1] ?? "")) return [];
  return (suffix[1] ?? "")
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
}

const HINT_RE =
  /\b(Download\.?\s*Regeln|Regeln|Ank[üu]ndigung|FAQ|Hinweise?|Vorlage|Pinn|Sticky)\b|(?:^|\s)(?:[Ss]erien)?[üu]bersicht\b/i;
const EPISODE_SE = /S\d{1,2}[ ._-]?E\d{1,3}/i;
const EPISODE_X = /(?:^|[^A-Za-z0-9])\d{1,2}x\d{1,3}(?:[^0-9]|$)/i;
// The board writes episodes as "11 06" at the end of the name.
const EPISODE_SPACED = /\s(\d{2}) (\d{2})$/;

// Names past this length are releases; a board notice stays short.
const MAX_HINT_LENGTH = 40;

// Pinned notice threads: rules, announcements, FAQs, templates.
//
// A release carries release features: whoever has 2160p, a language, a year or
// an episode in the title sells something, even with the word "Regeln" in it.
// Each guard drops one of those features, the length test has the last word.
export function isHint(title: string, name: string, tags: string[]): boolean {
  if (!HINT_RE.test(title)) return false;
  if (tags.length > 0) return false;
  if (EPISODE_SE.test(title) || EPISODE_X.test(title)) return false;
  if (EPISODE_SPACED.test(name)) return false;
  return (name || title).length < MAX_HINT_LENGTH;
}
