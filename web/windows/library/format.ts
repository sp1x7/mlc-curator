import type { NameInfo, Probe } from "@shared/types/library";

// The words the library tables print: quality labels, sizes, dates, audio lines and
// ratings.
export const QUALITY_LABEL: Record<string, string> = {
  "2160p": "4K",
  "1440p": "1440p",
  "1080p": "1080p",
  "720p": "720p",
  "480p": "480p",
};

/** Bytes as text on the 1024 ladder; zero answers "". */
export function sizeText(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let shown = bytes;
  let unit = 0;

  while (shown >= 1024 && unit < units.length - 1) {
    shown /= 1024;
    unit += 1;
  }

  return `${shown.toFixed(shown >= 10 ? 0 : 1)} ${units[unit]}`;
}

// The measured height decides; the word in the name steps in when the measurement
// stays absent.
export function qualityOfProbe(probe: Probe | null, nameInfo: NameInfo): string | null {
  if (probe?.height) return `${probe.height}p`;
  return nameInfo.quality;
}

/** The table word of a quality; a word off the table stands as it is. */
export function qualityLabel(quality: string | null): string {
  if (!quality) return "";
  return QUALITY_LABEL[quality] ?? quality;
}

/** Minutes as `1 h 5 min`; zero answers "". */
export function runtimeText(minutes: number | null): string {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h ${rest} min` : `${rest} min`;
}

/** An iso stamp to the minute, "T" replaced by a space. */
export function dateText(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 16).replace("T", " ");
}

/** An air date as it stands, null as "". */
export function airDateText(date: string | null): string {
  return date ?? "";
}

// 2011-05-03 becomes 03.05.11, the shape the narrow tables need.
export function shortDateText(date: string | null): string {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}.${month}.${year.slice(2)}`;
}

/** Channels as a layout word: 1.0, 2.0, or 5.1 for six channels. */
function channelText(channels: number | null): string | null {
  if (!channels) return null;
  if (channels === 1) return "1.0";
  if (channels === 2) return "2.0";
  return `${channels - 1}.1`;
}

/** One part per audio track: language, codec and channel layout. */
export function audioText(probe: Probe | null): string {
  if (!probe) return "";
  return probe.audio
    .map((track) =>
      [track.language, track.codec, channelText(track.channels)].filter(Boolean).join(" "),
    )
    .join(" · ");
}

/** The leading word of every subtitle line, comma separated. */
export function subtitleText(probe: Probe | null): string {
  if (!probe) return "";
  return probe.subtitles.map((line) => line.split(" ")[0] ?? line).join(", ");
}

/** The rating to one decimal; zero and null answer "". */
export function ratingText(rating: number | null): string {
  if (rating === null || rating === 0) return "";
  return rating.toFixed(1);
}
