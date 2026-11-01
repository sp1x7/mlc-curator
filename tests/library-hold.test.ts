// A finished release takes a filled library place once it sits above the file that
// holds it. The library reports its files by measurement, so measurement decides:
// higher replaces, equal and lower stay out, an unmeasured place keeps its file, and
// a release of zero measurement stays outside — for episodes, seasons, series, films
// and flat mode alike.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DownloadPlan } from "@shared/types/downloads";
import { api } from "../server/app/app";
import { db } from "../server/db/db";
import { tmdbEpisodes, tmdbMovies, tmdbSeasons, tmdbSeries } from "../server/db/schema";
import { findDownload } from "../server/downloads/store";
import { currentStand, scanRunning, startScan } from "../server/library/stand";
import { place } from "../server/upgrades/run";
import { downloadRow, folderRows, mapTitle, settingRow, threadRow } from "./rows";
import { clearTables } from "./setup";

/** A title with its tmdb id, year and name. */
type Title = { tmdbId: number; title: string; year: number };

const ONE: Title = { tmdbId: 450, title: "Night Shift", year: 2021 };
const TWO: Title = { tmdbId: 451, title: "Second Watch", year: 2020 };
const FILM: Title = { tmdbId: 1858, title: "Long Haul", year: 2019 };
const pad = (value: number): string => String(value).padStart(2, "0");

let root = "";
let library = "";

/** The measurer the settings name: a file answers with the height it carries. */
function measurer(): void {
  const stub = join(root, "measurer.sh");

  writeFileSync(
    stub,
    `#!/bin/sh
case "$*" in
  *version*) echo '{"ffprobe version":"stub"}'; exit 0 ;;
esac
last=""
for arg in "$@"; do last="$arg"; done
height=$(sed -n "s/^height=\\([0-9]*\\).*/\\1/p" "$last")
if [ -z "$height" ]; then echo "no measure in this file" >&2; exit 1; fi
echo '{"format":{"duration":"3600"},"streams":[{"codec_type":"video","width":2000,"height":'"$height"'}]}'
`,
  );
  chmodSync(stub, 0o755);
  settingRow("probe_binary", stub);
}

/** A video file: its content is what the measurer reads out of it, and its
 *  marker says afterwards which file ended up where.
 */
function media(path: string, height: number | null, mark: string): void {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, height === null ? `id=${mark}\n` : `height=${height}\nid=${mark}\n`);
}

/** The marker the file at a library place carries. */
function held(path: string): string {
  return readFileSync(path, "utf8");
}

/** Where the library keeps one episode of a series. */
function episodePlace(at: Title, season: number, episode: number): string {
  return join(
    library,
    "Serien",
    `${at.title} (${at.year})`,
    `Season ${pad(season)}`,
    `${at.title} - S${pad(season)}E${pad(episode)} - Hour ${episode}.mkv`,
  );
}

/** Where the library keeps a film, in folders or in flat mode. */
function filmPlace(at: Title, flat: boolean): string {
  const name = `${at.title} (${at.year}) 2160p.mkv`;

  return flat
    ? join(library, "Filme", name)
    : join(library, "Filme", `${at.title} (${at.year})`, name);
}

/** The library as the app sees it: the pass over the files that lie there. */
async function pass(): Promise<void> {
  startScan();
  for (let waited = 0; scanRunning() && waited < 400; waited += 1) {
    await new Promise((done) => setTimeout(done, 15));
  }
}

/** The plan of a thread; an answer off 200 throws. */
async function planOf(threadId: number): Promise<DownloadPlan> {
  const answer = await api.request(`/downloads/plan/${threadId}`);
  if (answer.status !== 200) throw new Error(`no plan for ${threadId}: ${answer.status}`);

  return (await answer.json()) as DownloadPlan;
}

