// Client of the settings area: the stored values, the board session, the board sync,
// the library pass, the upgrade check and the folder levels of the path picker.

import type { SyncState } from "@shared/types/catalog";
import type { LibraryStand } from "@shared/types/library";
import type {
  BoardSession,
  DirPage,
  SettingsPatch,
  SettingsSnapshot,
} from "@shared/types/settings";
import { clientOf } from "@web/lib/api";

// The area prefix of every path.
const settings = clientOf("settings");

/** The settings endpoints, one function each. */
export const settingsApi = {
  /** Every stored key with its value and metadata. */
  values: () => settings.get<SettingsSnapshot>("/"),

  /** Writes the changed keys and answers the new snapshot. */
  save: (patch: SettingsPatch) => settings.put<SettingsSnapshot>("/", patch),

  /** The board session: user, avatar and cookie stand. */
  session: () => settings.get<BoardSession>("/session"),

  /** Opens the board session with the stored credentials. */
  signIn: () => settings.post<{ ok: boolean }>("/session/login"),

  /** Drops the board session. */
  signOut: () => settings.post<{ ok: boolean }>("/session/logout"),

  /** How far the tag sync has come. */
  sync: () => settings.get<{ sync: SyncState }>("/board/sync"),

  /** Starts the tag sync and answers its stand. */
  startSync: () => settings.post<{ sync: SyncState }>("/board/sync"),

  /** How far the library pass has come. */
  scan: () => settings.get<{ stand: LibraryStand }>("/library/scan"),

  /** Starts the library pass and answers the stand. */
  startScan: () => settings.post<{ stand: LibraryStand }>("/library/scan"),

  /** Looks for new releases on the board. */
  startCheck: () => settings.post<{ ok: boolean }>("/upgrade/check"),

  /** One folder level for the picker. */
  folder: (path: string) => settings.get<DirPage>("/fs", { path }),
};
