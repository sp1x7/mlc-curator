// The settings table has one owner: this module.
//
// Every read of a stored value, every write, and the snapshot the settings api
// answers are built from these helpers, so the meaning of a row is decided once:
// text as it stands, an absent row as the fallback the caller names, "1" as on,
// and a secret kept inside the server. `SETTING_FIELDS` names the keys that may
// be written at all.

import { SETTING_FIELDS, type SettingsSnapshot } from "@shared/types/settings";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { settings } from "../db/schema";

/** One stored value, null for a key whose row is absent. */
export function settingOf(key: string): string | null {
  return (
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()?.value ??
    null
  );
}

/** One stored value; a key whose row is absent reads as the empty text. */
export function setting(key: string): string {
  return settingOf(key) ?? "";
}

/**
 * Reads the stored value as a number. An absent row, an empty text, or a value
 * outside the number shapes gives `fallback`; a stored 0 stays a real 0.
 */
export function numberSetting(key: string, fallback = 0): number {
  const stored = setting(key).trim();
  if (stored === "") return fallback;

  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** A stored switch: only "1" is on. */
export function on(key: string): boolean {
  return setting(key) === "1";
}

/** True when a secret key holds a value; the value itself stays inside the row. */
export function secretSet(key: string): boolean {
  return settingOf(key) !== null && setting(key) !== "";
}

/** Writes one row as it arrived. */
export function writeSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/**
 * Writes a whole area at once: keys outside the field map are skipped, a secret
 * sent as an empty string keeps its row, every other key goes in as it arrived.
 * Returns the keys that changed.
 */
export function writeSettings(values: Record<string, unknown>): string[] {
  const written: string[] = [];

  for (const [key, raw] of Object.entries(values)) {
    const field = SETTING_FIELDS[key];
    if (!field || typeof raw !== "string") continue;
    if (field.kind === "secret" && raw === "") continue;

    writeSetting(key, raw);
    written.push(key);
  }

  return written;
}

/**
 * A value per plain key, plus a flag per secret key telling whether a row holds
 * a value; the secret text itself stays out of the answer.
 */
export function snapshot(): SettingsSnapshot {
  const values: Record<string, string> = {};
  const secrets: Record<string, boolean> = {};

  for (const [key, field] of Object.entries(SETTING_FIELDS)) {
    if (!field) continue;
    const row = settingOf(key);

    if (field.kind === "secret") {
      secrets[key] = Boolean(row);
      continue;
    }
    if (row !== null) values[key] = row;
  }

  return { values, secrets };
}