/** The library place the plan names for this release's episode or film. */
async function filled(threadId: number, needle: string): Promise<string> {
  const entry = (await planOf(threadId)).entries.find(
    (item) => item.kind === "video" && item.to.includes(needle),
  );
  if (!entry) throw new Error(`the plan names no place holding ${needle}`);

  return entry.to;
}

/** Whether the plan moves this release's file into that place. */
async function movesInto(threadId: number, target: string): Promise<boolean> {
  const entry = (await planOf(threadId)).entries.find((item) => item.to === target);
  if (!entry) throw new Error(`the plan says nothing about ${target}`);

  return entry.move;
}

/** A ready release of a series: one file per episode it names. */
function episodeRelease(
  threadId: number,
  at: Title,
  season: number,
  height: number | null,
  ...episodes: number[]
): string[] {
  const folder = `R${threadId}`;
  const files: string[] = [];

  for (const episode of episodes) {
    const name = `${at.title} - S${pad(season)}E${pad(episode)} - Hour ${episode}.mkv`;
    media(join(root, "download", folder, name), height, `r${threadId}e${episode}`);
    files.push(join(root, "download", folder, name));
  }

  threadRow({
    threadId,
    tags: [
      "ger",
      height === null ? "2160p" : `${height}p`,
      ...episodes.map((e) => `s${pad(season)}e${pad(e)}`),
    ],
    forum: "Folgen",
  });
  mapTitle(threadId, at.tmdbId, "tv");
  downloadRow(threadId, "planned", folder);

  return files;
}

/** A ready film release: one file, named after its own band. */
function filmRelease(threadId: number, at: Title, height: number | null): string {
  const folder = `R${threadId}`;
  const name = `${at.title} (${at.year})${height === null ? " 2160p" : ` ${height}p`}.mkv`;

  media(join(root, "download", folder, name), height, `r${threadId}`);
  threadRow({
    threadId,
    tags: ["ger", height === null ? "2160p" : `${height}p`],
    forum: height === null ? "2160p" : `${height}p`,
  });
  mapTitle(threadId, at.tmdbId, "movie");
  downloadRow(threadId, "planned", folder);

  return join(root, "download", folder, name);
}

/** True when the row of this release ended stopped. */
function stopped(threadId: number): boolean {
  return findDownload(threadId)?.state === "stopped";
}

/** The tmdb rows of a series: its seasons with the episode count of each. */
function seed(series: Title, seasons: number[]): void {
  db.insert(tmdbSeries)
    .values({
      tmdbId: series.tmdbId,
      title: series.title,
      firstAirYear: series.year,
      originalLanguage: "en",
      genres: "[]",
      certification: "FSK 16",
      numberOfSeasons: seasons.length,
    })
    .run();
  db.insert(tmdbSeasons)
    .values(
      seasons.map((count, index) => ({
        tmdbId: series.tmdbId,
        seasonNumber: index + 1,
        name: `Season ${index + 1}`,
        episodeCount: count,
      })),
    )
    .run();
  db.insert(tmdbEpisodes)
    .values(
      seasons.flatMap((count, index) =>
        Array.from({ length: count }, (_, episode) => ({
          tmdbId: series.tmdbId,
          seasonNumber: index + 1,
          episodeNumber: episode + 1,
          name: `Hour ${episode + 1}`,
        })),
      ),
    )
    .run();
}

beforeEach(async () => {
  await clearTables();
  for (const table of [tmdbEpisodes, tmdbSeasons, tmdbSeries, tmdbMovies]) db.delete(table).run();

  root = mkdtempSync(join(tmpdir(), "mlc-hold-"));
  library = join(root, "library");
  mkdirSync(library, { recursive: true });
  folderRows(join(root, "download"), library);
  measurer();

  seed(ONE, [2, 2]);
  seed(TWO, [1]);
  db.insert(tmdbMovies)
    .values({
      tmdbId: FILM.tmdbId,
      title: FILM.title,
      year: FILM.year,
      originalLanguage: "en",
      genres: "[]",
      certification: "FSK 16",
    })
    .run();
});

