// The field map every settings surface builds on: it names the keys, says how
// each one is rendered, and puts it into one area and group.

/** The areas the map is split into, in the order they show. */
export type SettingsArea = "credentials" | "board" | "download" | "library" | "upgrades" | "others";

/** text: plain line · secret: write-only · number: digits · switch: 0/1 · path: folder */
export type SettingKind = "text" | "secret" | "number" | "switch" | "path";

export type SettingField = {
  /** Row in the settings table. */
  key: string;
  kind: SettingKind;
  /** With the value 0 the feature the key drives stands switched off. */
  zeroMeansOff?: boolean;
  /** Lowest value the input lets through. */
  min?: number;
  /** Value a caller reads while the settings row stays absent. */
  initial?: string;
};

export type SettingGroup = {
  id: string;
  /** Group that carries the chips of `NAME_PLACEHOLDERS` above its fields. */
  placeholders?: boolean;
  fields: SettingField[];
};

export type SettingsAreaDef = {
  id: SettingsArea;
  groups: SettingGroup[];
};

/** The name formats the naming fields fall back to; every naming `initial` above
 *  points here. */
export const NAME_FORMAT_DEFAULTS = {
  name_movie_folder: "<title> (<year>)",
  name_movie_file: "<title> (<year>) <quality> <audio>",
  name_series_folder: "<title> (<year>)",
  name_season_folder: "Season <season>",
  name_episode_file: "<title> - S<season>E<episode> - <episode_title>",
} as const;

/** Chips that drop into the name format the cursor last rested in. */
export const NAME_PLACEHOLDERS = [
  "<title>",
  "<year>",
  "<season>",
  "<episode>",
  "<episode_title>",
  "<quality>",
  "<audio>",
] as const;

