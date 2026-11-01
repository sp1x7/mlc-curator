// Display text of the Settings window, keyed by area, group and setting key.

import type { SettingsArea } from "@shared/types/settings";

/** The word of an area in the left list. */
export const AREA_LABELS: Record<SettingsArea, string> = {
  credentials: "Credentials",
  board: "Board",
  download: "Download",
  library: "Library",
  upgrades: "Upgrades",
  others: "Others",
};

/** The word of a group head inside an area. */
export const GROUP_LABELS: Record<string, string> = {
  access: "Access",
  pages: "Board pages",
  sync: "Snapshot runs",
  fetch: "Downloads",
  retry: "Retries",
  archive: "Extracting",
  place: "Destination",
  naming: "Name formats",
  enrich: "Filling gaps",
  scan: "Library scan",
  auto: "Automatic",
  runs: "Upgrade runs",
  tools: "Tools",
};

export type FieldText = {
  label: string;
  /** Shown after a number field. */
  unit?: string;
  /** Quiet line under the field. */
  hint?: string;
};

/** The words of one setting key. */
export const FIELD_TEXT: Record<string, FieldText> = {
  board_user: { label: "Board user" },
  board_password: {
    label: "Board password",
    hint: "an empty field keeps the stored one",
  },
  tmdb_api_key: {
    label: "TMDB API key",
    hint: "an empty field keeps the stored one",
  },

  board_max_pages: { label: "Pages per forum", hint: "pages read per forum in one snapshot" },
  board_request_delay_ms: {
    label: "Request delay",
    unit: "ms",
    hint: "wait between two board requests",
  },
  board_challenge_attempts: {
    label: "Attempts per page",
    hint: "tries per page when the challenge fails",
  },
  board_challenge_max_bytes: {
    label: "Challenge from",
    unit: "bytes",
    hint: "a response this large and larger gets a challenge",
  },

  catalog_sync_at_boot: { label: "Sync at startup" },
  catalog_sync_interval_min: {
    label: "Sync interval",
    unit: "min",
    hint: "wait between two board snapshots",
  },

  download_folder: { label: "Download folder", hint: "empty falls back to a folder under data/" },
  download_max_parallel: { label: "Parallel files", hint: "files of one release at the same time" },
  download_max_jobs: { label: "Parallel jobs", hint: "releases at the same time" },
  download_max_per_host: {
    label: "Parallel per FTP host",
    hint: "ftp connections to one server at the same time",
  },
  download_resume: {
    label: "Resume at startup",
    hint: "continue interrupted downloads when the server starts",
  },
  download_speed_per_kb: { label: "Speed per file", unit: "KB/s" },
  download_speed_total_kb: { label: "Speed all files", unit: "KB/s" },

  download_retries_file: { label: "Retries per file", hint: "after a broken download" },
  download_retries_total: { label: "Retries per download", hint: "for the whole release" },
  download_retry_delay_file: { label: "Wait per file", unit: "s" },
  download_retry_delay_total: { label: "Wait per download", unit: "s" },

  rar_auto_extract: { label: "Unpack RAR", hint: "archives found in a download" },
  rar_delete_extracted: { label: "Delete archive", hint: "once it is unpacked" },
  prune_empty_source: {
    label: "Prune source folder",
    hint: "delete the release folder once it holds nothing",
  },

  subdir_movies: { label: "Movies subfolder", hint: "name inside the library folder" },
  subdir_series: { label: "Series subfolder", hint: "name inside the library folder" },
  subdir_other: { label: "Unsorted subfolder", hint: "name inside the library folder" },
  flat_mode: { label: "Flat mode" },

  name_movie_folder: { label: "Movie folder" },
  name_movie_file: { label: "Movie file" },
  name_series_folder: { label: "Series folder" },
  name_season_folder: { label: "Season folder" },
  name_episode_file: { label: "Episode file" },

  tmdb_fill_missing: {
    label: "Fill from TMDB",
    hint: "write the NFO and images that are missing; off writes none",
  },
  movie_imdb_from_nfo: {
    label: "IMDb id from NFO",
    hint: "take the film id out of the release NFO",
  },

  library_root: { label: "Library folder", hint: "empty falls back to a folder under data/" },
  lib_scan_at_boot: { label: "Scan at startup" },
  lib_scan_interval_min: {
    label: "Scan interval",
    unit: "min",
    hint: "wait between two library passes",
  },

  upgrades_enabled: {
    label: "Auto upgrades",
    hint: "let the app replace a title it owns by a better release of its own",
  },
  upgrade_auto_upgrade: {
    label: "Load better version",
    hint: "a release above the resolution you own",
  },
  upgrade_auto_wish: {
    label: "Load missing wish",
    hint: "a title that is missing and reaches the target of its wish",
  },
  upgrade_lookback_days: {
    label: "Look back",
    unit: "days",
    hint: "board releases this old are still checked, 0 only what arrives new",
  },
  upgrade_check_at_boot: { label: "Check at startup" },
  upgrade_check_interval_min: {
    label: "Check interval",
    unit: "min",
    hint: "wait between two upgrade checks, 0 never",
  },

  probe_binary: { label: "Probe program", hint: "empty takes the one from PATH" },
  tmdb_language: { label: "TMDB language" },
  tmdb_region: { label: "TMDB region" },
};

/** The words of the buttons, states and placeholders of the window. */
export const TEXT = {
  areas: "Areas",
  save: "Save",
  saved: "saved",
  discard: "Discard changes?",
  open: "open",
  set: "stored",
  notSet: "not stored",
  off: "off",
  browse: "Browse",
  choose: "Choose this folder",
  cancel: "Cancel",
  up: "one level up",
  signIn: "Sign in",
  signOut: "Sign out",
  signedIn: (user: string): string => `signed in as ${user}`,
  signedOut: "no board session",
  signInDone: "signed in",
  signOutDone: "signed out",
  syncNow: "Sync now",
  syncRunning: "syncing",
  scanNow: "Scan now",
  scanRunning: "scanning",
  checkNow: "Check now",
};
