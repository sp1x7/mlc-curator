import type { DownloadState } from "@shared/types/downloads";
import type { Probe } from "@shared/types/library";

/** Word shown for a state in the release row. */
export const STATE_WORD: Record<DownloadState, string> = {
  queued: "queued",
  listing: "reading folder",
  downloading: "downloading",
  extracting: "unpacking",
  measuring: "measuring",
  planned: "ready",
  stopped: "stopped",
  error: "failed",
};

/** Colour of the state word and of the bar. */
export const STATE_TONE: Record<DownloadState, string> = {
  queued: "text-muted-foreground",
  listing: "text-info",
  downloading: "text-acc1",
  extracting: "text-info",
  measuring: "text-info",
  planned: "text-ok",
  stopped: "text-wrn",
  error: "text-err",
};

/** States that mean the release works right now. */
export const BUSY: DownloadState[] = [
  "queued",
  "listing",
  "downloading",
  "extracting",
  "measuring",
];

// The step of the byte ladder.
const UNIT = 1024;

/** Bytes as text on the 1024 ladder, e.g. `1.4 GB`. */
export function bytesOf(value: number): string {
  if (value < UNIT) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unit = "";

  for (const step of units) {
    size /= UNIT;
    unit = step;
    if (size < UNIT) break;
  }

  return `${size.toFixed(size < 10 ? 2 : 1)} ${unit}`;
}

/** A byte rate as the byte text with "/s" behind. */
export function speedOf(value: number): string {
  return `${bytesOf(value)}/s`;
}

/** `12:34` or `1:02:11` out of a second count. */
export function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const tail = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;

  return hours > 0 ? `${hours}:${tail}` : tail;
}

/** Time a transfer has run, frozen once it finished. */
export function durationOf(from: string | null, to: string | null): string | null {
  if (!from) return null;

  return clockOf(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 1000);
}

/** Share of a file that is on the disk; 0 while the size is unknown. */
export function shareOf(bytes: number, size: number | null): number {
  return size && size > 0 ? Math.min(1, bytes / size) : 0;
}

/** Last segment of a path below the release folder. */
export function nameOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Folders a file sits in, below the release folder. */
export function belowOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

/** What one chosen file of a release means for the reader. */
export function fileWord(bytes: number, size: number | null, chosen: boolean): string {
  if (!chosen) return "not chosen";
  if (size !== null && size > 0 && bytes >= size) return "done";
  if (bytes === 0) return "not started";

  return size === null ? `${bytesOf(bytes)} on disk` : "partial";
}

/** Archive part: first volume, tail volume, rev par or a split piece. */
export function isArchive(path: string): boolean {
  return /\.(rar|zip|7z|rev|\d{2,3})$/i.test(nameOf(path));
}

/**
 * Name of the volume set a part belongs to: the volumes of one archive share
 * everything before their volume tail, so one pick always takes the whole set and
 * the unpack gets a complete series.
 */
export function setKey(path: string): string {
  const name = nameOf(path);
  const stem = name
    .replace(/\.part\d+\.(rar|zip|7z)$/i, "")
    .replace(/\.(rar|zip|7z|rev|\d{2,3})$/i, "");

  return `${belowOf(path)}/${stem}`;
}

/** `S01` */
export function seasonLabel(season: number): string {
  return `S${String(season).padStart(2, "0")}`;
}

/** `S01E03` */
export function episodeLabel(season: number, episode: number): string {
  return `${seasonLabel(season)}E${String(episode).padStart(2, "0")}`;
}

/** What ffprobe measured, in one line. */
export function probeLine(probe: Probe | null): string | null {
  if (probe === null) return null;

  const parts = [
    probe.height ? `${probe.height}p` : null,
    probe.videoCodec,
    probe.hdr,
    probe.runtimeMinutes ? `${probe.runtimeMinutes} min` : null,
    probe.audio.length > 0
      ? probe.audio
          .map((track) => track.language ?? track.codec)
          .filter(Boolean)
          .join("/")
      : null,
  ].filter((part): part is string => part !== null && part !== "");

  return parts.length > 0 ? parts.join(" ") : null;
}
