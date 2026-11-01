// POST and PUT of the library route: the folder answer, and the stand both
// endpoints give.

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api } from "../server/app/app";
import { libraryRoot } from "../server/library/root";
import { LIBRARY_ROOT_KEY } from "../server/settings/keys";
import { setting } from "../server/settings/store";
import { settingRow } from "./rows";
import { clearTables } from "./setup";

/** The answer of one request: status code and the object the route sent. */
async function answer<T>(response: Response): Promise<{ status: number; body: T }> {
  return { status: response.status, body: ((await response.json()) ?? {}) as T };
}

/** Writes the library folder through the route. */
async function putRoot(
  root: unknown,
): Promise<{ status: number; body: { root?: string; error?: string } }> {
  return answer(
    await api.request("/library/root", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    }),
  );
}

/** Reads the stand of the library. */
async function stand(): Promise<{ status: number; body: { root: string | null } }> {
  return answer(await api.request("/library/stand"));
}

beforeEach(async () => {
  await clearTables();
});

describe("PUT /library/root", () => {
  test("a path that is not absolute is refused and nothing is stored", async () => {
    const response = await putRoot("Filme");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("absolut");
    expect(setting(LIBRARY_ROOT_KEY)).toBe("");
    expect(libraryRoot()).toBeNull();
  });

  test("a folder that does not stand is refused before it empties the library", async () => {
    const response = await putRoot("/ganz/gewiss/nicht/da");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("root existiert nicht");
    expect(setting(LIBRARY_ROOT_KEY)).toBe("");
  });

  test("a body that is not an object is answered, not thrown", async () => {
    const response = await answer<{ error?: string }>(
      await api.request("/library/root", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "kein json",
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("root fehlt");
  });

  test("a folder that stands is stored and answered with its absolute path", async () => {
    const root = mkdtempSync(join(tmpdir(), "mlc-root-"));
    const response = await putRoot(root);

    expect(response.status).toBe(200);
    expect(response.body.root).toBe(root);
    expect(libraryRoot()).toBe(root);
  });
});

describe("GET /library/stand", () => {
  test("the stand names the same folder the settings hold, scanned or not", async () => {
    const root = mkdtempSync(join(tmpdir(), "mlc-stand-"));
    expect((await putRoot(root)).status).toBe(200);

    expect((await stand()).body.root).toBe(root);

    settingRow(LIBRARY_ROOT_KEY, "/daten/bibliothek");
    expect((await stand()).body.root).toBe("/daten/bibliothek");
  });

  test("without a stored folder the stand has no root", async () => {
    expect((await stand()).body.root).toBeNull();
  });
});