// The stand of the library goes back to empty after every test.
afterEach(() => {
  const stand = currentStand();
  stand.root = null;
  stand.scannedAt = null;
  stand.roots.length = 0;
});

describe("an episode place that is taken", () => {
  test("the higher release takes it and the old file is gone", async () => {
    media(episodePlace(ONE, 1, 1), 1080, "old");
    await pass();

    const [file] = episodeRelease(900, ONE, 1, 2160, 1);
    const taken = await filled(900, "S01E01");

    expect(await movesInto(900, taken)).toBe(true);
    expect(await place(900)).toBe(true);
    expect(held(taken)).toContain("r900e1");
    expect(existsSync(file as string)).toBe(false);
  });

  test("the equal release stays out and keeps its file", async () => {
    media(episodePlace(ONE, 1, 1), 1080, "old");
    await pass();

    const [file] = episodeRelease(901, ONE, 1, 1080, 1);
    const taken = await filled(901, "S01E01");

    expect(await movesInto(901, taken)).toBe(false);
    expect(await place(901)).toBe(false);
    expect(held(taken)).toContain("old");
    expect(existsSync(file as string)).toBe(true);
    expect(stopped(901)).toBe(true);
  });

  test("the lower release stays out and keeps its file", async () => {
    media(episodePlace(ONE, 1, 1), 2160, "old");
    await pass();

    const [file] = episodeRelease(902, ONE, 1, 1080, 1);
    const taken = await filled(902, "S01E01");

    expect(await movesInto(902, taken)).toBe(false);
    expect(await place(902)).toBe(false);
    expect(held(taken)).toContain("old");
    expect(existsSync(file as string)).toBe(true);
    expect(stopped(902)).toBe(true);
  });

  test("a pack of two episodes replaces one place and leaves the other", async () => {
    media(episodePlace(ONE, 1, 1), 1080, "old1");
    media(episodePlace(ONE, 1, 2), 2160, "old2");
    await pass();

    const files = episodeRelease(906, ONE, 1, 2160, 1, 2);
    const beaten = await filled(906, "S01E01");
    const higher = await filled(906, "S01E02");

    expect(await movesInto(906, beaten)).toBe(true);
    expect(await movesInto(906, higher)).toBe(false);
    expect(await place(906)).toBe(true);
    expect(held(beaten)).toContain("r906e1");
    expect(held(higher)).toContain("old2");
    expect(existsSync(files[1] as string)).toBe(true);
  });

  test("a season pack replaces the episode it stands above", async () => {
    media(episodePlace(ONE, 2, 1), 1080, "old1");
    media(episodePlace(ONE, 2, 2), 1080, "old2");
    await pass();

    episodeRelease(914, ONE, 2, 2160, 1, 2);

    expect(await place(914)).toBe(true);
    expect(held(episodePlace(ONE, 2, 1))).toContain("r914e1");
    expect(held(episodePlace(ONE, 2, 2))).toContain("r914e2");
  });
});

