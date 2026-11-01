// The downloads api over release folders on disk: films in four resolutions,
// single episodes, season packs, extra files, games, the absent pieces, and
// the answers of the row, plan, files and organize routes.

import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DownloadPlan, PlanEntry } from "@shared/types/downloads";
import { api } from "../server/app/app";
import { downloadLimits } from "../server/downloads/config";
import { hostSlots, releaseFolderOf } from "../server/ftp/client";
import { placedKey } from "../server/library/stand";
import { removeArchive } from "../server/unpack/rar";
import {
  downloadRow,
  folderRows,
  mapTitle,
  movieRow,
  seriesRow,
  settingRow,
  threadRow,
} from "./rows";
import { clearTables } from "./setup";

// A film release folder name, used by the organize and delete routes.
const FILM = "The.Title.2024.GERMAN.1080p.WEBDL.x264-Scene";

let download = "";
let library = "";

/** One request against the api, the answer read as status and json. */
async function call(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const response = await api.request(path, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  return { status: response.status, body: await response.json() };
}

/** The plan of one thread, a 200 expected. */
async function planOf(threadId: number): Promise<DownloadPlan> {
  const answered = await call(`/downloads/plan/${threadId}`);

  expect(answered.status).toBe(200);
  return answered.body as DownloadPlan;
}

/** A release folder below the download folder with its files on disk. Files may
 *  name folders of their own: a pack leaves its episodes in one folder each. */
function releaseOnDisk(folder: string, files: string[]): void {
  for (const file of files) {
    const path = join(download, folder, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "x");
  }
}

/** The rows of one release: board thread, forum, title link, download entry. */
function releaseRow(input: {
  threadId: number;
  forum: string;
  tags: string[];
  folder: string;
  tmdbId?: number;
  kind?: "movie" | "tv";
  ftpPath?: string;
}): void {
  threadRow({
    threadId: input.threadId,
    tags: input.tags,
    forum: input.forum,
    ftpPath: input.ftpPath,
  });
  downloadRow(input.threadId, "planned", input.folder);

  if (input.tmdbId === undefined) return;
  mapTitle(input.threadId, input.tmdbId, input.kind ?? "movie");
}

/** The video entries of a plan. */
function videosOf(plan: DownloadPlan): PlanEntry[] {
  return plan.entries.filter((entry) => entry.kind === "video");
}

/** The film folder a title gets in the library. */
function movieFolderOf(title: string, year: number): string {
  return join(library, "Filme", `${title} (${year})`);
}

/** The season folder a series gets in the library. */
function episodeFolderOf(title: string, year: number, season: number): string {
  const number = String(season).padStart(2, "0");

  return join(library, "Serien", `${title} (${year})`, `Season ${number}`);
}

beforeEach(async () => {
  await clearTables();

  const root = mkdtempSync(join(tmpdir(), "mlc-plan-"));
  download = join(root, "downloads");
  library = join(root, "library");
  mkdirSync(library, { recursive: true });

  folderRows(download, library);
  movieRow({ tmdbId: 400, title: "The Title", year: 2024 });
  seriesRow({ tmdbId: 450, title: "Show Name", year: 2015 });
});

describe("films", () => {
  const FILMS: Array<{ threadId: number; folder: string; file: string }> = [
    {
      threadId: 701,
      folder: "The.Title.2024.GERMAN.DVDRip.x264-Scene",
      file: "The.Title.2024.GERMAN.DVDRip.x264-Scene.avi",
    },
    {
      threadId: 702,
      folder: "The.Title.2024.GERMAN.720p.WEBDL.x264-Scene",
      file: "The.Title.2024.GERMAN.720p.WEBDL.x264-Scene.mkv",
    },
    {
      threadId: 703,
      folder: "The.Title.2024.GERMAN.DTS.1080p.WEBDL.x264-Scene",
      file: "The.Title.2024.GERMAN.DTS.1080p.WEBDL.x264-Scene.mkv",
    },
    {
      threadId: 704,
      folder: "The.Title.2024.GERMAN.2160p.HEVC.x265-Scene",
      file: "The.Title.2024.GERMAN.2160p.HEVC.x265-Scene.mkv",
    },
  ];

  test("every resolution of one film lands in the film folder of that film", async () => {
    const folders: string[] = [];

    for (const film of FILMS) {
      releaseOnDisk(film.folder, [film.file]);
      releaseRow({
        threadId: film.threadId,
        forum: film.threadId === 701 ? "DVD/SD" : film.threadId === 704 ? "2160p" : "1080p",
        tags: ["ger"],
        folder: film.folder,
        tmdbId: 400,
      });

      const plan = await planOf(film.threadId);
      const video = videosOf(plan)[0];

      expect(video?.move).toBe(true);
      folders.push(video?.to ?? "");
    }

    expect(
      new Set(folders.map((to) => to.slice(0, movieFolderOf("The Title", 2024).length))),
    ).toEqual(new Set([movieFolderOf("The Title", 2024)]));
  });

  test("a 1080p film is named by its quality", async () => {
    const film = FILMS[2];
    if (!film) throw new Error("no 1080p film in the matrix");

    releaseOnDisk(film.folder, [film.file]);
    releaseRow({
      threadId: film.threadId,
      forum: "1080p",
      tags: ["ger"],
      folder: film.folder,
      tmdbId: 400,
    });

    const plan = await planOf(film.threadId);

    expect(videosOf(plan)[0]?.to).toBe(
      join(movieFolderOf("The Title", 2024), "The Title (2024) 1080p GERMAN DTS.mkv"),
    );
  });

  test("the subtitle stays in the release folder and the rest stays too", async () => {
    const film = FILMS[3];
    if (!film) throw new Error("no 2160p film in the matrix");

    releaseOnDisk(film.folder, [
      film.file,
      "The.Title.2024.GERMAN.2160p.HEVC.x265-Scene.german.srt",
      "The.Title.2024.GERMAN.2160p.HEVC.x265-Scene-sample.mkv",
      "The.Title.2024.GERMAN.2160p.HEVC.x265-Scene.nfo",
      "The.Title.2024.GERMAN.2160p.HEVC.x265-Scene.par2",
    ]);
    releaseRow({
      threadId: film.threadId,
      forum: "2160p",
      tags: ["ger"],
      folder: film.folder,
      tmdbId: 400,
    });

    const plan = await planOf(film.threadId);
    const subtitle = plan.entries.find((entry) => entry.kind === "subtitle");

    expect(subtitle?.move).toBe(false);
    expect(subtitle?.to).toBe(subtitle?.from);
    expect(
      plan.entries
        .filter((entry) => entry.kind === "nfo")
        .map((entry) => `${entry.role}:${entry.move}:${entry.reason}`),
    ).toEqual(["from the board:false:NFO from the thread"]);
    expect(
      plan.entries
        .filter((entry) => entry.kind === "other")
        .map((entry) => `${entry.move}:${entry.from.endsWith(".par2")}`),
    ).toEqual(["false:true"]);
    expect(
      plan.entries
        .filter((entry) => entry.from.endsWith("-sample.mkv"))
        .map((entry) => `${entry.kind}:${entry.move}:${entry.reason}`),
    ).toEqual(["video:false:extra"]);
  });
});

describe("series", () => {
  test("one episode lands in the season folder of its series", async () => {
    const folder = "Show.Name.S01E02.German.1080p.WEBDL.x264-Scene";

    releaseOnDisk(folder, ["Show.Name.S01E02.German.1080p.WEBDL.x264-Scene.mkv"]);
    releaseRow({ threadId: 711, forum: "Folgen", tags: ["ger"], folder, tmdbId: 450, kind: "tv" });

    const plan = await planOf(711);
    const video = videosOf(plan)[0];

    expect(video?.move).toBe(true);
    expect(video?.to.startsWith(`${episodeFolderOf("Show Name", 2015, 1)}/`)).toBe(true);
    expect(video?.to).toContain("S01E02");
  });

  test("a season pack fills one season folder", async () => {
    const folder = "Show.Name.Complete.Staffel.1.German.1080p.WEBDL.x264-Scene";
    const files: string[] = [];

    for (let episode = 1; episode <= 8; episode += 1) {
      const number = String(episode).padStart(2, "0");
      files.push(`Show.Name.S01E${number}.German.1080p.WEBDL.x264-Scene.mkv`);
    }

    releaseOnDisk(folder, files);
    releaseRow({
      threadId: 712,
      forum: "Staffeln",
      tags: ["ger"],
      folder,
      tmdbId: 450,
      kind: "tv",
    });

    const plan = await planOf(712);
    const videos = videosOf(plan);

    expect(videos).toHaveLength(8);
    expect(videos.every((entry) => entry.move)).toBe(true);
    expect(
      new Set(
        videos.map((entry) => entry.to.slice(0, episodeFolderOf("Show Name", 2015, 1).length)),
      ),
    ).toEqual(new Set([episodeFolderOf("Show Name", 2015, 1)]));
    expect(new Set(videos.map((entry) => entry.to)).size).toBe(8);
  });

  test("an episode without a number in its name gets no place", async () => {
    const folder = "Show.Name.German.1080p.WEBDL.x264-Scene";

    releaseOnDisk(folder, ["Show.Name.German.1080p.WEBDL.x264-Scene.mkv"]);
    releaseRow({ threadId: 713, forum: "Folgen", tags: ["ger"], folder, tmdbId: 450, kind: "tv" });

    const plan = await planOf(713);
    const video = videosOf(plan)[0];

    expect(video?.move).toBe(false);
    expect(video?.reason).toBe("no episode number");
    expect(video?.to).toBe(video?.from);
  });
});

// A tvs dvd pack writes its numbers into the folder of every episode and names
// the files after itself: Millennium.S01E01.Der.juengste.Tag.../tvs-millennium-
// dl-dvd-x264-101.mkv. The file alone carries no episode marker.
describe("series files whose number sits in their folder", () => {
  const PACK = "Millennium.S01.German.DL.FS.DVD.x264-TVS";

  /** Millennium.S01E03.Folge.German.DL.FS.DVD.x264-TVS */
  function episodePack(episode: number): string {
    const number = String(episode).padStart(2, "0");
    return `Millennium.S01E${number}.Folge.German.DL.FS.DVD.x264-TVS`;
  }

  /** The folder of one episode with the file the packer left in it. */
  function episodeFile(episode: number): string {
    return `${episodePack(episode)}/tvs-millennium-dl-dvd-x264-${100 + episode}.mkv`;
  }

  /** The rows of one pack release of the series. */
  function packRow(threadId: number, folder: string): void {
    releaseRow({
      threadId,
      forum: "Staffeln",
      tags: ["ger", "sd"],
      folder,
      tmdbId: 450,
      kind: "tv",
    });
  }

  test("the folder of its episode places a file that names no number", async () => {
    releaseOnDisk(PACK, [episodeFile(1)]);
    packRow(714, PACK);

    const video = videosOf(await planOf(714))[0];

    expect(video?.reason).toBeNull();
    expect(video?.move).toBe(true);
    expect(video?.to.startsWith(`${episodeFolderOf("Show Name", 2015, 1)}/`)).toBe(true);
    expect(video?.to).toContain("S01E01");
  });

  test("every episode folder of the pack gets a place of its own", async () => {
    releaseOnDisk(PACK, [episodeFile(1), episodeFile(2), episodeFile(3)]);
    packRow(715, PACK);

    const videos = videosOf(await planOf(715));

    expect(videos).toHaveLength(3);
    expect(videos.every((entry) => entry.move)).toBe(true);
    expect(new Set(videos.map((entry) => entry.to)).size).toBe(3);
    expect(
      new Set(
        videos.map((entry) => entry.to.slice(0, episodeFolderOf("Show Name", 2015, 1).length)),
      ),
    ).toEqual(new Set([episodeFolderOf("Show Name", 2015, 1)]));
  });

  test("a file that names its own episode keeps it against its folder", async () => {
    releaseOnDisk(PACK, [`${episodePack(5)}/Show.Name.S01E02.German.1080p.WEBDL.x264-Scene.mkv`]);
    packRow(716, PACK);

    const video = videosOf(await planOf(716))[0];

    expect(video?.move).toBe(true);
    expect(video?.to).toContain("S01E02");
  });

  test("the folder of the episode names the season as well", async () => {
    const folder = "Show.Name.The.Final.Staffel.German.1080p.WEBDL.x264-Scene";

    releaseOnDisk(folder, [
      "Show.Name.S03E04.Finale.German.1080p.WEBDL.x264-Scene/tvs-show-dl-304.mkv",
    ]);
    packRow(717, folder);

    const video = videosOf(await planOf(717))[0];

    expect(video?.move).toBe(true);
    expect(video?.to.startsWith(`${episodeFolderOf("Show Name", 2015, 3)}/`)).toBe(true);
    expect(video?.to).toContain("S03E04");
  });

  test("a release folder that names one episode places its numberless file", async () => {
    const folder = "Show.Name.S01E07.German.1080p.WEBDL.x264-Scene";

    releaseOnDisk(folder, ["tvs-show-dl-107.mkv"]);
    packRow(718, folder);

    const video = videosOf(await planOf(718))[0];

    expect(video?.move).toBe(true);
    expect(video?.to).toContain("S01E07");
  });

  test("a season folder is no episode number", async () => {
    const folder = "Show.Name.Complete.Staffel.1.German.1080p.WEBDL.x264-Scene";

    releaseOnDisk(folder, ["Season 01/tvs-show-dl-x264.mkv"]);
    packRow(719, folder);

    const video = videosOf(await planOf(719))[0];

    expect(video?.move).toBe(false);
    expect(video?.reason).toBe("no episode number");
  });

  test("the pack goes into the season folder of its show", async () => {
    releaseOnDisk(PACK, [episodeFile(1), episodeFile(2), episodeFile(3)]);
    packRow(720, PACK);

    const entries = (await planOf(720)).entries;
    const answered = await call("/downloads/organize", {
      method: "POST",
      body: { threadId: 720, paths: entries.filter((entry) => entry.move).map((e) => e.from) },
    });

    const moved = readdirSync(episodeFolderOf("Show Name", 2015, 1)).filter((name) =>
      name.endsWith(".mkv"),
    );

    expect(answered.status).toBe(200);
    expect((answered.body as { moved: number }).moved).toBe(3);
    expect([...moved].sort()).toEqual([
      "Show Name - S01E01.mkv",
      "Show Name - S01E02.mkv",
      "Show Name - S01E03.mkv",
    ]);
  });
});

describe("games", () => {
  test("a game release moves nothing", async () => {
    const folder = "Some.Game-CPY";

    releaseOnDisk(folder, ["Some.Game.iso", "Some.Game.sfv", "README.nfo"]);

    threadRow({ threadId: 721, tags: ["multi"], forum: "Mac & Linux" });
    downloadRow(721, "planned", folder);

    const plan = await planOf(721);

    expect(plan.root).toBe(library);
    expect(plan.entries.some((entry) => entry.move)).toBe(false);
  });
});

describe("missing pieces", () => {
  test("a thread whose title is not in the database gets no place", async () => {
    const folder = "Other.Title.2024.GERMAN.1080p.WEBDL.x264-Scene";

    releaseOnDisk(folder, ["Other.Title.2024.GERMAN.1080p.WEBDL.x264-Scene.mkv"]);
    releaseRow({ threadId: 731, forum: "1080p", tags: ["ger"], folder, tmdbId: 499 });

    const plan = await planOf(731);
    const video = videosOf(plan)[0];

    expect(video?.move).toBe(false);
    expect(video?.reason).toBe("title not in the database");
  });

  test("a thread without a title link goes to the unsorted folder", async () => {
    const folder = "Unlinked.Title.2024.GERMAN.1080p.WEBDL.x264-Scene";

    releaseOnDisk(folder, ["Unlinked.Title.2024.GERMAN.1080p.WEBDL.x264-Scene.mkv"]);
    releaseRow({ threadId: 732, forum: "1080p", tags: ["ger"], folder });

    const plan = await planOf(732);
    const video = videosOf(plan)[0];

    expect(video?.move).toBe(true);
    expect(video?.to.startsWith(join(library, "Unsortiert", folder))).toBe(true);
  });

  test("no library folder means no plan", async () => {
    const folder = "The.Title.2024.GERMAN.1080p.WEBDL.x264-Scene";

    releaseOnDisk(folder, ["The.Title.2024.GERMAN.1080p.WEBDL.x264-Scene.mkv"]);
    releaseRow({ threadId: 733, forum: "1080p", tags: ["ger"], folder, tmdbId: 400 });
    settingRow("library_root", join(library, "not-there"));

    const plan = await planOf(733);

    expect(plan.root).toBe("");
    expect(plan.entries).toEqual([]);
    expect(plan.metadataNote).toBe("no library folder");
  });
});

describe("a target that is already there", () => {
  test("a film whose library file exists is not moved again", async () => {
    const folder = "The.Title.2024.GERMAN.1080p.WEBDL.x264-Scene";
    const subtitle = "The.Title.2024.GERMAN.1080p.WEBDL.x264-Scene.german.srt";

    releaseOnDisk(folder, ["The.Title.2024.GERMAN.1080p.WEBDL.x264-Scene.mkv", subtitle]);
    releaseRow({ threadId: 741, forum: "1080p", tags: ["ger"], folder, tmdbId: 400 });

    const first = await planOf(741);
    const target = videosOf(first)[0]?.to;
    if (!target) throw new Error("no film target");

    mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    writeFileSync(target, "x");

    const second = await planOf(741);
    const video = videosOf(second)[0];
    const kept = second.entries.find((entry) => entry.kind === "subtitle");

    expect(video?.exists).toBe(true);
    expect(video?.move).toBe(false);
    expect(kept?.to).toBe(kept?.from);
  });
});

describe("GET /downloads", () => {
  test("a planned release is a row with the download folder as root", async () => {
    releaseOnDisk(FILM, [`${FILM}.mkv`]);
    releaseRow({ threadId: 801, forum: "1080p", tags: ["ger"], folder: FILM, tmdbId: 400 });

    const answered = await call("/downloads");
    const list = answered.body as {
      root: string;
      rows: Array<{ threadId: number; state: string }>;
    };

    expect(answered.status).toBe(200);
    expect(list.root).toBe(download);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]?.threadId).toBe(801);
    expect(list.rows[0]?.state).toBe("planned");
  });

  test("without a download entry there is no row", async () => {
    const answered = await call("/downloads");

    expect((answered.body as { rows: unknown[] }).rows).toEqual([]);
  });
});

