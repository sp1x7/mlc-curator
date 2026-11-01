// Tunables of the media pipeline: where the files land, how a release is named,
// how many transfers run at once. Every value is one settings row, read through
// the helpers of `server/settings/store.ts`.

import { isAbsolute, join, resolve } from "node:path";
import { NAME_FORMAT_DEFAULTS } from "@shared/types/settings";
import { DOWNLOAD_FOLDER_KEY } from "../settings/keys";
import { numberSetting, on, setting } from "../settings/store";

/**
 * Every key the pipeline reads, named once. Each key is also a field of the
 * settings window, so a rename has to touch both lists.
 */
export const CONFIG_KEYS = {
  folder: DOWNLOAD_FOLDER_KEY,
  movies: "subdir_movies",
  series: "subdir_series",
  other: "subdir_other",
  maxJobs: "download_max_jobs",
  parallel: "download_max_parallel",
  perFileKb: "download_speed_per_kb",
  totalKb: "download_speed_total_kb",
  retriesFile: "download_retries_file",
  retriesTotal: "download_retries_total",
  delayFileSeconds: "download_retry_delay_file",
  delayTotalSeconds: "download_retry_delay_total",
  resume: "download_resume",
} as const;

/** Where the ftp folders land. Empty falls back to a folder under data/. */
export function downloadFolder(): string {
  const stored = setting(CONFIG_KEYS.folder).trim();
  if (stored && isAbsolute(stored)) return stored;
  return resolve(join(process.cwd(), "data", "downloads"));
}

export type Subfolders = { movies: string; series: string; other: string };

/** Group folders inside the library; the German words are the default. */
export function subfolders(): Subfolders {
  return {
    movies: setting(CONFIG_KEYS.movies) || "Filme",
    series: setting(CONFIG_KEYS.series) || "Serien",
    other: setting(CONFIG_KEYS.other) || "Unsortiert",
  };
}

export type NameFormats = Record<keyof typeof NAME_FORMAT_DEFAULTS, string>;

/** One format string per key of NAME_FORMAT_DEFAULTS, settings row first and
    the default behind it. */
export function nameFormats(): NameFormats {
  const formats: NameFormats = { ...NAME_FORMAT_DEFAULTS };
  for (const key of Object.keys(formats) as Array<keyof NameFormats>) {
    formats[key] = setting(key) || formats[key];
  }
  return formats;
}

export type DownloadLimits = {
  /** Releases that run at the same time. */
  maxJobs: number;
  /** Files of one release at the same time. */
  parallel: number;
  /** KB/s per file; 0 is off. */
  perFileKb: number;
  /** KB/s over all files; 0 is off. */
  totalKb: number;
  retriesFile: number;
  retriesTotal: number;
  delayFileSeconds: number;
  delayTotalSeconds: number;
};

/** Releases at the same time. An empty row gives three; a stored 0 gives one
    job, the smallest answer. */
function maxJobs(): number {
  const jobs = numberSetting(CONFIG_KEYS.maxJobs, 3);
  return jobs > 0 ? jobs : 1;
}

export function downloadLimits(): DownloadLimits {
  return {
    maxJobs: maxJobs(),
    parallel: Math.max(1, numberSetting(CONFIG_KEYS.parallel, 1)),
    perFileKb: numberSetting(CONFIG_KEYS.perFileKb),
    totalKb: numberSetting(CONFIG_KEYS.totalKb),
    retriesFile: numberSetting(CONFIG_KEYS.retriesFile),
    retriesTotal: numberSetting(CONFIG_KEYS.retriesTotal),
    delayFileSeconds: numberSetting(CONFIG_KEYS.delayFileSeconds),
    delayTotalSeconds: numberSetting(CONFIG_KEYS.delayTotalSeconds),
  };
}

/** `download_resume`: transfers that were cut off start again at boot. */
export function resumeAtBoot(): boolean {
  return on(CONFIG_KEYS.resume);
}