export const SETTINGS_AREAS: SettingsAreaDef[] = [
  {
    id: "credentials",
    groups: [
      {
        id: "access",
        fields: [
          { key: "board_user", kind: "text" },
          { key: "board_password", kind: "secret" },
          { key: "tmdb_api_key", kind: "secret" },
          { key: "sfdl_password", kind: "secret" },
        ],
      },
    ],
  },
  {
    id: "board",
    groups: [
      {
        id: "pages",
        fields: [
          { key: "board_max_pages", kind: "number", min: 1 },
          { key: "board_request_delay_ms", kind: "number", zeroMeansOff: true },
          { key: "board_challenge_attempts", kind: "number", zeroMeansOff: true },
          { key: "board_challenge_max_bytes", kind: "number", zeroMeansOff: true },
        ],
      },
      {
        id: "sync",
        fields: [
          { key: "catalog_sync_at_boot", kind: "switch" },
          { key: "catalog_sync_interval_min", kind: "number", zeroMeansOff: true },
        ],
      },
    ],
  },
  {
    id: "download",
    groups: [
      {
        id: "fetch",
        fields: [
          { key: "download_max_parallel", kind: "number", min: 1 },
          { key: "download_max_jobs", kind: "number", min: 1 },
          { key: "download_max_per_host", kind: "number", min: 1 },
          { key: "download_resume", kind: "switch" },
          { key: "download_speed_per_kb", kind: "number", zeroMeansOff: true },
          { key: "download_speed_total_kb", kind: "number", zeroMeansOff: true },
        ],
      },
      {
        id: "retry",
        fields: [
          { key: "download_retries_file", kind: "number", zeroMeansOff: true },
          { key: "download_retries_total", kind: "number", zeroMeansOff: true },
          { key: "download_retry_delay_file", kind: "number", zeroMeansOff: true },
          { key: "download_retry_delay_total", kind: "number", zeroMeansOff: true },
        ],
      },
      {
        id: "archive",
        fields: [
          { key: "rar_auto_extract", kind: "switch" },
          { key: "rar_delete_extracted", kind: "switch" },
          { key: "prune_empty_source", kind: "switch" },
        ],
      },
      {
        id: "place",
        fields: [
          { key: "download_folder", kind: "path" },
          { key: "subdir_movies", kind: "path", initial: "Filme" },
          { key: "subdir_series", kind: "path", initial: "Serien" },
          { key: "subdir_other", kind: "path", initial: "Unsortiert" },
          { key: "flat_mode", kind: "switch" },
        ],
      },
      {
        id: "naming",
        placeholders: true,
        fields: [
          {
            key: "name_movie_folder",
            kind: "text",
            initial: NAME_FORMAT_DEFAULTS.name_movie_folder,
          },
          { key: "name_movie_file", kind: "text", initial: NAME_FORMAT_DEFAULTS.name_movie_file },
          {
            key: "name_series_folder",
            kind: "text",
            initial: NAME_FORMAT_DEFAULTS.name_series_folder,
          },
          {
            key: "name_season_folder",
            kind: "text",
            initial: NAME_FORMAT_DEFAULTS.name_season_folder,
          },
          {
            key: "name_episode_file",
            kind: "text",
            initial: NAME_FORMAT_DEFAULTS.name_episode_file,
          },
        ],
      },
      {
        id: "enrich",
        fields: [
          { key: "tmdb_fill_missing", kind: "switch" },
          { key: "movie_imdb_from_nfo", kind: "switch" },
        ],
      },
    ],
  },
  {
    id: "library",
    groups: [
      {
        id: "scan",
        fields: [
          { key: "library_root", kind: "path" },
          { key: "lib_scan_at_boot", kind: "switch" },
          { key: "lib_scan_interval_min", kind: "number", zeroMeansOff: true },
        ],
      },
    ],
  },
  {
    id: "upgrades",
    groups: [
      {
        id: "auto",
        fields: [
          { key: "upgrades_enabled", kind: "switch" },
          { key: "upgrade_auto_upgrade", kind: "switch", initial: "1" },
          { key: "upgrade_auto_wish", kind: "switch", initial: "1" },
        ],
      },
      {
        id: "runs",
        fields: [
          { key: "upgrade_lookback_days", kind: "number", min: 0, initial: "30" },
          { key: "upgrade_check_at_boot", kind: "switch" },
          { key: "upgrade_check_interval_min", kind: "number", zeroMeansOff: true, initial: "0" },
        ],
      },
    ],
  },
  {
    id: "others",
    groups: [
      {
        id: "tools",
        fields: [
          { key: "probe_binary", kind: "text" },
          { key: "tmdb_language", kind: "text", initial: "de-DE" },
          { key: "tmdb_region", kind: "text", initial: "DE" },
        ],
      },
    ],
  },
];

/**
 * Every key of the areas above, keyed by the key itself. A key outside the map
 * reads as undefined, and that is the case a caller's fallback answers.
 */
export const SETTING_FIELDS: Record<string, SettingField | undefined> = Object.fromEntries(
  SETTINGS_AREAS.flatMap((area) => area.groups.flatMap((group) => group.fields)).map((field) => [
    field.key,
    field,
  ]),
);

/** The groups of one area in map order; an area off the map answers empty. */
export function settingGroupsOf(area: SettingsArea): SettingGroup[] {
  const def = SETTINGS_AREAS.find((entry) => entry.id === area);
  return def ? def.groups : [];
}

/** The keys of one area, flattened over its groups. */
export function settingKeysOf(area: SettingsArea): string[] {
  return settingGroupsOf(area).flatMap((group) => group.fields.map((field) => field.key));
}

/** Answer of `GET /api/settings`: a secret arrives as a flag, its value stays
    behind. */
export type SettingsSnapshot = {
  values: Record<string, string>;
  /** Secret keys: true when a value is stored. */
  secrets: Record<string, boolean>;
};

/** Body of `PUT /api/settings`. An empty secret value leaves the row alone. */
export type SettingsPatch = {
  values: Record<string, string>;
};

/** One folder level for the path picker: the folder, the one above it, and its
    child folders. */
export type DirPage = {
  path: string;
  parent: string | null;
  dirs: string[];
};

/** What the board login knows about the stored session. */
export type BoardSession = {
  user: string;
  cookieSet: boolean;
  passwordSet: boolean;
};