describe("GET /downloads/plan/:threadId", () => {
  test("a thread without a download entry answers with no entry", async () => {
    threadRow({ threadId: 803, tags: ["ger"], forum: "1080p" });

    const answered = await call("/downloads/plan/803");

    expect(answered.status).toBe(404);
    expect(answered.body).toEqual({ error: "no entry" });
  });
});

describe("GET /downloads/files/:threadId", () => {
  test("a release without ftp access is refused before the board is asked", async () => {
    threadRow({ threadId: 804, tags: ["ger"], forum: "1080p", ftpPath: "/mlc/film/1080p/" });

    const answered = await call("/downloads/files/804");

    expect(answered.status).toBe(400);
    expect(answered.body).toEqual({ error: "no ftp access — fetch the info file first" });
  });
});

describe("releaseFolderOf", () => {
  const release = "Silo.S03E05.GERMAN.DL.1080p.WEB.h264-SAUERKRAUT";

  test("the folder the board names is the folder of the release", () => {
    expect(releaseFolderOf(`/_Requests/${release}/`, release)).toBe(release);
    expect(releaseFolderOf(`/Pre/Szenen/TV/${release}`, release)).toBe(release);
  });

  test("an info that names no folder takes the title of the release", () => {
    expect(releaseFolderOf("/", release)).toBe(release);
    expect(releaseFolderOf("", release)).toBe(release);
  });

  test("an info that names a file takes the title of the release", () => {
    expect(releaseFolderOf(`/Pre/Szenen/TV/${release}.mkv`, release)).toBe(release);
  });

  test("a title with a path in it names one folder, no path", () => {
    expect(releaseFolderOf("/", `../../etc/${release}`)).toBe(release);
  });
});

