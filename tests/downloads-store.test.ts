// The download table and the folder its rows point at: what a damaged row reads as,
// what a second save does to a row, and what an absent folder reads as.

import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../server/db/db";
import { downloads } from "../server/db/schema";
import { diskFiles, filesUnder } from "../server/downloads/fsview";
import {
  filesOf,
  findDownload,
  interruptedDownloads,
  saveDownload,
  setState,
} from "../server/downloads/store";
import { downloadRow } from "./rows";
import { clearTables } from "./setup";

beforeEach(async () => {
  await clearTables();
});

/** The row of a thread; an absent row throws with its thread id. */
function rowOf(threadId: number) {
  const record = findDownload(threadId);
  if (!record) throw new Error(`no row for thread ${threadId}`);

  return record;
}

describe("the file list of a row", () => {
  test("a list that is not json reads as no files", () => {
    db.insert(downloads).values({ threadId: 1, folder: "pack", files: "not json" }).run();

    expect(filesOf(rowOf(1))).toEqual([]);
  });

  test("the list the runner wrote comes back in the order it was given", () => {
    saveDownload(2, "pack", ["b.mkv", "a.mkv"]);

    expect(filesOf(rowOf(2))).toEqual(["b.mkv", "a.mkv"]);
  });
});

describe("a row of the download table", () => {
  test("a second save moves folder and files onto the same row", () => {
    saveDownload(3, "first", ["a.mkv"]);
    saveDownload(3, "second", ["b.mkv", "c.mkv"]);

    const record = rowOf(3);

    expect(record.folder).toBe("second");
    expect(filesOf(record)).toEqual(["b.mkv", "c.mkv"]);
  });

  test("a stopped state keeps the reason it was stopped with", () => {
    saveDownload(4, "pack", ["a.mkv"]);
    setState(4, "stopped", "measured 1080p, thread claims 2160p");

    expect(findDownload(4)?.state).toBe("stopped");
    expect(findDownload(4)?.note).toBe("measured 1080p, thread claims 2160p");
  });

  test("a run that was cut off is the one brought back", () => {
    downloadRow(5, "planned");
    downloadRow(6, "downloading");
    downloadRow(7, "error");

    expect(interruptedDownloads().map((record) => record.threadId)).toEqual([6]);
  });
});

describe("a release folder", () => {
  test("a folder that was never created reads as empty", () => {
    const missing = join(mkdtempSync(join(tmpdir(), "mlc-missing-")), "not-here");

    expect(filesUnder(missing)).toEqual([]);
    expect(diskFiles(missing)).toEqual([]);
  });

  test("files are named below the folder and carry their bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "mlc-folder-"));
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "a.mkv"), "123");
    writeFileSync(join(root, "sub", "b.mkv"), "12345");

    expect(diskFiles(root).map((file) => `${file.path}:${file.bytes}`)).toEqual([
      "a.mkv:3",
      "sub/b.mkv:5",
    ]);
    expect(filesUnder(root).length).toBe(2);
  });
});
