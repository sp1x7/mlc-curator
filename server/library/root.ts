// The library folder: one settings row, one reader, one writer.
//
// The row holds a path, and the checks of this module decide when it counts as a
// root. A typed path that stays absent off the disk stays a plain string, so the
// scan answers an empty stand and the organizer answers its own error text in
// place of placing files in a made-up folder.

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { LIBRARY_ROOT_KEY } from "../settings/keys";
import { setting, writeSetting } from "../settings/store";

/** The configured folder, standing or absent; null for an empty row. */
export function storedRoot(): string | null {
  return setting(LIBRARY_ROOT_KEY).trim() || null;
}

/** Folder holding the library; null while the row is empty or the folder stands
    absent. */
export function libraryRoot(): string | null {
  const stored = storedRoot();
  return stored !== null && existsSync(stored) ? stored : null;
}

/** The answer of the write: the folder that is stored now, or the reason. */
export type RootAnswer = { ok: true; root: string } | { error: string };

/**
 * Writes the root the caller asked for. The path has to be absolute and has to
 * stand: a path typed wrong answers its error text at once, ahead of an empty
 * library later, and a relative one would move with the working directory of the
 * server.
 */
export function setLibraryRoot(wanted: string | null | undefined): RootAnswer {
  const asked = wanted?.trim();

  if (!asked) return { error: "root fehlt" };
  if (!isAbsolute(asked)) return { error: "root muss ein absoluter Pfad sein" };

  const root = resolve(asked);
  if (!existsSync(root)) return { error: "root existiert nicht" };

  writeSetting(LIBRARY_ROOT_KEY, root);

  return { ok: true, root };
}
