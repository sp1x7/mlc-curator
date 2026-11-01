// The resolution the app knows for one title: measured library files and the
// threads it fetched or is fetching.

import { probeRes, tagRes, wantedRes } from "@shared/types/band";
import type { MinRes, WishKind } from "@shared/types/wishlist";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { downloads, mappings, releases } from "../db/schema";
import type { LibraryIndex } from "../wishlist/library";
import { libraryKey } from "../wishlist/library";

/** The tag list of a releases.tags column; other content answers an empty list. */
function tagsOf(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

/** The film forums of the board name the band of everything listed in them. */
const FORUM_BAND: Record<string, MinRes> = {
  "720p": "720p",
  "1080p": "1080p",
  "2160p": "2160p",
};

/** Resolution of a release: the forum it stands in decides, its tags come in when
 *  the forum stays band-free. A thread of the 1080p forum with 4k in its scene name
 *  stays 1080p.
 */
export function releaseRes(subcategory: string | null, tags: string[]): number | null {
  const min = subcategory === null ? undefined : FORUM_BAND[subcategory];
  if (min !== undefined) return wantedRes(min);
  return tagRes(tags);
}

/** Threads of this title that delivered or are delivering, with their tags. */
function fetchedTagsOf(tmdbId: number): string[][] {
  const rows = db
    .select({ threadId: downloads.threadId, state: downloads.state })
    .from(downloads)
    .innerJoin(mappings, eq(mappings.threadId, downloads.threadId))
    .where(eq(mappings.tmdbId, tmdbId))
    .all()
    .filter((row) => row.state !== "error" && row.state !== "stopped");

  const tags: string[][] = [];

  for (const row of rows) {
    const release = db
      .select({ tags: releases.tags })
      .from(releases)
      .where(eq(releases.threadId, row.threadId))
      .get();

    if (release) tags.push(tagsOf(release.tags));
  }

  return tags;
}

/** Highest resolution known for one title; null while every source stays empty. */
export function titleStand(
  kind: WishKind,
  tmdbId: number,
  index: LibraryIndex,
  wants?: string[],
): number | null {
  let best: number | null = null;

  // A wants list narrows the stand to files whose episode label it names; "*"
  // opens it to every file again.
  const raise = (res: number | null, at: string | null = null): void => {
    if (
      wants?.length &&
      !wants.includes("*") &&
      !(at && wants.join(" ").toUpperCase().includes(at))
    )
      return;
    if (res !== null && res > 0 && (best === null || res > best)) best = res;
  };

  const hit = index.get(libraryKey(kind, tmdbId));

  for (const file of hit?.files ?? []) {
    if (file.probe) raise(probeRes(file.probe), file.nameInfo.episodeLabel);
  }
  for (const season of hit?.seasons.values() ?? []) {
    for (const file of season.children) {
      if (file.video && !file.sample && file.probe)
        raise(probeRes(file.probe), file.nameInfo.episodeLabel);
    }
  }

  for (const tags of fetchedTagsOf(tmdbId)) raise(tagRes(tags));

  return best;
}
