// Which releases a check picks: the switches, the forum band, the look back
// window, and the threads that already have a download row.

import { beforeEach, describe, expect, test } from "bun:test";
import { currentStand } from "../server/library/stand";
import type { Take } from "../server/upgrades/pick";
import {
  isUpgrade,
  pickUpgrades,
  upgradePicks,
  windowFrom,
  wishPicks,
} from "../server/upgrades/pick";
import { mayPlace } from "../server/upgrades/run";
import { DAY, downloadRow, mapTitle, now, owned, settingRow, threadRow, wishRow } from "./rows";
import { clearTables } from "./setup";

/** An empty pick list. */
function chosenOf(): Map<string, Take> {
  return new Map<string, Take>();
}

beforeEach(async () => {
  await clearTables();
});

describe("upgradePicks", () => {
  test("nothing is picked while the upgrade switch is missing", async () => {
    owned(101, ["1080p"]);
    threadRow({ threadId: 501, forum: "2160p", tags: ["2160p"] });
    mapTitle(501, 101);

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.size).toBe(0);
  });

  test("the upgrade switch on picks the thread above the stand", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(101, ["1080p"]);
    threadRow({ threadId: 501, forum: "2160p", tags: ["2160p"] });
    mapTitle(501, 101);

    const chosen = chosenOf();
    await upgradePicks(chosen);

    expect(chosen.get("movie:101")?.threadId).toBe(501);
    expect(chosen.get("movie:101")?.res).toBe(2160);
    expect(chosen.get("movie:101")?.reason).toBe("upgrade");
  });

  test("4k in the name of a 1080p forum thread is no upgrade", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(102, ["1080p"]);
    threadRow({ threadId: 502, forum: "1080p", tags: ["4k", "2160p"] });
    mapTitle(502, 102);

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.size).toBe(0);
  });

  test("the same thread in the 2160p forum is an upgrade", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(103, ["1080p"]);
    threadRow({ threadId: 503, forum: "2160p", tags: ["4k", "2160p"] });
    mapTitle(503, 103);

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.get("movie:103")?.res).toBe(2160);
  });

  test("a thread of the stand band is no upgrade", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(104, ["1080p"]);
    threadRow({ threadId: 504, forum: "1080p", tags: ["1080p"] });
    mapTitle(504, 104);

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.size).toBe(0);
  });

  test("a thread with a download row is not picked again", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(105, ["1080p"]);
    threadRow({ threadId: 505, forum: "2160p", tags: ["2160p"] });
    mapTitle(505, 105);
    downloadRow(505, "planned");

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.size).toBe(0);
  });

  test("a thread older than the look back is not picked", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(106, ["1080p"]);
    threadRow({ threadId: 506, forum: "2160p", tags: ["2160p"], publishedAt: now() - 40 * DAY });
    mapTitle(506, 106);

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.size).toBe(0);

    settingRow("upgrade_lookback_days", "90");
    await upgradePicks(chosen);
    expect(chosen.get("movie:106")?.threadId).toBe(506);
  });

  test("a zero look back starts at the last check", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    settingRow("upgrade_lookback_days", "0");
    settingRow("upgrade_last_check_at", String(now() - 10 * DAY));

    owned(107, ["1080p"]);
    threadRow({ threadId: 507, forum: "2160p", tags: ["2160p"], publishedAt: now() - 20 * DAY });
    mapTitle(507, 107);

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.size).toBe(0);

    threadRow({ threadId: 508, forum: "2160p", tags: ["2160p"], publishedAt: now() - DAY });
    mapTitle(508, 107);
    await upgradePicks(chosen);
    expect(chosen.get("movie:107")?.threadId).toBe(508);
  });

  test("a band a stopped download already measured below is not picked again", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(120, ["1080p"]);

    threadRow({ threadId: 620, forum: "2160p", tags: ["2160p"] });
    mapTitle(620, 120);
    downloadRow(620, "stopped", undefined, "measured 1080p, thread claims 2160p");

    threadRow({ threadId: 621, forum: "2160p", tags: ["2160p"] });
    mapTitle(621, 120);

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.size).toBe(0);
  });

  test("a stopped measurement does not bar another band of the same title", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(121, ["720p"]);

    threadRow({ threadId: 622, forum: "2160p", tags: ["2160p"] });
    mapTitle(622, 121);
    downloadRow(622, "stopped", undefined, "measured 1080p, thread claims 2160p");

    threadRow({ threadId: 623, forum: "1080p", tags: ["1080p"] });
    mapTitle(623, 121);

    const chosen = chosenOf();
    await upgradePicks(chosen);
    expect(chosen.get("movie:121")?.threadId).toBe(623);
  });

  test("the better band leads the candidates", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(108, ["720p"]);

    threadRow({ threadId: 601, forum: "2160p", tags: ["2160p"], publishedAt: now() - 5 * DAY });
    mapTitle(601, 108);
    threadRow({ threadId: 602, forum: "1080p", tags: ["1080p"], publishedAt: now() - 2 * DAY });
    mapTitle(602, 108);

    const chosen = chosenOf();
    await upgradePicks(chosen);

    expect(chosen.get("movie:108")?.threadId).toBe(601);
    expect(chosen.get("movie:108")?.candidates).toEqual([601, 602]);
  });

  test("the newer thread of one band leads the candidates", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    owned(109, ["720p"]);

    threadRow({ threadId: 603, forum: "1080p", tags: ["1080p"], publishedAt: now() - 5 * DAY });
    mapTitle(603, 109);
    threadRow({ threadId: 604, forum: "1080p", tags: ["1080p"], publishedAt: now() - DAY });
    mapTitle(604, 109);

    const chosen = chosenOf();
    await upgradePicks(chosen);

    expect(chosen.get("movie:109")?.threadId).toBe(604);
    expect(chosen.get("movie:109")?.candidates).toEqual([604, 603]);
  });
});

