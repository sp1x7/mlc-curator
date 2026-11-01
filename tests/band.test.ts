// The band ladder: the tags of a scene name, the measurement of a file, the band a
// height decides in, the word shown for it, the target that asks for it, and the
// order the sort follows.

import { describe, expect, test } from "bun:test";
import {
  bandLabel,
  bandOf,
  bandRank,
  MIN_RES_VALUES,
  minResOf,
  probeRes,
  resRank,
  tagRes,
  wantedRes,
} from "@shared/types/band";
import type { Probe } from "@shared/types/library";

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

describe("wantedRes", () => {
  test("a target names the height of its band", () => {
    expect(wantedRes("720p")).toBe(720);
    expect(wantedRes("1080p")).toBe(1080);
    expect(wantedRes("2160p")).toBe(2160);
  });

  test("`none` asks for no height", () => {
    expect(wantedRes("none")).toBe(0);
  });
});

describe("tagRes", () => {
  test("the board writes 4k and uhd as their own tags", () => {
    expect(tagRes(["uhd", "hevc"])).toBe(2160);
    expect(tagRes(["4k"])).toBe(2160);
    expect(tagRes(["1080p"])).toBe(1080);
    expect(tagRes(["720p"])).toBe(720);
  });

  test("the highest tag named wins", () => {
    expect(tagRes(["720p", "1080p"])).toBe(1080);
    expect(tagRes(["sd", "720p"])).toBe(720);
  });

  test("no resolution tag is no resolution", () => {
    expect(tagRes(["x264", "ger"])).toBeNull();
    expect(tagRes([])).toBeNull();
  });
});

describe("probeRes", () => {
  test("a uhd file measures 2160", () => {
    expect(probeRes(probe(3840, 2160))).toBe(2160);
  });

  test("a full height of 1920 lines is uhd, not 1080", () => {
    expect(probeRes(probe(1920, 1920))).toBe(2160);
  });

  test("a 3840 wide file is uhd whatever its height says", () => {
    expect(probeRes(probe(3840, 1606))).toBe(2160);
  });

  test("a uhd scope crop 8 lines short of 3840 is uhd too", () => {
    // A dolby vision web encode: 3832 wide, 1592 lines after the scope crop.
    expect(probeRes(probe(3832, 1592))).toBe(2160);
    expect(probeRes(probe(3832, 1440))).toBe(2160);
  });

  test("a qhd file is never read as uhd", () => {
    expect(probeRes(probe(2560, 1440))).toBe(1440);
  });

  test("a 1080 file stays 1080", () => {
    expect(probeRes(probe(1920, 1080))).toBe(1080);
  });

  test("nothing measured is no resolution", () => {
    expect(probeRes(probe(null, null))).toBeNull();
    expect(probeRes(probe(0, 0))).toBeNull();
  });
});

describe("bandOf", () => {
  test("a scene file that runs below its band name keeps the band", () => {
    expect(bandOf(1080)).toBe(1080);
    expect(bandOf(1040)).toBe(1080);
    expect(bandOf(980)).toBe(1080);
    expect(bandOf(802)).toBe(1080);
    expect(bandOf(721)).toBe(1080);
  });

  test("720 lines and below down to dvd is the 720 band", () => {
    expect(bandOf(720)).toBe(720);
    expect(bandOf(576)).toBe(720);
    expect(bandOf(480)).toBe(720);
    expect(bandOf(479)).toBe(480);
  });

  test("1920 lines and up is the 2160 band", () => {
    expect(bandOf(1920)).toBe(2160);
    expect(bandOf(2160)).toBe(2160);
    expect(bandOf(null)).toBeNull();
  });

  test("qhd is shown as itself but decides one band below", () => {
    // The stop of a qhd encode under a 2160 claim depends on this.
    expect(bandOf(1440)).toBe(1080);
    expect(bandLabel(1440)).toBe("1440p");
  });
});

describe("bandLabel", () => {
  test("a band is named as the scene names it", () => {
    expect(bandLabel(2160)).toBe("2160p");
    expect(bandLabel(2074)).toBe("2160p");
    expect(bandLabel(1080)).toBe("1080p");
    expect(bandLabel(576)).toBe("720p");
    expect(bandLabel(479)).toBe("sd");
  });

  test("nothing measured has no word", () => {
    expect(bandLabel(null)).toBe("");
  });
});

describe("minResOf", () => {
  test("the target of a band asks for that band", () => {
    expect(minResOf(2160)).toBe("2160p");
    expect(minResOf(1080)).toBe("1080p");
    expect(minResOf(720)).toBe("720p");
  });

  test("the lowest target is taken when nothing reaches it", () => {
    expect(minResOf(480)).toBe("720p");
    expect(minResOf(null)).toBe("720p");
    expect(minResOf(0)).toBe("720p");
  });

  test("every target the ladder names is one the form offers", () => {
    for (const height of [2160, 1440, 1080, 720, 480]) {
      expect(MIN_RES_VALUES).toContain(minResOf(height));
    }
  });
});

describe("resRank", () => {
  test("a higher band sorts before a lower one", () => {
    const sorted = ["720p", "2160p", "none", "1080p", "1440p"].sort(
      (a, b) => resRank(b) - resRank(a),
    );
    expect(sorted).toEqual(["2160p", "1440p", "1080p", "720p", "none"]);
  });

  test("a measured height nobody banded sorts last", () => {
    expect(resRank("2074p")).toBe(0);
    expect(bandRank(null)).toBe(0);
  });
});
