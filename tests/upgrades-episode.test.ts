// A release is measured against the episode it replaces; the highest file of its title
// stands aside, and a release of zero episode markers stays on its title.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { db } from "../server/db/db";
import {
  downloads,
  mappings,
  releases,
  settings,
  tmdbEpisodes,
  tmdbMovies,
  tmdbSeasons,
  tmdbSeries,
} from "../server/db/schema";
import { findDownload } from "../server/downloads/store";
import { currentStand, scanRunning, startScan } from "../server/library/stand";
import { type Take, upgradePicks } from "../server/upgrades/pick";
import { place, startUpgradeCheck } from "../server/upgrades/run";
import { titleStand } from "../server/upgrades/stand";
import { indexLibrary, type LibraryIndex } from "../server/wishlist/library";

type Title = { id: number; title: string; year: number };
const S: Title = { id: 63605, title: "The Expanse", year: 2015 };
const D: Title = { id: 69471, title: "Dark", year: 2017 };
const F: Title = { id: 1858, title: "Transformers", year: 2007 };
const DAY = 86_400;
let root = "",
  box = "",
  library = "";
const pad = (n: number): string => String(n).padStart(2, "0");
const ep = (s: number, e: number): string => `S${pad(s)}E${pad(e)}`;
const now = (): number => Math.floor(Date.now() / 1000);
const sleep = (): Promise<void> => new Promise((done) => setTimeout(done, 20));
const set = (key: string, value: string): void =>
  db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
const file = (t: Title, s: number, e: number): string =>
  join(
    library,
    "Serien",
    `${t.title} (${t.year})`,
    `Season ${pad(s)}`,
    `${t.title} - ${ep(s, e)} - Episode ${e}.mkv`,
  );

/** The tmdb rows of a series: its title, its seasons and their episodes. */
function seed(t: Title, seasons: number[]): void {
  db.insert(tmdbSeries)
    .values({
      tmdbId: t.id,
      title: t.title,
      firstAirYear: t.year,
      originalLanguage: "en",
      genres: "[]",
      certification: "FSK 16",
      numberOfSeasons: seasons.length,
    })
    .run();
  db.insert(tmdbSeasons)
    .values(
      seasons.map((n, i) => ({
        tmdbId: t.id,
        seasonNumber: i + 1,
        name: `Season ${i + 1}`,
        episodeCount: n,
      })),
    )
    .run();
  db.insert(tmdbEpisodes)
    .values(
      seasons.flatMap((n, i) =>
        Array.from({ length: n }, (_, e) => ({
          tmdbId: t.id,
          seasonNumber: i + 1,
          episodeNumber: e + 1,
          name: `Episode ${e + 1}`,
        })),
      ),
    )
    .run();
}

/** One video file: its content is the answer the measurer prints for it. */
/** The measurer answer of a file of that height. */
const probe = (height: number): string =>
  `{"format":{"duration":"2640","format_name":"matroska,webm"},"streams":[{"index":0,"codec_type":"video","codec_name":"hevc","width":${Math.round((height * 16) / 9)},"height":${height}}]}`;
/** A video file whose content is the answer the measurer prints for it. */
const video = (path: string, height: number): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, probe(height));
};
/** A file the measurer has zero answer for. */
const blind = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "no answer for the measurer");
};
/** Files of the series S: season, episode and height of each. */
const holds = (...rows: [number, number, number][]): void => {
  for (const [s, e, h] of rows) video(file(S, s, e), h);
};
/** A file of the series D. */
const other = (s: number, e: number, height: number): void => video(file(D, s, e), height);
/** A film file of the film F. */
const film = (height: number): void =>
  video(
    join(library, "Filme", `${F.title} (${F.year})`, `${F.title} (${F.year}) ${height}p.mkv`),
    height,
  );
