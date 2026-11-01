// Resolution bands: what the tags say, what a measured file measures, the verdict a
// wish target gives, and the wishlist api over linked releases.

import { beforeEach, describe, expect, test } from "bun:test";
import { probeRes } from "@shared/types/band";
import type { Probe } from "@shared/types/library";
import type { WishMatch } from "@shared/types/wishlist";
import { eq } from "drizzle-orm";
import { api } from "../server/app/app";
import { db } from "../server/db/db";
import { wishes } from "../server/db/schema";
import { resCheck } from "../server/wishlist/target";
import { mapTitle, movieRow, threadRow, wishRow } from "./rows";
import { clearTables } from "./setup";

/** A probe result with only its measurements filled. */
function probe(width: number | null, height: number | null): Probe {
  return {
    width,
    height,
    videoCodec: "h264",
    container: "mkv",
    hdr: null,
    runtimeMinutes: null,
    audio: [],
    subtitles: [],
  };
}

describe("resCheck", () => {
  test("a 980 line file meets a 1080 target", () => {
    expect(resCheck("1080p", 980, "nothing on disk").ok).toBe(true);
  });

  test("a 720 line file is below a 1080 target", () => {
    const check = resCheck("1080p", 720, "nothing on disk");
    expect(check.ok).toBe(false);
    expect(check.why).toBe("below target: 720p < 1080p");
  });

  test("1080 under a 2160 target is named as below target", () => {
    const check = resCheck("2160p", 1080, "nothing on disk");
    expect(check.ok).toBe(false);
    expect(check.why).toBe("below target: 1080p < 2160p");
  });

  test("2160 meets a 2160 target", () => {
    expect(resCheck("2160p", 2160, "nothing on disk").ok).toBe(true);
  });

  test("an unbuilt target takes anything", () => {
    expect(resCheck("none", null, "nothing on disk").ok).toBe(true);
  });

  test("a uhd measurement never reads as below a 2160 target", () => {
    expect(resCheck("2160p", probeRes(probe(3840, 2160)), "nothing on disk").ok).toBe(true);
  });

  test("a uhd scope crop reaches a 2160 target", () => {
    const check = resCheck("2160p", probeRes(probe(3832, 1592)), "nothing on disk");

    expect(check.ok).toBe(true);
    expect(check.why).toBeNull();
  });

  test("an unmeasured file is reported with the missing text", () => {
    const check = resCheck("1080p", null, "no probe");
    expect(check.ok).toBe(false);
    expect(check.why).toBe("no probe");
  });
});

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

/** The wish rows of the list answer. */
type WishRows = Array<{ tmdbId: number; matches: WishMatch[] }>;

/** Reads the wishlist. */
async function wishList(): Promise<{ rows: WishRows; scannedAt: string | null }> {
  const answered = await call("/wishlist/wishes");

  expect(answered.status).toBe(200);
  return answered.body as { rows: WishRows; scannedAt: string | null };
}

/** The match of one thread under the wish of tmdb id 400. */
function matchOf(list: { rows: WishRows }, threadId: number): WishMatch | undefined {
  return list.rows
    .find((row) => row.tmdbId === 400)
    ?.matches.find((match) => match.threadId === threadId);
}

/** The id of the stored wish of tmdb id 400. */
function storedId(): number {
  return db.select({ id: wishes.id }).from(wishes).where(eq(wishes.tmdbId, 400)).get()?.id ?? -1;
}

beforeEach(async () => {
  await clearTables();
  movieRow({ tmdbId: 400, title: "The Title", year: 2024 });
});

describe("POST /wishlist/add", () => {
  test("a wish is on the list after it was added", async () => {
    const added = await call("/wishlist/add", {
      method: "POST",
      body: { tmdbId: 400, kind: "movie", minRes: "2160p", hdr: "any", audio: "any" },
    });

    const list = await wishList();

    expect(added.status).toBe(200);
    expect(added.body).toEqual({ ok: true, exists: false });
    expect(list.rows).toHaveLength(1);
  });

  test("a title already on the list keeps the target it has", async () => {
    wishRow({ id: 11, tmdbId: 400, minRes: "2160p" });

    const added = await call("/wishlist/add", {
      method: "POST",
      body: { tmdbId: 400, kind: "movie", minRes: "720p", hdr: "any", audio: "any" },
    });

    expect(added.body).toEqual({ ok: true, exists: true });
    expect(JSON.stringify((await wishList()).rows)).toContain("2160p");
  });

  test("a wish without a title is refused", async () => {
    const added = await call("/wishlist/add", { method: "POST", body: { kind: "movie" } });

    expect(added.status).toBe(400);
    expect((await wishList()).rows).toHaveLength(0);
  });
});

describe("PUT /wishlist/target/:id", () => {
  test("a saved target is the target the list answers with", async () => {
    wishRow({ id: 12, tmdbId: 400, minRes: "1080p" });

    const saved = await call(`/wishlist/target/${storedId()}`, {
      method: "PUT",
      body: { minRes: "2160p", hdr: "any", audio: "any" },
    });

    expect(saved.status).toBe(200);
    expect(JSON.stringify((await wishList()).rows)).toContain("2160p");
  });

  test("a target without hdr or audio is refused", async () => {
    wishRow({ id: 13, tmdbId: 400, minRes: "1080p" });

    const saved = await call(`/wishlist/target/${storedId()}`, {
      method: "PUT",
      body: { minRes: "2160p" },
    });

    expect(saved.status).toBe(400);
  });
});

describe("GET /wishlist/wishes", () => {
  test("an empty list says so and has no library stamp", async () => {
    const list = await wishList();

    expect(list.rows).toEqual([]);
    expect(list.scannedAt).toBeNull();
  });

  test("a release under the target of the wish is named as below target", async () => {
    wishRow({ id: 14, tmdbId: 400, minRes: "2160p" });
    threadRow({ threadId: 761, tags: ["1080p"], forum: "1080p" });
    mapTitle(761, 400);

    const list = await wishList();

    expect(matchOf(list, 761)?.why).toContain("below target");
  });

  test("a release of the target band is not named as below target", async () => {
    wishRow({ id: 15, tmdbId: 400, minRes: "2160p" });
    threadRow({ threadId: 762, tags: ["2160p"], forum: "2160p" });
    mapTitle(762, 400);

    const list = await wishList();

    expect(matchOf(list, 762)?.why ?? "").not.toContain("below target");
  });

  test("a thread of the 1080p forum with 4k in its tags is below a 2160 target", async () => {
    wishRow({ id: 16, tmdbId: 400, minRes: "2160p" });
    threadRow({ threadId: 763, tags: ["4k", "2160p"], forum: "1080p" });
    mapTitle(763, 400);

    const list = await wishList();

    expect(matchOf(list, 763)?.why).toContain("below target");
  });
});

describe("DELETE /wishlist/wish/:id", () => {
  test("the wish is gone from the list", async () => {
    wishRow({ id: 17, tmdbId: 400, minRes: "1080p" });

    const removed = await call(`/wishlist/wish/${storedId()}`, { method: "DELETE" });

    expect(removed.status).toBe(200);
    expect((await wishList()).rows).toEqual([]);
  });
});
