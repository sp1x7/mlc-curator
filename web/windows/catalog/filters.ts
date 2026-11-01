import type { AxisKey, Release, ReleaseFilter } from "@shared/types/catalog";

// Six axes over the tags of a scene name. Values come from the tags that are
// actually present in the loaded category.
export type AxisDef = { key: AxisKey; label: string; values: string[] };

export const AXES: AxisDef[] = [
  { key: "quality", label: "Auflösung", values: ["2160p", "1080p", "720p", "sd"] },
  { key: "source", label: "Quelle", values: ["bluray", "web", "hdtv", "sd"] },
  { key: "codec", label: "Codec", values: ["x265", "x264", "legacy"] },
  { key: "audio", label: "Audio", values: ["ac3", "dts", "atmos"] },
  { key: "color", label: "Farbraum", values: ["hdr", "dv"] },
  { key: "language", label: "Sprache", values: ["de", "dual", "en"] },
];

// Tag prefixes that carry a value of their own, outside the six axes.
const INTERNAL = /^(year|s|e|group|genre):/;

/** The tags that read as content words; the year, season, episode, group and genre
    prefixes are left out. */
export function shownTags(release: Release): string[] {
  return release.tags.filter((tag) => !INTERNAL.test(tag));
}

/** For every axis the values the loaded rows really carry, in axis order. */
export function axisValues(rows: Release[]): Record<AxisKey, string[]> {
  const present = new Set<string>();
  for (const row of rows) for (const tag of row.tags) present.add(tag);

  const out = {} as Record<AxisKey, string[]>;
  for (const axis of AXES) out[axis.key] = axis.values.filter((value) => present.has(value));
  return out;
}

// A release passes when it carries every chosen value of every chosen axis.
export function matches(release: Release, filter: ReleaseFilter): boolean {
  return AXES.every((axis) => {
    const wanted = filter[axis.key];
    if (!wanted || wanted.length === 0) return true;
    return wanted.every((value) => release.tags.includes(value));
  });
}

/** Number of values set over all axes; the filter button prints it. */
export function activeCount(filter: ReleaseFilter): number {
  return AXES.reduce((sum, axis) => sum + (filter[axis.key]?.length ?? 0), 0);
}
