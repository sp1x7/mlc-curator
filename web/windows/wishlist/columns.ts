import { resRank } from "@shared/types/band";
import type { Probe } from "@shared/types/library";
import type { WishEntry } from "@shared/types/wishlist";

/** One column: key, label, width, and how the value sits. */
export type Column = {
  key: string;
  label: string;
  width: number;
  num?: boolean;
  mono?: boolean;
};

/** The columns of the wish list, left to right. */
export const COLUMNS: Column[] = [
  { key: "status", label: "status", width: 96 },
  { key: "type", label: "type", width: 62 },
  { key: "title", label: "title", width: 260 },
  { key: "year", label: "year", width: 52, num: true },
  { key: "minres", label: "min res", width: 66, mono: true },
  { key: "audio", label: "audio", width: 54, mono: true },
  { key: "inlib", label: "in lib", width: 54 },
  { key: "progress", label: "progress", width: 156 },
  { key: "matches", label: "catalog matches", width: 78, mono: true },
  { key: "added", label: "added", width: 62, num: true },
];

// The storage slot of the column widths.
const STORE_KEY = "wishlist.spalten";

/** The stored widths; absent or broken storage answers an empty map. */
export function loadWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  } catch {
    return {};
  }
}

/** Writes the widths to storage. */
export function saveWidths(widths: Record<string, number>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(widths));
  } catch {
    // A blocked storage costs the saved widths.
  }
}

// The order of the states when the status column sorts.
const RANK: Record<string, number> = { open: 0, part: 1, done: 2 };
// Seconds in an hour.
const HOUR = 3600;

/** Two digits, short numbers filled with a zero. */
export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// The age as the board writes it: 12m, 5h, 30d, 6w.
export function ageText(epoch: number): string {
  const minutes = Math.max(0, Date.now() / 1000 - epoch) / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 45) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}

/** Hours between an epoch stamp and now. */
function ageHours(epoch: number): number {
  return (Date.now() / 1000 - epoch) / HOUR;
}

/** How many catalog matches reach the target of the wish. */
export function matchesOk(wish: WishEntry): number {
  return wish.matches.filter((match) => match.verdict === "ok").length;
}

/** `have/expected` episodes of the wish. */
export function progressText(wish: WishEntry): string {
  const { have, expected } = wish.progress;
  return `${have}/${expected}`;
}

/** The share of episodes owned; an expectation of zero answers 0. */
export function progressPct(wish: WishEntry): number {
  return wish.progress.expected > 0 ? wish.progress.have / wish.progress.expected : 0;
}

/** Bytes as G, M or B. */
export function humanBytes(size: number): string {
  if (size >= 1e9) return `${(size / 1e9).toFixed(1)}G`;
  if (size >= 1e6) return `${Math.round(size / 1e6)}M`;
  return `${size}B`;
}

// One measured file: resolution, codec, hdr, container, runtime, then audio and
// subs behind.
export function probeLine(probe: Probe): string {
  const parts = [
    probe.height ? `${probe.height}p` : null,
    probe.videoCodec,
    probe.hdr ?? "sdr",
    probe.container ? `.${probe.container}` : null,
    probe.runtimeMinutes ? `${probe.runtimeMinutes} min` : null,
  ].filter((part): part is string => part !== null && part !== "");

  const audio = probe.audio
    .map((track) => [track.language, track.codec, track.channels ? `${track.channels}` : null])
    .filter((track) => track[0] !== null)
    .map((track) => track.filter(Boolean).join(" "));

  const tail = [
    audio.length > 0 ? `audio ${audio.join(", ")}` : null,
    probe.subtitles.length > 0 ? `subs ${probe.subtitles.join(", ")}` : null,
  ].filter((part): part is string => part !== null);

  return [...parts, ...tail].join(" · ");
}

/** True when every word of the query sits in title, original title, imdb id or tmdb id. */
export function searchHit(wish: WishEntry, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;

  const fields = [
    wish.identity.title,
    wish.identity.originalTitle ?? "",
    wish.identity.imdbId ?? "",
    String(wish.tmdbId),
  ].map((field) => field.toLowerCase());

  return wanted.split(/\s+/).every((term) => fields.some((field) => field.includes(term)));
}

/** The value a column sorts by; a key off the list answers 0. */
export function sortValue(wish: WishEntry, key: string): string | number {
  switch (key) {
    case "status":
      return RANK[wish.status] ?? 0;
    case "type":
      return wish.kind;
    case "title":
      return wish.identity.title;
    case "year":
      return wish.identity.year ?? 0;
    case "minres":
      return resRank(wish.target.minRes);
    case "audio":
      return wish.target.audio;
    case "inlib":
      return wish.inLibrary ? 1 : 0;
    case "progress":
      return progressPct(wish);
    case "matches":
      return matchesOk(wish);
    case "added":
      return ageHours(wish.createdAt);
    default:
      return 0;
  }
}
