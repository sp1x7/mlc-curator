// The band of one release and the stand the app holds for a title.

import { beforeEach, describe, expect, test } from "bun:test";
import { releaseRes, titleStand } from "../server/upgrades/stand";
import { indexLibrary } from "../server/wishlist/library";
import { downloadRow, mapTitle, owned, threadRow } from "./rows";
import { clearTables } from "./setup";

// A library index of zero folders, for the tests that read the board alone.
const noLibrary = indexLibrary([]);

beforeEach(async () => {
  await clearTables();
});

describe("releaseRes", () => {
  test("a thread of the 1080p forum stays 1080 whatever its name says", () => {
    expect(releaseRes("1080p", ["2160p", "4k", "uhd"])).toBe(1080);
  });

  test("the 2160p forum gives 2160 without a resolution tag", () => {
    expect(releaseRes("2160p", ["x265"])).toBe(2160);
  });

  test("a series forum names no band, so the tags decide", () => {
    expect(releaseRes("Folgen", ["1080p"])).toBe(1080);
    expect(releaseRes("Staffeln", ["2160p"])).toBe(2160);
  });

  test("the dvd forum names no band, so the tags decide", () => {
    expect(releaseRes("DVD/SD", ["720p"])).toBe(720);
  });

  test("no forum row, the tags decide", () => {
    expect(releaseRes(null, ["4k"])).toBe(2160);
    expect(releaseRes("Collection", [])).toBeNull();
  });
});

describe("titleStand", () => {
  test("a thread that delivered sets the stand", () => {
    owned(101, ["1080p"]);
    expect(titleStand("movie", 101, noLibrary)).toBe(1080);
  });

  test("the better of two delivered threads wins", () => {
    owned(102, ["720p"]);
    threadRow({ threadId: 202, tags: ["1080p"] });
    mapTitle(202, 102);
    downloadRow(202, "planned");

    expect(titleStand("movie", 102, noLibrary)).toBe(1080);
  });

  test("a thread that errored counts for nothing", () => {
    owned(103, ["2160p"], "error");
    expect(titleStand("movie", 103, noLibrary)).toBeNull();
  });

  test("a thread that stopped counts for nothing", () => {
    owned(105, ["2160p"], "stopped");
    expect(titleStand("movie", 105, noLibrary)).toBeNull();
  });

  test("a thread that is still running counts", () => {
    owned(104, ["2160p"], "downloading");
    expect(titleStand("movie", 104, noLibrary)).toBe(2160);
  });

  test("an unknown title has no stand", () => {
    expect(titleStand("movie", 999, noLibrary)).toBeNull();
  });
});