/** The measurer: every file carries its own answer, so heights stay apart. */
const measurer = (): void => {
  const stub = join(root, "measurer.sh");
  writeFileSync(
    stub,
    '#!/bin/sh\ncase "$*" in *version*) echo \'{"ffprobe version":"stub"}\'; exit 0;; esac\nlast=""\nfor arg in "$@"; do last="$arg"; done\ncat "$last"\n',
  );
  chmodSync(stub, 0o755);
  set("probe_binary", stub);
};
/** A board thread: its tags, its forum, its title link and its download row. */
function thread(
  id: number,
  tags: string[],
  input: {
    forum?: string;
    tmdb?: number;
    kind?: "movie" | "tv";
    folder?: string;
    state?: "planned" | "downloading" | "stopped" | "error";
  } = {},
): void {
  db.insert(releases)
    .values({
      threadId: id,
      title: `thread ${id}`,
      name: "the title",
      tags: JSON.stringify(tags),
      category: "Serien",
      subcategory: input.forum ?? "Folgen",
      publishedAt: now() - DAY,
      url: `showthread.php?t=${id}`,
      ftpPath: null,
      lastSeenAt: now(),
    })
    .run();
  if (input.folder !== undefined)
    db.insert(downloads)
      .values({ threadId: id, state: input.state ?? "planned", folder: input.folder, note: null })
      .run();
  if (input.tmdb !== undefined)
    db.insert(mappings)
      .values({ threadId: id, tmdbId: input.tmdb, kind: input.kind ?? "movie" })
      .run();
}

/** A finished release in the download folder: one file per named episode. */
function ready(id: number, tags: string[], height: number, ...episodes: string[]): void {
  for (const at of episodes)
    video(join(box, `R${id}`, `${S.title} - ${at} - Episode ${at.slice(-2)}.mkv`), height);
  thread(
    id,
    tags,
    episodes.length === 0
      ? { tmdb: S.id, kind: "tv" }
      : { tmdb: S.id, kind: "tv", folder: `R${id}` },
  );
}
/** A finished film release of the film F. */
const readyFilm = (id: number, tags: string[], height: number): void => {
  video(join(box, `R${id}`, `${F.title} (${F.year}) ${height}p.mkv`), height);
  thread(id, tags, { forum: `${height}p`, tmdb: F.id, folder: `R${id}` });
};

/** The library as the app sees it: the pass over the files that lie there. */
async function pass(): Promise<LibraryIndex> {
  startScan();
  for (let waited = 0; scanRunning() && waited < 250; waited += 1) await sleep();
  return indexLibrary(currentStand().roots);
}
// The move helpers: does the move run, which note does the row carry, and which file
// stands where afterwards.
const placed = async (id: number): Promise<boolean> => {
  await pass();
  return place(id);
};
const note = (id: number): string | null => findDownload(id)?.note ?? null;
const stays = (id: number, at: string): boolean =>
  existsSync(join(box, `R${id}`, `${S.title} - ${at} - Episode ${at.slice(-2)}.mkv`));
const lands = (s: number, e: number): boolean => existsSync(file(S, s, e));
// The pick helpers: the stand of a title, the picks of a pass, and one slot of them.
const standOf = (wants?: string[]): Promise<number | null> =>
  pass().then((index) => titleStand("tv", S.id, index, wants));
const picked = async (): Promise<Map<string, Take>> => {
  const got = new Map<string, Take>();
  await pass();
  await upgradePicks(got);
  return got;
};
const slot = async (s: number, e: number): Promise<Take | undefined> =>
  (await picked()).get(`tv:${S.id}:${ep(s, e)}`);
const title = async (): Promise<Take | undefined> => (await picked()).get(`tv:${S.id}`);
const filmPick = async (): Promise<Take | undefined> => (await picked()).get(`movie:${F.id}`);
const count = async (): Promise<number> => (await picked()).size;

// The pass lives in memory: the next test file gets an unscanned stand.
afterAll(() => {
  const stand = currentStand();
  stand.root = null;
  stand.scannedAt = null;
  stand.roots.length = 0;
});

beforeEach(() => {
  for (const table of [
    downloads,
    mappings,
    releases,
    settings,
    tmdbEpisodes,
    tmdbMovies,
    tmdbSeasons,
    tmdbSeries,
  ])
    db.delete(table).run();
  root = mkdtempSync(join(tmpdir(), "mlc-episode-"));
  box = join(root, "downloads");
  library = join(root, "library");
  mkdirSync(box, { recursive: true });
  mkdirSync(library, { recursive: true });
  set("download_folder", box);
  set("library_root", library);
  set("upgrade_auto_upgrade", "1");
  measurer();
  seed(S, [3, 2]);
  seed(D, [3]);
  db.insert(tmdbMovies)
    .values({ tmdbId: F.id, title: F.title, year: F.year, genres: "[]", certification: "FSK 16" })
    .run();
});