describe("removeArchive", () => {
  function pack(names: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), "mlc-rar-"));
    for (const name of names) writeFileSync(join(dir, name), "x");
    return dir;
  }

  test("an old style set loses its first part and every tail part", () => {
    const base = "Silo.S03E04.GERMAN.DL.1080p.WEB.h264-SAUERKRAUT";
    const dir = pack([`${base}.rar`, `${base}.r00`, `${base}.r19`, `${base}.sfv`, `${base}.nfo`]);

    removeArchive(join(dir, `${base}.rar`));

    expect(readdirSync(dir).sort()).toEqual([`${base}.nfo`, `${base}.sfv`]);
  });

  test("a new style set loses every of its parts", () => {
    const base = "Silo.S03E05.GERMAN.DL.1080p.WEB.h264-SAUERKRAUT";
    const dir = pack([
      `${base}.part1.rar`,
      `${base}.part2.rar`,
      `${base}.part10.rar`,
      `${base}.sfv`,
    ]);

    removeArchive(join(dir, `${base}.part1.rar`));

    expect(readdirSync(dir)).toEqual([`${base}.sfv`]);
  });

  test("an archive of one file loses only itself", () => {
    const base = "The.Title.2024.GERMAN.1080p.WEBDL.x264-Scene";
    const dir = pack([`${base}.zip`, `${base}.sfv`]);

    removeArchive(join(dir, `${base}.zip`));

    expect(readdirSync(dir)).toEqual([`${base}.sfv`]);
  });

  test("an archive of another release in the same folder is left alone", () => {
    const dir = pack([
      "A.Title.2024.1080p.WEBDL.x264-Scene.rar",
      "B.Title.2024.1080p.WEBDL.x264-Scene.rar",
    ]);

    removeArchive(join(dir, "A.Title.2024.1080p.WEBDL.x264-Scene.rar"));

    expect(readdirSync(dir)).toEqual(["B.Title.2024.1080p.WEBDL.x264-Scene.rar"]);
  });
});