describe("wishPicks", () => {
  test("no wish is picked before a library pass exists", async () => {
    settingRow("upgrade_auto_wish", "1");
    wishRow({ id: 1, tmdbId: 110, minRes: "1080p" });
    threadRow({ threadId: 610, forum: "1080p", tags: ["1080p"] });
    mapTitle(610, 110);

    expect(currentStand().scannedAt).toBeNull();

    const chosen = chosenOf();
    await wishPicks(chosen);
    expect(chosen.size).toBe(0);
  });
});

describe("windowFrom", () => {
  test("a look back in days starts that far back", () => {
    const since = windowFrom(30);
    expect(now() - since).toBeCloseTo(30 * DAY, -3);
  });

  test("no look back without a stored check starts at nothing", () => {
    expect(windowFrom(0)).toBe(0);
  });
});

describe("isUpgrade", () => {
  test("a 980 line film is no upgrade for the 1080 band", () => {
    expect(isUpgrade(1080, 980)).toBe(false);
  });

  test("a 980 line film is upgraded by the 2160 band", () => {
    expect(isUpgrade(2160, 980)).toBe(true);
  });

  test("a 1920x802 film is no upgrade for the 1080 band", () => {
    expect(isUpgrade(1080, 802)).toBe(false);
    expect(isUpgrade(2160, 802)).toBe(true);
  });

  test("a 720 band stand is upgraded by the 1080 band", () => {
    expect(isUpgrade(1080, 720)).toBe(true);
  });

  test("a 721 line film is no upgrade for the 1080 band", () => {
    expect(isUpgrade(1080, 721)).toBe(false);
  });
});

describe("mayPlace", () => {
  test("a file ffprobe measures nothing on does not move", () => {
    expect(mayPlace(null, 2160, null)).toBe(false);
  });

  test("a 2160 claim that measures 1080 does not move", () => {
    expect(mayPlace(1080, 2160, 1080)).toBe(false);
  });

  test("a 2160 claim that measures 2160 moves", () => {
    expect(mayPlace(2160, 2160, 1080)).toBe(true);
  });

  test("a release below what the library holds does not move", () => {
    expect(mayPlace(1080, 1080, 2160)).toBe(false);
  });

  test("a gap fill of the band the library holds moves", () => {
    expect(mayPlace(1080, 1080, 1080)).toBe(true);
  });

  test("a thread that claims no band moves on its measurement alone", () => {
    expect(mayPlace(1080, null, null)).toBe(true);
  });

  test("a file above the band its thread claims moves", () => {
    expect(mayPlace(2160, 1080, null)).toBe(true);
  });

  test("a 1040 line file reaches its 1080 claim", () => {
    expect(mayPlace(1040, 1080, null)).toBe(true);
  });

  test("a 1040 line file does not reach a 2160 claim", () => {
    expect(mayPlace(1040, 2160, null)).toBe(false);
  });

  test("a 980 line film moves over a 1040 line film of the same band", () => {
    expect(mayPlace(980, null, 1040)).toBe(true);
  });
});

describe("pickUpgrades", () => {
  test("both branches run into one list", async () => {
    settingRow("upgrade_auto_upgrade", "1");
    settingRow("upgrade_auto_wish", "1");
    owned(111, ["1080p"]);
    threadRow({ threadId: 611, forum: "2160p", tags: ["2160p"] });
    mapTitle(611, 111);

    expect(await pickUpgrades()).toHaveLength(1);
  });
});