describe("the stand of one episode", () => {
  test("a title nobody knows has no stand", async () => {
    const index = await pass();
    expect(titleStand("tv", 4242, index, ["S01E01"])).toBeNull();
  });
  test("a title with no file has no stand", async () => {
    expect(await standOf(["S01E01"])).toBeNull();
  });
  test("the stand of one episode ignores the higher file of another", async () => {
    holds([1, 1, 2160], [1, 2, 1080]);
    expect((await standOf(["S01E01"])) === 2160 && (await standOf(["S01E02"])) === 1080).toBe(true);
  });
  test("the stand of an absent episode is no stand", async () => {
    holds([1, 1, 2160]);
    expect(await standOf(["S01E03"])).toBeNull();
  });
  test("the stand of an episode counts its file of another season", async () => {
    holds([1, 1, 2160], [2, 1, 1080]);
    expect(await standOf(["S02E01"])).toBe(1080);
  });
  test("the stand of a whole title counts every file of it", async () => {
    holds([1, 1, 2160], [1, 2, 1080]);
    expect((await standOf(["*"])) === 2160 && (await standOf()) === 2160).toBe(true);
  });
  test("a film stands on its film and not on the episodes beside it", async () => {
    film(1080);
    holds([1, 1, 2160]);
    expect(titleStand("movie", F.id, await pass())).toBe(1080);
  });
});

