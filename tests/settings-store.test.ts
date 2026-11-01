// The rules of the settings table: what an absent row means, what a switch means,
// what happens to a secret, and which folder the library may read.

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { libraryRoot, type RootAnswer, setLibraryRoot, storedRoot } from "../server/library/root";
import {
  LIBRARY_ROOT_KEY,
  TMDB_KEY,
  UPGRADE_AUTO_UPGRADE,
  UPGRADE_LOOKBACK_DAYS,
} from "../server/settings/keys";
import {
  numberSetting,
  on,
  secretSet,
  setting,
  snapshot,
  writeSetting,
  writeSettings,
} from "../server/settings/store";
import { settingRow } from "./rows";
import { clearTables } from "./setup";

beforeEach(async () => {
  await clearTables();
});

/** The reason of a refused write; the empty text when it was taken. */
function refusal(answer: RootAnswer): string {
  return "error" in answer ? answer.error : "";
}

describe("numberSetting", () => {
  test("no row and nonsense give the fallback, a stored zero stays a zero", () => {
    expect(numberSetting(UPGRADE_LOOKBACK_DAYS, 30)).toBe(30);

    settingRow(UPGRADE_LOOKBACK_DAYS, "0");
    expect(numberSetting(UPGRADE_LOOKBACK_DAYS, 30)).toBe(0);

    settingRow(UPGRADE_LOOKBACK_DAYS, "30");
    expect(numberSetting(UPGRADE_LOOKBACK_DAYS, 30)).toBe(30);

    settingRow(UPGRADE_LOOKBACK_DAYS, "zwei");
    expect(numberSetting(UPGRADE_LOOKBACK_DAYS, 30)).toBe(30);
  });
});

describe("on", () => {
  test("only the one is on, everything else including no row is off", () => {
    expect(on(UPGRADE_AUTO_UPGRADE)).toBe(false);

    settingRow(UPGRADE_AUTO_UPGRADE, "1");
    expect(on(UPGRADE_AUTO_UPGRADE)).toBe(true);

    settingRow(UPGRADE_AUTO_UPGRADE, "0");
    expect(on(UPGRADE_AUTO_UPGRADE)).toBe(false);

    settingRow(UPGRADE_AUTO_UPGRADE, "ja");
    expect(on(UPGRADE_AUTO_UPGRADE)).toBe(false);
  });
});

describe("writeSettings", () => {
  test("a key the field map does not name never reaches the table", async () => {
    const { db } = await import("../server/db/db");
    const { settings } = await import("../server/db/schema");

    const written = writeSettings({ upgrades_enabled: "1", not_a_setting_key: "1" });

    expect(written).toEqual(["upgrades_enabled"]);
    expect(setting("not_a_setting_key")).toBe("");
    expect(db.select().from(settings).all()).toHaveLength(1);
  });

  test("a secret sent as an empty text keeps its row", () => {
    writeSettings({ [TMDB_KEY]: "ein schluessel" });
    expect(setting(TMDB_KEY)).toBe("ein schluessel");

    writeSettings({ [TMDB_KEY]: "" });
    expect(setting(TMDB_KEY)).toBe("ein schluessel");

    writeSettings({ [TMDB_KEY]: "ein anderer" });
    expect(setting(TMDB_KEY)).toBe("ein anderer");
  });
});

describe("snapshot", () => {
  test("a secret is answered by a flag and its text never travels along", () => {
    writeSetting(TMDB_KEY, "geheim");
    settingRow("library_root", "/daten/bibliothek");

    const answer = snapshot();

    expect(answer.secrets[TMDB_KEY]).toBe(true);
    expect(answer.values[TMDB_KEY]).toBeUndefined();
    expect(JSON.stringify(answer.values)).not.toContain("geheim");
    expect(answer.values[LIBRARY_ROOT_KEY]).toBe("/daten/bibliothek");
  });

  test("a key with no row is absent from the answer", () => {
    expect(snapshot().values[LIBRARY_ROOT_KEY]).toBeUndefined();
    expect(secretSet(TMDB_KEY)).toBe(false);
  });
});

describe("the library folder", () => {
  test("a folder that stands is the root, and a folder that does not is none", () => {
    const root = mkdtempSync(join(tmpdir(), "mlc-root-"));

    expect(setLibraryRoot(root)).toEqual({ ok: true, root });
    expect(storedRoot()).toBe(root);
    expect(libraryRoot()).toBe(root);

    settingRow(LIBRARY_ROOT_KEY, join(root, "vertippt"));
    expect(storedRoot()).toBe(join(root, "vertippt"));
    expect(libraryRoot()).toBeNull();
  });

  test("a relative path, a missing folder and an empty one are answered on the spot", () => {
    expect(refusal(setLibraryRoot("Filme"))).toContain("absolut");
    expect(refusal(setLibraryRoot("/ganz/gewiss/nicht/da"))).toBe("root existiert nicht");
    expect(refusal(setLibraryRoot(""))).toBe("root fehlt");
    expect(refusal(setLibraryRoot(null))).toBe("root fehlt");

    expect(setting(LIBRARY_ROOT_KEY)).toBe("");
    expect(libraryRoot()).toBeNull();
  });
});
