// Keys of the settings table that more than one module reads. A key of a single
// module stays a local string in that module; a shared key gets one constant, so
// each name is written once.

export const LIBRARY_ROOT_KEY = "library_root";
export const DOWNLOAD_FOLDER_KEY = "download_folder";
export const PROBE_BINARY_KEY = "probe_binary";

export const BOARD_USER_KEY = "board_user";
export const BOARD_PASSWORD_KEY = "board_password";
// Its own constant on purpose: `board_password` signs the user in, while the info
// file of a thread is sealed with a different key.
export const SFDL_PASSWORD_KEY = "sfdl_password";

export const TMDB_KEY = "tmdb_api_key";
export const TMDB_LANGUAGE = "tmdb_language";
export const TMDB_REGION = "tmdb_region";

export const UPGRADES_ENABLED = "upgrades_enabled";
export const UPGRADE_AUTO_UPGRADE = "upgrade_auto_upgrade";
export const UPGRADE_AUTO_WISH = "upgrade_auto_wish";
export const UPGRADE_LOOKBACK_DAYS = "upgrade_lookback_days";
/** Written when a check starts; a look back of 0 days starts from it. */
export const UPGRADE_LAST_CHECK_AT = "upgrade_last_check_at";

/** Keys of the passes the server schedules at boot. */
export const PASS_KEYS = {
  library: { atBoot: "lib_scan_at_boot", everyMin: "lib_scan_interval_min" },
  catalog: { atBoot: "catalog_sync_at_boot", everyMin: "catalog_sync_interval_min" },
  upgrades: { atBoot: "upgrade_check_at_boot", everyMin: "upgrade_check_interval_min" },
  downloads: { atBoot: "download_resume", everyMin: "" },
} as const;