describe("a finished release", () => {
  test("the missing episode moves though another episode stands higher", async () => {
    holds([1, 1, 2160], [1, 2, 1080]);
    ready(700, ["ger", "1080p", "s01e03"], 1080, ep(1, 3));
    expect((await placed(700)) && lands(1, 3) && !stays(700, ep(1, 3)) && note(700) === null).toBe(
      true,
    );
  });
  test("the episode that stands higher keeps its own release out", async () => {
    holds([1, 1, 2160]);
    ready(701, ["ger", "1080p", "s01e01"], 1080, ep(1, 1));
    expect(
      (await placed(701)) === false &&
        note(701)?.includes("measured 1080p, library holds 2160p") === true,
    ).toBe(true);
  });
  test("the episode held lower is not held out by the higher file of its title", async () => {
    holds([1, 1, 1080], [1, 2, 2160]);
    ready(702, ["ger", "1080p", "s01e01"], 1080, ep(1, 1));
    await placed(702);
    expect(note(702) ?? "").not.toContain("library holds 2160p");
  });
  test("a pack of two free places moves", async () => {
    holds([1, 1, 2160]);
    ready(703, ["ger", "1080p", "s01e02", "s01e03"], 1080, ep(1, 2), ep(1, 3));
    expect((await placed(703)) && lands(1, 2) && lands(1, 3)).toBe(true);
  });
  test("a pack is held out by the highest episode it lands on", async () => {
    holds([1, 1, 2160]);
    ready(704, ["ger", "1080p", "s01e01", "s01e03"], 1080, ep(1, 1), ep(1, 3));
    expect(
      (await placed(704)) === false &&
        !lands(1, 3) &&
        note(704)?.includes("library holds 2160p") === true,
    ).toBe(true);
  });
  test("the missing episode moves though a higher season holds another", async () => {
    holds([2, 1, 2160]);
    ready(705, ["ger", "1080p", "s01e01"], 1080, ep(1, 1));
    expect(await placed(705)).toBe(true);
  });
  test("the episode of another season that stands higher keeps its release out", async () => {
    holds([2, 1, 2160]);
    ready(706, ["ger", "1080p", "s02e01"], 1080, ep(2, 1));
    expect(await placed(706)).toBe(false);
  });
  test("an episode the library holds unmeasured is not held out by a higher one", async () => {
    blind(file(S, 1, 1));
    holds([1, 2, 2160]);
    ready(707, ["ger", "1080p", "s01e01"], 1080, ep(1, 1));
    await placed(707);
    expect(note(707) ?? "").not.toContain("library holds 2160p");
  });
  test("a film under the band the library holds stays stopped", async () => {
    film(2160);
    readyFilm(708, ["ger", "1080p"], 1080);
    expect(
      (await placed(708)) === false && note(708)?.includes("library holds 2160p") === true,
    ).toBe(true);
  });
  test("a film above the band the library holds moves", async () => {
    film(1080);
    readyFilm(709, ["ger", "2160p"], 2160);
    expect(await placed(709)).toBe(true);
  });
  test("a film release is not held out by an episode of a series", async () => {
    film(1080);
    holds([1, 1, 2160]);
    readyFilm(710, ["ger", "2160p"], 2160);
    expect(await placed(710)).toBe(true);
  });
  test("a release nobody measured stays stopped", async () => {
    blind(join(box, "R711", `${S.title} - ${ep(1, 3)} - Episode 03.mkv`));
    thread(711, ["ger", "1080p", "s01e03"], { tmdb: S.id, kind: "tv", folder: "R711" });
    expect((await placed(711)) === false && note(711)?.includes("nothing measured") === true).toBe(
      true,
    );
  });
  test("a release under what its thread claims stays stopped", async () => {
    video(join(box, "R712", `${S.title} - ${ep(1, 3)} - Episode 03.mkv`), 720);
    thread(712, ["ger", "1080p", "s01e03"], {
      forum: "1080p",
      tmdb: S.id,
      kind: "tv",
      folder: "R712",
    });
    expect(
      (await placed(712)) === false &&
        note(712)?.includes("measured 720p, thread claims 1080p") === true &&
        stays(712, ep(1, 3)),
    ).toBe(true);
  });
  test("in flat mode the missing episode moves though another episode stands higher", async () => {
    set("flat_mode", "1");
    holds([1, 1, 2160]);
    ready(713, ["ger", "1080p", "s01e03"], 1080, ep(1, 3));
    expect(await placed(713)).toBe(true);
  });
  test("in flat mode the episode that stands higher keeps its own release out", async () => {
    set("flat_mode", "1");
    holds([1, 1, 2160]);
    ready(714, ["ger", "1080p", "s01e01"], 1080, ep(1, 1));
    expect(await placed(714)).toBe(false);
  });
  test("a finished release leaves the download folder in a check", async () => {
    set("upgrades_enabled", "1");
    holds([1, 1, 2160], [1, 2, 1080]);
    ready(715, ["ger", "1080p", "s01e03"], 1080, ep(1, 3));
    startUpgradeCheck();
    for (let waited = 0; waited < 50 && !lands(1, 3); waited += 1) await sleep();
    expect(lands(1, 3) && !stays(715, ep(1, 3))).toBe(true);
  });
  test("a blocked release keeps its note and its file", async () => {
    set("upgrades_enabled", "1");
    holds([1, 1, 2160]);
    ready(716, ["ger", "1080p", "s01e01"], 1080, ep(1, 1));
    startUpgradeCheck();
    for (let waited = 0; waited < 50 && note(716) === null; waited += 1) await sleep();
    expect(note(716)?.includes("library holds 2160p") === true && stays(716, ep(1, 1))).toBe(true);
  });
});

