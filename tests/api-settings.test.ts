// GET and PUT /settings, POST /settings/upgrade/check, GET /settings/library/scan,
// and the folders a library scan turns into titles.

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LibraryRoot, LibraryTitle } from "@shared/types/library";
import { api } from "../server/app/app";
import { type ScanHooks, scanLibrary } from "../server/library/scan";
import { settingRow } from "./rows";
import { clearTables } from "./setup";

// A scan pass with every hook silenced.
const quiet: ScanHooks = {
  onFolder(): void {},
  onFile(): void {},
  onProbed(): void {},
  onTmdb(): void {},
  onTree(): void {},
};

/** Title folders of one scanned group folder. */
function titlesOf(roots: LibraryRoot[]): LibraryTitle[] {
  return roots.flatMap((root) =>
    root.children.filter((child): child is LibraryTitle => child.type === "title"),
  );
}

/** The answer of the settings routes: values and the marks of secrets. */
type Snapshot = { values: Record<string, string>; secrets: Record<string, boolean> };

/** Reads the settings snapshot. */
async function snapshot(): Promise<Snapshot> {
  const response = await api.request("/settings");

  expect(response.status).toBe(200);
  return (await response.json()) as Snapshot;
}

/** Writes values and reads the snapshot back. */
async function save(values: Record<string, string>): Promise<Snapshot> {
  const response = await api.request("/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });

  expect(response.status).toBe(200);
  return (await response.json()) as Snapshot;
}

/** Starts the upgrade check. */
async function check(): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await api.request("/settings/upgrade/check", { method: "POST" });

  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(async () => {
  await clearTables();
});

describe("GET /settings", () => {
  test("a key with no row is absent from the answer", async () => {
    const stored = await snapshot();

    expect(stored.values.upgrades_enabled).toBeUndefined();
    expect(stored.values.upgrade_auto_upgrade).toBeUndefined();
    expect(stored.values.upgrade_auto_wish).toBeUndefined();
  });
});

describe("PUT /settings", () => {
  test("a saved area comes back with its values", async () => {
    const stored = await save({
      upgrades_enabled: "1",
      upgrade_auto_upgrade: "0",
      upgrade_auto_wish: "0",
      upgrade_lookback_days: "14",
    });

    expect(stored.values.upgrades_enabled).toBe("1");
    expect(stored.values.upgrade_auto_upgrade).toBe("0");
    expect(stored.values.upgrade_auto_wish).toBe("0");
    expect(stored.values.upgrade_lookback_days).toBe("14");
  });

  test("a key that is not part of the areas is not stored", async () => {
    const stored = await save({ upgrades_enabled: "1", not_a_setting_key: "1" });

    expect(stored.values.not_a_setting_key).toBeUndefined();
  });

  test("a switch saved as zero reads back as zero", async () => {
    const stored = await save({ upgrades_enabled: "0" });

    expect(stored.values.upgrades_enabled).toBe("0");
  });
});

describe("POST /settings/upgrade/check", () => {
  test("with no row for the master switch the check is refused", async () => {
    const answer = await check();

    expect(answer.status).toBe(409);
    expect(answer.body.error).toBe("upgrades are off");
  });

  test("with the master switch off the check is refused", async () => {
    settingRow("upgrades_enabled", "0");

    const answer = await check();

    expect(answer.status).toBe(409);
    expect(answer.body.error).toBe("upgrades are off");
  });

  test("with the master switch on the check is taken", async () => {
    settingRow("upgrades_enabled", "1");
    settingRow("upgrade_auto_upgrade", "0");
    settingRow("upgrade_auto_wish", "0");

    const answer = await check();

    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);
  });
});

describe("GET /settings/library/scan", () => {
  test("a library that was never scanned has no stand", async () => {
    const response = await api.request("/settings/library/scan");
    const body = (await response.json()) as { stand: { scannedAt: string | null } };

    expect(response.status).toBe(200);
    expect(body.stand.scannedAt).toBeNull();
  });
});

describe("scanLibrary", () => {
  test("a trickplay folder is no title and no file of one", async () => {
    const root = mkdtempSync(join(tmpdir(), "mlc-scan-"));
    const film = join(root, "Filme", "Alice im Wunderland (1951)");
    mkdirSync(join(film, "Alice im Wunderland (1951) 1080p AC3.trickplay", "320 - 10x10"), {
      recursive: true,
    });
    writeFileSync(join(film, "Alice im Wunderland (1951) 1080p AC3.nfo"), "<movie></movie>");
    writeFileSync(
      join(film, "Alice im Wunderland (1951) 1080p AC3.trickplay", "320 - 10x10", "tile.jpg"),
      "",
    );
    settingRow("library_root", root);

    const titles = titlesOf(await scanLibrary(quiet));

    expect(titles.map((title) => title.name)).toEqual(["Alice im Wunderland (1951)"]);
    expect(titles[0]?.children.map((child) => ("name" in child ? child.name : ""))).toEqual([
      "Alice im Wunderland (1951) 1080p AC3.nfo",
    ]);
  });

  test("a folder with no video in it gets no title", async () => {
    const root = mkdtempSync(join(tmpdir(), "mlc-scan-"));
    mkdirSync(join(root, "sort", "Black Widow (2021)"), { recursive: true });
    mkdirSync(join(root, "sort", "Black_Widow.trickplay", "320 - 10x10"), { recursive: true });
    settingRow("library_root", root);

    const titles = titlesOf(await scanLibrary(quiet));

    expect(titles.map((title) => title.name)).toEqual(["Black Widow (2021)"]);
    expect(titles[0]?.tmdb).toBeNull();
  });
});