describe("downloadLimits", () => {
  test("no row for the job limit means three releases at a time", () => {
    expect(downloadLimits().maxJobs).toBe(3);
  });

  test("a saved job limit is the limit the runner works with", () => {
    settingRow("download_max_jobs", "1");

    expect(downloadLimits().maxJobs).toBe(1);
  });

  test("a job limit below one still runs one release at a time", () => {
    settingRow("download_max_jobs", "0");

    expect(downloadLimits().maxJobs).toBe(1);
  });

  test("the job limit leaves the file limit of one release alone", () => {
    settingRow("download_max_jobs", "2");
    settingRow("download_max_parallel", "5");

    expect(downloadLimits()).toEqual(expect.objectContaining({ maxJobs: 2, parallel: 5 }));
  });
});

describe("hostSlots", () => {
  test("no row for the host limit means four connections to one server", () => {
    expect(hostSlots()).toBe(4);
  });

  test("a saved host limit is the number of connections one server sees", () => {
    settingRow("download_max_per_host", "2");

    expect(hostSlots()).toBe(2);
  });

  test("a host limit below one falls back to four", () => {
    settingRow("download_max_per_host", "0");

    expect(hostSlots()).toBe(4);
  });

  test("the host limit is read again after the setting changed", () => {
    settingRow("download_max_per_host", "1");
    expect(hostSlots()).toBe(1);

    settingRow("download_max_per_host", "6");
    expect(hostSlots()).toBe(6);
  });
});