describe("places apart from each other", () => {
  test("the higher file of another episode does not hold the release out", async () => {
    media(episodePlace(ONE, 1, 2), 2160, "other");
    await pass();

    episodeRelease(911, ONE, 1, 1080, 1);

    expect(await place(911)).toBe(true);
    expect(held(episodePlace(ONE, 1, 1))).toContain("r911e1");
  });

  test("the higher file of another season does not hold the release out", async () => {
    media(episodePlace(ONE, 2, 1), 2160, "other");
    await pass();

    episodeRelease(915, ONE, 1, 1080, 1);

    expect(await place(915)).toBe(true);
    expect(held(episodePlace(ONE, 1, 1))).toContain("r915e1");
  });

  test("a series replaces its own place and leaves the other series alone", async () => {
    media(episodePlace(ONE, 1, 1), 2160, "a-old");
    media(episodePlace(TWO, 1, 1), 1080, "b-old");
    await pass();

    episodeRelease(916, TWO, 1, 2160, 1);

    expect(await place(916)).toBe(true);
    expect(held(episodePlace(TWO, 1, 1))).toContain("r916e1");
    expect(held(episodePlace(ONE, 1, 1))).toContain("a-old");
  });

  test("the film takes the place of the film that stands there", async () => {
    filmRelease(907, FILM, 2160);
    const taken = await filled(907, FILM.title);
    media(taken, 1080, "old");
    await pass();

    expect(await movesInto(907, taken)).toBe(true);
    expect(await place(907)).toBe(true);
    expect(held(filmPlace(FILM, false))).toContain("r907");
  });

  test("the equal film stays out of the film place", async () => {
    filmRelease(917, FILM, 2160);
    const taken = await filled(917, FILM.title);
    media(taken, 2160, "old");
    await pass();

    expect(await movesInto(917, taken)).toBe(false);
    expect(await place(917)).toBe(false);
    expect(held(filmPlace(FILM, false))).toContain("old");
  });

  test("the flat film takes the place of the flat film that stands there", async () => {
    settingRow("flat_mode", "1");
    filmRelease(908, FILM, 2160);
    const taken = await filled(908, FILM.title);
    media(taken, 1080, "old");
    await pass();

    expect(taken).toBe(filmPlace(FILM, true));
    expect(await movesInto(908, taken)).toBe(true);
    expect(await place(908)).toBe(true);
    expect(held(filmPlace(FILM, true))).toContain("r908");
  });
});

describe("a place that is free", () => {
  test("a free place takes the release at any measure", async () => {
    episodeRelease(905, ONE, 1, 720, 1);
    await pass();

    const free = await filled(905, "S01E01");

    expect(await movesInto(905, free)).toBe(true);
    expect(await place(905)).toBe(true);
    expect(held(free)).toContain("r905e1");
  });

  test("a free place is taken without a library pass", async () => {
    episodeRelease(912, ONE, 1, 720, 1);

    expect(await place(912)).toBe(true);
    expect(held(episodePlace(ONE, 1, 1))).toContain("r912e1");
  });
});

describe("nothing measured", () => {
  test("an unmeasured place keeps its file", async () => {
    media(episodePlace(ONE, 1, 1), null, "old");
    await pass();

    const [file] = episodeRelease(903, ONE, 1, 2160, 1);
    const taken = await filled(903, "S01E01");

    expect(await movesInto(903, taken)).toBe(false);
    expect(await place(903)).toBe(false);
    expect(held(taken)).toContain("old");
    expect(existsSync(file as string)).toBe(true);
  });

  test("a release nobody measured never takes a place", async () => {
    media(episodePlace(ONE, 1, 1), 1080, "old");
    await pass();

    episodeRelease(904, ONE, 1, null, 1);
    const taken = await filled(904, "S01E01");

    expect(await movesInto(904, taken)).toBe(false);
    expect(await place(904)).toBe(false);
    expect(held(taken)).toContain("old");
    expect(stopped(904)).toBe(true);
  });

  test("a taken place keeps its file while nobody has scanned the library", async () => {
    media(episodePlace(ONE, 1, 1), 1080, "old");
    episodeRelease(913, ONE, 1, 2160, 1);

    expect(await place(913)).toBe(false);
    expect(held(episodePlace(ONE, 1, 1))).toContain("old");
    expect(stopped(913)).toBe(true);
  });
});

describe("the library after a replace", () => {
  test("the file it just took is held against the next release of the same measure", async () => {
    media(episodePlace(ONE, 1, 1), 1080, "old");
    await pass();

    episodeRelease(909, ONE, 1, 2160, 1);
    expect(await place(909)).toBe(true);

    episodeRelease(910, ONE, 1, 2160, 1);
    const taken = await filled(910, "S01E01");

    expect(await movesInto(910, taken)).toBe(false);
    expect(await place(910)).toBe(false);
    expect(held(taken)).toContain("r909e1");
  });
});
