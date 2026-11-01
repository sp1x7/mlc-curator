import type { NameInfo } from "@shared/types/library";
import { parseName } from "../tmdb/name";

const QUALITY_RE = /\b(2160p|2160|1440p|1080p|1080|720p|720|480p|480|4k|uhd)\b/i;
const CODEC_RE = /\b(x264|x265|h\.?264|h\.?265|hevc|avc|av1|vp9|vc-?1|mpeg-?2|divx|xvid)\b/i;
const HDR_RE = /\b(hdr10\+|hdr10|hdr|dolby ?vision|dv|hlg)\b/i;
// A language word, a codec word, or both, with the channel count behind it.
const AUDIO_RE =
  /\b(?:(german|deutsch|ger|multi|english|eng|dutch|french|français)\b[\s._-]*)?\b(dts-hd ma|dts-hd|dts-hr|dts ma|dts|truehd(?:[\s._-]*atmos)?|atmos|ac-?3|e-?ac-?3|eac3|ddp?5?|dd|aac|mp2|mp3|flac|opus)([\s._-]*(?:5\.1|7\.1|2\.0|1\.0|5 1))?\b/i;

const QUALITY_LABELS: Record<string, string> = {
  "2160": "2160p",
  "2160p": "2160p",
  "4k": "2160p",
  uhd: "2160p",
  "1440p": "1440p",
  "1080": "1080p",
  "1080p": "1080p",
  "720": "720p",
  "720p": "720p",
  "480": "480p",
  "480p": "480p",
};

const CODEC_LABELS: Record<string, string> = {
  x264: "x264",
  "h.264": "x264",
  h264: "x264",
  avc: "x264",
  x265: "x265",
  "h.265": "x265",
  h265: "x265",
  hevc: "x265",
  av1: "AV1",
  vp9: "VP9",
  vc1: "VC-1",
  "vc-1": "VC-1",
  mpeg2: "MPEG-2",
  "mpeg-2": "MPEG-2",
  divx: "DivX",
  xvid: "Xvid",
};

const HDR_LABELS: Record<string, string> = {
  "hdr10+": "HDR10+",
  hdr10: "HDR10",
  hdr: "HDR",
  dolbyvision: "Dolby Vision",
  "dolby vision": "Dolby Vision",
  dv: "Dolby Vision",
  hlg: "HLG",
};

// The quality word in its p-less form: "4K UHD" and "2160" name the same file.
function qualityOf(name: string): string | null {
  const token = QUALITY_RE.exec(name)?.[1]?.toLowerCase();
  return token ? (QUALITY_LABELS[token] ?? null) : null;
}

/** Maps the codec word of a name through CODEC_LABELS; anything else answers
    null. */
function codecOf(name: string): string | null {
  const token = CODEC_RE.exec(name)?.[1]?.toLowerCase();
  return token ? (CODEC_LABELS[token] ?? null) : null;
}

/** Maps the hdr word of a name through HDR_LABELS; anything else answers null. */
function hdrOf(name: string): string | null {
  const token = HDR_RE.exec(name)?.[1]?.toLowerCase();
  return token ? (HDR_LABELS[token] ?? null) : null;
}

/** Builds `Language CODEC channels` out of the audio match; a name that lists a
    codec word gets a label, anything else answers null. */
function audioOf(name: string): string | null {
  const match = AUDIO_RE.exec(name);
  if (!match) return null;

  const language = match[1]?.trim();
  const codec = (match[2] ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  const channels = match[3]?.replace(/\s+/g, ".").trim();

  if (!codec) return null;

  return [language ? language.charAt(0).toUpperCase() + language.slice(1) : null, codec, channels]
    .filter(Boolean)
    .join(" ");
}

// A release group sits behind the last hyphen, after a quality or codec word.
const GROUP_TAIL_RE = /-([a-z0-9]{2,20})$/i;
const PRE_GROUP_RE =
  /(?:2160p|1080p|720p|480p|1440p|4k|uhd|hdr10\+?|hdr|dolby ?vision|x26[45]|hevc|avc|av1|ac3|eac3|dts(?:-hd)?(?: ?ma)?|truehd|atmos|web-?dl|webrip|bluray|bdrip|remux|ger(?:man)?|multi)[\s._-]*$/i;

/** The release group behind the last hyphen, taken only when a quality or codec
    word sits right in front of it. */
function groupOf(name: string): string | null {
  const stem = name.replace(/\.[a-z0-9]{2,5}$/i, "");
  const tail = GROUP_TAIL_RE.exec(stem)?.[1];
  if (!tail) return null;
  if (!PRE_GROUP_RE.test(stem.slice(0, stem.length - tail.length - 1))) return null;
  return tail;
}

/** `S02E03+E04` for a season with its episodes; null while season or episode list
    is empty. */
function episodeLabelOf(season: number | null, episodes: number[]): string | null {
  if (season === null || episodes.length === 0) return null;

  const parts = episodes.map((episode) => `E${String(episode).padStart(2, "0")}`);
  return `S${String(season).padStart(2, "0")}${parts.join("+")}`;
}

/** Every read-out field of a file or folder name in one answer. */
export function nameInfoOf(name: string): NameInfo {
  const tokens = parseName(name);

  return {
    episodeLabel: episodeLabelOf(tokens.season, tokens.episodes),
    season: tokens.season,
    episodes: tokens.episodes,
    quality: qualityOf(name),
    codec: codecOf(name),
    hdr: hdrOf(name),
    audio: audioOf(name),
    group: groupOf(name),
  };
}