describe("the picks of a series", () => {
  test("the gap of a series fills at its own band", async () => {
    holds([1, 1, 2160], [1, 2, 1080]);
    ready(720, ["ger", "1080p", "s01e03"], 1080);
    thread(721, ["ger", "720p", "s01e02"], { tmdb: S.id, kind: "tv" });
    expect(((await slot(1, 3))?.res ?? 0) === 1080 && (await slot(1, 2)) === undefined).toBe(true);
  });
  test("the gap of a series fills below the band of a higher season", async () => {
    holds([2, 1, 2160]);
    ready(722, ["ger", "720p", "s01e03"], 720);
    expect((await slot(1, 3))?.threadId).toBe(722);
  });
  test("a release that also replaces a higher episode has to reach it", async () => {
    holds([1, 1, 2160]);
    thread(723, ["ger", "1080p", "s01e01", "s01e02"], { tmdb: S.id, kind: "tv" });
    expect(await count()).toBe(0);
  });
  test("the episode held lower is upgraded beside a higher one", async () => {
    holds([1, 1, 1080], [1, 2, 2160]);
    thread(724, ["ger", "2160p", "s01e01"], { tmdb: S.id, kind: "tv" });
    expect((await title())?.res).toBe(2160);
  });
  test("the upgrade of an episode counts its file of another season", async () => {
    holds([2, 1, 1080]);
    thread(725, ["ger", "2160p", "s02e01"], { tmdb: S.id, kind: "tv" });
    expect((await title())?.res).toBe(2160);
  });
  test("an episode that already stands at its band is no upgrade", async () => {
    holds([1, 1, 1080], [1, 2, 2160]);
    thread(726, ["ger", "1080p", "s01e01"], { tmdb: S.id, kind: "tv" });
    expect(await count()).toBe(0);
  });
  test("an episode held lower is no upgrade for a release below it", async () => {
    holds([1, 1, 2160], [1, 2, 1080]);
    thread(727, ["ger", "720p", "s01e02"], { tmdb: S.id, kind: "tv" });
    expect(await count()).toBe(0);
  });
  test("a pack has to reach the highest episode it covers", async () => {
    holds([1, 1, 2160], [1, 2, 1080], [1, 3, 720]);
    thread(728, ["ger", "1080p", "s01e01", "s01e03"], { tmdb: S.id, kind: "tv" });
    expect(await count()).toBe(0);
  });
  test("a pack is an upgrade when it reaches its highest episode", async () => {
    holds([1, 1, 1080], [1, 2, 2160], [1, 3, 720]);
    thread(729, ["ger", "2160p", "s01e01", "s01e03"], { tmdb: S.id, kind: "tv" });
    expect((await title())?.threadId).toBe(729);
  });
  test("the upgrade of a whole season stands on its episodes", async () => {
    holds([1, 1, 1080], [1, 2, 1080], [1, 3, 1080]);
    thread(730, ["ger", "2160p", "s01"], { tmdb: S.id, kind: "tv" });
    expect((await title())?.res).toBe(2160);
  });
  test("the download of another thread does not bar the episode it names", async () => {
    holds([1, 1, 720]);
    thread(731, ["ger", "2160p", "s01e01"], {
      tmdb: S.id,
      kind: "tv",
      folder: "R731",
      state: "downloading",
    });
    thread(732, ["ger", "1080p", "s01e01"], { tmdb: S.id, kind: "tv" });
    expect((await title())?.threadId).toBe(732);
  });
  test("a film upgrade stands on its film", async () => {
    film(1080);
    holds([1, 1, 2160]);
    thread(736, ["ger", "2160p"], { forum: "2160p", tmdb: F.id });
    expect((await filmPick())?.res).toBe(2160);
  });
  test("a thread of a title nobody has in the library is no pick", async () => {
    holds([1, 1, 1080]);
    thread(737, ["ger", "2160p", "s01e01"], { tmdb: 4242, kind: "tv" });
    expect(await count()).toBe(0);
  });
});

describe("two series in one library", () => {
  test("the gap of each series fills at its own band", async () => {
    holds([1, 1, 2160]);
    other(1, 1, 2160);
    other(1, 2, 2160);
    ready(740, ["ger", "1080p", "s01e03"], 1080);
    thread(741, ["ger", "720p", "s01e03"], { tmdb: D.id, kind: "tv" });
    expect(
      ((await slot(1, 3))?.threadId ?? 0) === 740 &&
        ((await picked()).get(`tv:${D.id}:${ep(1, 3)}`)?.threadId ?? 0) === 741,
    ).toBe(true);
  });
  test("the episode held lower is upgraded in one series and not barred by the other", async () => {
    other(1, 1, 2160);
    holds([1, 1, 1080]);
    thread(742, ["ger", "2160p", "s01e01"], { tmdb: S.id, kind: "tv" });
    expect((await title())?.res).toBe(2160);
  });
  test("the missing episode of one series moves though the other stands higher", async () => {
    other(1, 1, 2160);
    holds([1, 1, 1080]);
    ready(743, ["ger", "1080p", "s01e03"], 1080, ep(1, 3));
    expect(await placed(743)).toBe(true);
  });
  test("the release of a film stands on its film between two series", async () => {
    film(1080);
    holds([1, 1, 2160]);
    other(1, 1, 2160);
    readyFilm(744, ["ger", "2160p"], 2160);
    expect(await placed(744)).toBe(true);
  });
});