describe("POST /downloads/start", () => {
  test("a start without files is refused", async () => {
    releaseRow({ threadId: 805, forum: "1080p", tags: ["ger"], folder: FILM, tmdbId: 400 });

    const answered = await call("/downloads/start", { method: "POST", body: { threadId: 805 } });

    expect(answered.status).toBe(400);
    expect(answered.body).toEqual({ error: "threadId and files missing" });
  });
});

describe("placedKey", () => {
  test("a film in a folder of its own names that folder", () => {
    expect(placedKey(join(library, "Filme", "The Title (2024)", "The Title (2024).mkv"))).toEqual({
      path: "Filme/The Title (2024)",
      title: true,
    });
  });

  test("a film without a folder of its own names the file itself", () => {
    expect(placedKey(join(library, "Filme", "The Title (2024) 1080p GERMAN DTS.mkv"))).toEqual({
      path: "Filme/The Title (2024) 1080p GERMAN DTS.mkv",
      title: false,
    });
  });

  test("an episode names the folder of its show, not its season folder", () => {
    expect(
      placedKey(join(library, "Serien", "Show Name (2015)", "Season 02", "Show Name S02E03.mkv")),
    ).toEqual({ path: "Serien/Show Name (2015)", title: true });
  });

  test("a file in the library folder itself names nothing", () => {
    expect(placedKey(join(library, "loose.mkv"))).toBeNull();
  });
});

