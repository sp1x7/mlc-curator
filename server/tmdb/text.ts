// Release-name cleaning for the title matcher: `cleanName()` removes the tokens
// boards stack behind a name. The comparison form itself — what a name reads as
// when it is matched — belongs to `shared/types/text.ts`, because the search
// fields of the windows fold names the same way.

import { norm } from "@shared/types/text";

// Tokens boards stack behind a name while the title ends before them.
const JUNK_TOKENS = new Set([
  "remastered",
  "remaster",
  "uncut",
  "unrated",
  "extended",
  "complete",
  "completa",
  "incomplete",
  "doku",
  "dokus",
  "multi",
  "mult",
  "anime",
  "webhd",
  "webrip",
  "webdl",
  "web-dl",
  "bdrip",
  "bluray",
  "blu-ray",
  "dtshd",
  "dts",
  "truehd",
  "atmos",
  "ma",
  "hi-res",
  "high10",
  "high11",
  "ws",
  "fs",
  "dtv",
  "mbbluray",
  "repack",
  "read",
  "nfo",
  "synced",
  "bootleg",
  "internal",
  "cam",
  "tc",
  "md",
  "op",
  "matte",
  "open",
  "ld",
  "colorized",
  "remux",
  "rip",
  "clean",
  "subbed",
  "subbings",
  "dubbed",
  "ra",
  "readded",
  "dirfix",
  "difrixx",
  "difix",
  "amazonhd",
  "amzn",
  "hd",
  "4k",
  "1080p",
  "2160p",
  "720p",
  "german",
  "deutsch",
  "dual",
  "ger",
  "eng",
  "english",
  "xxx",
  "mp4",
  "mkv",
  "dc",
  "geman",
  "rerip",
  "rerips",
  "ddp",
  "ddp5",
  "camrip",
  "camrips",
  "hc",
  "norwegian",
  "norsk",
  "us",
  "extra",
  "extras",
  "latin",
  "spanish",
  "spanisch",
  "japanese",
  "japanisch",
  "korean",
  "koreanisch",
  "chinese",
  "chinesisch",
  "french",
  "italian",
  "italienisch",
  "germanisch",
  "ai",
  "aifu",
  "theatrical",
  "regraded",
  "regrade",
  "fra",
  "lat",
  // "cut" stays: "One Cut of the Dead" carries it inside the title
  "ml",
  "cr",
  "dv",
  "telesync",
  "dvdr",
  "ac3d",
  "uhd",
]);

// Single token shapes: dd5.1, h264/x265, 1080p, years.
const JUNK_PATTERNS = [
  /^(dd\d{1,2}|h\.?26[45]|x26[45]|e?ac3?r?d?|aac|mp3|flac|opus|dvb|dvd|extras?|cc|uk|atvp|webhd|amzn|h|\d{3,4}p|[71][01]80?\d?|[21]\d{3}|dcprip|26[45]|1080|2160)$/i,
];

// Connectors stay allowed inside a title comparison.
export const CONNECTORS = new Set([
  "wie",
  "und",
  "oder",
  "ein",
  "eine",
  "der",
  "die",
  "das",
  "mit",
  "zum",
  "zur",
  "im",
  "in",
  "auf",
  "von",
  "für",
  "fur",
  "for",
  "the",
  "a",
  "an",
  "of",
  "and",
  "nach",
  "bei",
  "um",
  "aus",
  "bis",
  "gegen",
  "vor",
  "ab",
  "neben",
  "unter",
  "über",
  "ueber",
  "seit",
  "ohne",
]);

// Language words may lead a name as 1-3 tokens.
export const LANG_WORDS = new Set([
  "german",
  "germanisch",
  "deutsch",
  "englisch",
  "english",
  "norwegian",
  "norsk",
  "japanese",
  "japanisch",
  "korean",
  "koreanisch",
  "chinese",
  "chinesisch",
  "french",
  "italian",
  "italienisch",
  "spanish",
  "spanisch",
  "polish",
  "russian",
  "turkish",
]);

// Next to an audio token "5 1" spells a speaker layout, which makes the pair
// junk.
const AUDIO_TOKENS = new Set([
  "md",
  "ld",
  "hd",
  "dd",
  "ac3",
  "aac",
  "dts",
  "truehd",
  "opus",
  "flac",
  "mp3",
  "atmos",
  "dtshd",
  "dtv",
]);

/** Strips edge punctuation and lowercases a token. */
function trimmed(token: string): string {
  return token.replace(/^[._\- ]+|[._\- ]+$/g, "").toLowerCase();
}

/** True for a token on the junk list or matching a junk pattern. */
function isJunk(token: string): boolean {
  const plain = trimmed(token);
  return (
    JUNK_TOKENS.has(plain) ||
    JUNK_TOKENS.has(norm(token)) ||
    JUNK_PATTERNS.some((pattern) => pattern.test(token) || pattern.test(plain))
  );
}

// Junk tokens out of a release name.
//
// - a trailing digit pair ("… 1 5") is a collection range
// - "5 1" / "1 5" next to an audio token is the 5.1 spec
// - a single digit AT THE END stays ("Der Pate 2", "Iron Man 3")
// - an empty result falls back to the original name
// - "… aka K 9 UK" is an alternative title tail
export function cleanName(name: string | null | undefined): string {
  let tokens = (name ?? "").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return name ?? "";

  const last = tokens[tokens.length - 1] ?? "";
  const beforeLast = tokens[tokens.length - 2] ?? "";

  if (
    tokens.length >= 2 &&
    /^\d+$/.test(last) &&
    last.length <= 2 &&
    /^\d+$/.test(beforeLast) &&
    Number(beforeLast) <= Number(last) &&
    beforeLast === "1"
  ) {
    tokens = tokens.slice(0, -2);
  }

  const flat = new Set(tokens.map((token) => trimmed(token)));
  if ([...flat].some((token) => AUDIO_TOKENS.has(token))) {
    for (const [first, second] of [
      ["5", "1"],
      ["1", "5"],
    ]) {
      for (let index = 0; index < tokens.length - 1; index += 1) {
        const left = trimmed(tokens[index] ?? "");
        const right = trimmed(tokens[index + 1] ?? "");
        if (left === first && right === second) {
          tokens = [...tokens.slice(0, index), ...tokens.slice(index + 2)];
          break;
        }
      }
    }
  }

  const kept = tokens.filter((token, index) => {
    if (!isJunk(token)) return true;
    return /^\d$/.test(trimmed(token)) && index === tokens.length - 1;
  });

  const joined = kept.length > 0 ? kept.join(" ") : (name ?? "");
  return joined.replace(/\s+aka\s+\S+(?:\s+\S+)?$/i, "");
}
