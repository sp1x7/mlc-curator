// The step that puts a finished release into the library: what measures it, which
// places it takes when the files carry markers, and which note its row carries when
// they carry none.

import { beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Probe } from "@shared/types/library";
import { findDownload } from "../server/downloads/store";
import { probeFile } from "../server/library/probe";
import { place } from "../server/upgrades/run";
import {
  downloadRow,
  folderRows,
  mapTitle,
  movieRow as movieRowDb,
  seriesRow,
  settingRow,
  threadRow,
} from "./rows";
import { clearTables } from "./setup";

// What the stub probe reports: a dvd file (720x576) sits in the 720 band, a
// dolby vision web encode at 3832x1592 sits in the 2160 band. The stub gets the
// file to measure as its last argument and ignores it.
function probeJson(width: number, height: number): string {
  return (
    `{"format":{"duration":"2640","format_name":"matroska,webm"},"streams":[` +
    `{"index":0,"codec_type":"video","codec_name":"hevc","width":${width},"height":${height},` +
    `"color_transfer":"smpte2084"}]}`
  );
}

let root = "";
let download = "";
let library = "";

/** The program the settings name as the measurer, with the frame it reports. */
function stubProbe(width: number, height: number): void {
  const stub = join(root, "probe-stub.sh");

  writeFileSync(stub, `#!/bin/sh\necho '${probeJson(width, height)}'\n`);
  chmodSync(stub, 0o755);
  settingRow("probe_binary", stub);
}

/** A release folder below the download folder with its files on disk. */
function releaseOnDisk(folder: string, files: string[]): void {
  for (const file of files) {
    const path = join(download, folder, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "x");
  }
}

/** The rows of a series release: board thread, forum, title link, download. */
function releaseRow(threadId: number, folder: string): void {
  threadRow({ threadId, tags: ["ger", "sd"], forum: "DVD/SD" });
  downloadRow(threadId, "planned", folder);
  mapTitle(threadId, 450, "tv");
}

/** The rows of a film release: board thread, forum, title link, download. */
function filmRow(threadId: number, folder: string): void {
  threadRow({ threadId, tags: ["ger", "2160p", "dv", "hdr"], forum: "2160p" });
  downloadRow(threadId, "planned", folder);
  mapTitle(threadId, 1858, "movie");
}

/** The season folder of the show inside the library. */
function seasonFolder(season: number): string {
  const number = String(season).padStart(2, "0");

  return join(library, "Serien", "Show Name (2015)", `Season ${number}`);
}

beforeEach(async () => {
  await clearTables();

  root = mkdtempSync(join(tmpdir(), "mlc-place-"));
  download = join(root, "downloads");
  library = join(root, "library");
  mkdirSync(library, { recursive: true });

  folderRows(download, library);
  stubProbe(720, 576);
  seriesRow({ tmdbId: 450, title: "Show Name", year: 2015 });
  movieRowDb({ tmdbId: 1858, title: "Transformers", year: 2007 });
});

describe("probeFile", () => {
  test("the probe_binary setting names the program that measures a file", async () => {
    const probe: Probe = await probeFile(join(download, "anything.mkv"));

    expect(probe.width).toBe(720);
    expect(probe.height).toBe(576);
    expect(probe.container).toBe("matroska");
  });

  test("a program that is not there measures nothing", async () => {
    settingRow("probe_binary", join(download, "no-such-program"));

    expect(await probeFile(join(download, "anything.mkv")).catch(() => null)).toBeNull();
  });
});

describe("place", () => {
  test("the pack of numbered folders goes into the season folder of its show", async () => {
    const pack = "Show.Name.S01.German.DL.DVD.x264-TVS";

    releaseOnDisk(pack, [
      "Show.Name.S01E01.Erster.Tag.German.DL.DVD.x264-TVS/tvs-show-dl-dvd-x264-101.mkv",
      "Show.Name.S01E02.Zweiter.Tag.German.DL.DVD.x264-TVS/tvs-show-dl-dvd-x264-102.mkv",
    ]);
    releaseRow(741, pack);

    expect(await place(741)).toBe(true);

    const moved = readdirSync(seasonFolder(1)).filter((name) => name.endsWith(".mkv"));

    expect([...moved].sort()).toEqual(["Show Name - S01E01.mkv", "Show Name - S01E02.mkv"]);
    expect(findDownload(741)?.organizedAt).not.toBeNull();
    expect(existsSync(join(download, pack, "tvs-show-dl-dvd-x264-101.mkv"))).toBe(false);
  });

  test("a release nothing can be named after says so instead of waiting", async () => {
    const pack = "Show.Name.Complete.Staffel.1.German.DL.DVD.x264-TVS";

    releaseOnDisk(pack, ["tvs-show-dl-dvd-x264.mkv"]);
    releaseRow(742, pack);

    expect(await place(742)).toBe(false);

    const record = findDownload(742);

    expect(record?.state).toBe("stopped");
    expect(record?.note).toContain("nothing to move");
    expect(existsSync(join(download, pack, "tvs-show-dl-dvd-x264.mkv"))).toBe(true);
  });

  test("a file that stays below what its thread claims is stopped by its measure", async () => {
    const pack = "Show.Name.S01E03.German.DL.1080p.WEB.x264-TVS";

    releaseOnDisk(pack, ["Show.Name.S01E03.German.DL.1080p.WEB.x264-TVS.mkv"]);
    threadRow({ threadId: 743, tags: ["ger", "1080p"], forum: "1080p" });
    downloadRow(743, "planned", pack);
    mapTitle(743, 450, "tv");

    expect(await place(743)).toBe(false);

    const record = findDownload(743);

    expect(record?.state).toBe("stopped");
    expect(record?.note).toContain("thread claims 1080p");
  });

  test("a uhd encode a little short of 3840 goes in under a 2160 claim", async () => {
    stubProbe(3832, 1592);

    const pack = "Transformers.2007.German.DL.AC3.2160p.DV.HDR.WEB.H265-ZeroTwo";

    releaseOnDisk(pack, [`${pack}.mkv`]);
    filmRow(744, pack);

    expect(await place(744)).toBe(true);
    expect(findDownload(744)?.note ?? "").not.toContain("thread claims");
    expect(
      existsSync(
        join(library, "Filme", "Transformers (2007)", "Transformers (2007) 2160p AC3.mkv"),
      ),
    ).toBe(true);
  });

  test("a qhd encode under a 2160 claim is stopped by its measure", async () => {
    stubProbe(2560, 1440);

    const pack = "A.Different.Film.2015.German.AC3.2160p.WEB.H265-Scene";

    releaseOnDisk(pack, [`${pack}.mkv`]);
    threadRow({ threadId: 745, tags: ["ger", "2160p"], forum: "2160p" });
    downloadRow(745, "planned", pack);
    mapTitle(745, 1858, "movie");

    expect(await place(745)).toBe(false);
    expect(findDownload(745)?.note).toContain("measured 1080p, thread claims 2160p");
  });
});