describe("POST /downloads/organize", () => {
  /** Hands every movable entry of the plan to the organizer. */
  async function organize(threadId: number): Promise<{ status: number; body: unknown }> {
    const entries = (await planOf(threadId)).entries;

    return call("/downloads/organize", {
      method: "POST",
      body: { threadId, paths: entries.filter((entry) => entry.move).map((entry) => entry.from) },
    });
  }

  test("without a library folder nothing moves", async () => {
    releaseOnDisk(FILM, [`${FILM}.mkv`]);
    releaseRow({ threadId: 806, forum: "1080p", tags: ["ger"], folder: FILM, tmdbId: 400 });
    settingRow("library_root", join(library, "not-there"));

    const answered = await organize(806);

    expect(answered.status).toBe(400);
    expect(answered.body).toEqual({ error: "no library folder set" });
    expect(existsSync(join(download, FILM, `${FILM}.mkv`))).toBe(true);
  });

  test("the film lands in the library, its subtitle and the sample stay", async () => {
    releaseOnDisk(FILM, [`${FILM}.mkv`, `${FILM}.german.srt`, "sample.mkv"]);
    releaseRow({ threadId: 807, forum: "1080p", tags: ["ger"], folder: FILM, tmdbId: 400 });

    const answered = await organize(807);
    const answer = answered.body as {
      moved: number;
      placed: string[];
      nfo: unknown[];
      images: unknown[];
      kept: string | null;
    };
    const moved = readdirSync(movieFolderOf("The Title", 2024));

    expect(answered.status).toBe(200);
    expect(answer.moved).toBe(1);
    expect(answer.placed).toEqual([
      join(movieFolderOf("The Title", 2024), moved.find((name) => name.endsWith(".mkv")) ?? ""),
    ]);
    expect(answer.nfo).toEqual([]);
    expect(answer.images).toEqual([]);
    expect(moved.filter((name) => name.endsWith(".mkv"))).toHaveLength(1);
    expect(moved.filter((name) => name.endsWith(".srt"))).toEqual([]);
    expect(existsSync(join(download, FILM, `${FILM}.mkv`))).toBe(false);
    expect(existsSync(join(download, FILM, `${FILM}.german.srt`))).toBe(true);
    expect(existsSync(join(download, FILM, "sample.mkv"))).toBe(true);
    expect(answer.kept).toBe(FILM);
  });

  test("the release folder goes when only a sample and the extras are left", async () => {
    settingRow("prune_empty_source", "1");
    releaseOnDisk(FILM, [`${FILM}.mkv`, `${FILM}.german.srt`, `${FILM}-sample.mkv`, `${FILM}.r00`]);
    releaseRow({ threadId: 810, forum: "1080p", tags: ["ger"], folder: FILM, tmdbId: 400 });

    const answered = await organize(810);

    expect(answered.status).toBe(200);
    expect(existsSync(movieFolderOf("The Title", 2024))).toBe(true);
    expect(existsSync(join(download, FILM))).toBe(false);
  });

  test("an organized release carries the stamp of its organize", async () => {
    releaseOnDisk(FILM, [`${FILM}.mkv`]);
    releaseRow({ threadId: 808, forum: "1080p", tags: ["ger"], folder: FILM, tmdbId: 400 });

    await organize(808);

    expect((await planOf(808)).organizedAt).not.toBeNull();
  });
});

describe("DELETE /downloads/:threadId", () => {
  test("the row is gone and its plan answers with no entry", async () => {
    releaseRow({ threadId: 809, forum: "1080p", tags: ["ger"], folder: FILM, tmdbId: 400 });

    const removed = await call("/downloads/809", { method: "DELETE" });
    const list = await call("/downloads");
    const plan = await call("/downloads/plan/809");

    expect(removed.status).toBe(200);
    expect((list.body as { rows: unknown[] }).rows).toEqual([]);
    expect(plan.status).toBe(404);
    expect(plan.body).toEqual({ error: "no entry" });
  });
});
