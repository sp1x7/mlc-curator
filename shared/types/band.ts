// The quality band: the one ladder every surface stands on.
//
// A band is a decision on top of a measurement. The board writes band names as
// tags, ffprobe measures pixels, and a scene file runs a little short of the band
// it is named after. So one height answers three questions: what band it decides
// in (`bandOf`), what a person reads (`bandLabel`), and what target asks for it
// (`minResOf`).

import type { Probe } from "./library";

/** Resolution a wish or a forum names. `none` asks for whatever is there. */
export type MinRes = "720p" | "1080p" | "2160p" | "none";

/** The targets the wish form and the wish api offer, in the order they show. */
export const MIN_RES_VALUES: MinRes[] = ["720p", "1080p", "2160p", "none"];

type Band = {
  /** Lowest measured height that falls into this band. */
  from: number;
  /** What a person reads. Scene UHD is named 2160p, qhd is named 1440p. */
  label: string;
  /** Height a decision is made with. A 1440-high encode decides as 1080. */
  decision: number;
  /** Sort weight: the highest band first. */
  rank: number;
};

// Ordered by `from`, highest band first. The bounds follow the shortfalls of scene
// files (2074, 2048, scope crops): 1920 already decides as 2160, and a height above
// 720 decides as the 1080 band. qhd keeps its own label while it decides below a
// 2160 claim.
const BANDS: Band[] = [
  { from: 1920, label: "2160p", decision: 2160, rank: 5 },
  { from: 1280, label: "1440p", decision: 1080, rank: 4 },
  { from: 721, label: "1080p", decision: 1080, rank: 3 },
  { from: 480, label: "720p", decision: 720, rank: 2 },
  { from: 1, label: "sd", decision: 480, rank: 1 },
];

/** Height of every band name the board and the wish target use. */
const HEIGHT_OF: Record<string, number> = {
  none: 0,
  sd: 480,
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "2160p": 2160,
  // The board writes 4k and uhd as their own tags.
  "4k": 2160,
  uhd: 2160,
};

// 4k and uhd stand as their own tags and dvd folds into sd, so the ladder starts at
// the top and stops at the first tag the name carries.
const TAG_LADDER = ["2160p", "4k", "uhd", "1440p", "1080p", "720p", "sd"];

// The lowest target the app asks for is 720p: a band below still needs one when
// the gap has to name a resolution.
const TARGET_OF_DECISION: Record<number, MinRes> = {
  2160: "2160p",
  1080: "1080p",
  720: "720p",
  480: "720p",
};

function band(height: number | null): Band | null {
  if (height === null) return null;
  return BANDS.find((entry) => height >= entry.from) ?? null;
}

/** Resolution a wish target asks for; `none` asks for height 0. */
export function wantedRes(min: MinRes): number {
  return HEIGHT_OF[min] ?? 0;
}

/** Resolution the tags of a scene name carry; null when the ladder comes back
    empty. */
export function tagRes(tags: string[]): number | null {
  for (const tag of TAG_LADDER) {
    if (tags.includes(tag)) return HEIGHT_OF[tag] ?? null;
  }
  return null;
}

/**
 * Height a measurement stands for. Scene UHD is cut a little short of 2160
 * (2074, 2048, scope crops), so the width decides as well: such a file is in
 * the 2160 band. The encodes stop at 3832 rather than 3840 and qhd tops out at
 * 2560, so 3200 tells them apart.
 */
export function probeRes(probe: Pick<Probe, "height" | "width">): number | null {
  const height = probe.height && probe.height > 0 ? probe.height : null;
  if (height === null) return null;
  if (height >= 1920 || (probe.width ?? 0) >= 3200) return 2160;
  return height;
}

/** Band a measured height decides in; null for an absent measurement. */
export function bandOf(height: number | null): number | null {
  return band(height)?.decision ?? null;
}

/** Name of the band a measured height falls in; "" for an absent measurement. */
export function bandLabel(height: number | null): string {
  return band(height)?.label ?? "";
}

/** Target that asks for the band a measured height falls in. */
export function minResOf(height: number | null): MinRes {
  return TARGET_OF_DECISION[bandOf(height) ?? 0] ?? "720p";
}

/** Sort weight of a band: highest band 5, an absent measurement 0. */
export function bandRank(height: number | null): number {
  return band(height)?.rank ?? 0;
}

/** Sort weight of a band name; a name off the table and `none` sort last. */
export function resRank(min: MinRes | string): number {
  return bandRank(HEIGHT_OF[min] ?? null);
}
