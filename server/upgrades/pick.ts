// Which releases a check takes: one above the stand of a title the app owns, and
// one for a wish whose target the library still falls short of.

import { bandOf, minResOf, tagRes } from "@shared/types/band";
import type { LibraryFile } from "@shared/types/library";
import type { WishTarget } from "@shared/types/wishlist";
import { and, eq, gte, isNull, or } from "drizzle-orm";
import { db } from "../db/db";
import { downloads, mappings, releases } from "../db/schema";
import { findDownload } from "../downloads/store";
import { currentStand } from "../library/stand";
import { UPGRADE_LAST_CHECK_AT, UPGRADE_LOOKBACK_DAYS } from "../settings/keys";
import { numberSetting, on, setting } from "../settings/store";
import { season as fetchSeason, storedSeasons } from "../tmdb/title";
import { buildWishes, coveredOf, identityFor } from "../wishlist/evaluate";
import { indexLibrary, type LibraryHit, type LibraryIndex } from "../wishlist/library";
import { resCheck } from "../wishlist/target";
import { releaseRes, titleStand } from "./stand";

export type Take = {
  // Best candidate first; the first one the board lets through wins.
  candidates: number[];
  threadId: number;
  tmdbId: number;
  kind: "movie" | "tv";
  res: number;
  publishedAt: number | null;
  reason: "upgrade" | "wish";
};

export function tagsOf(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

/** Days a check looks back while the settings row stays empty; the Settings window
    starts at the same number. */
const LOOKBACK_DAYS = 30;

/** Seconds since the epoch the window starts at; 0 look back = last check. */
export function windowFrom(days: number): number {
  if (days > 0) return Math.floor(Date.now() / 1000) - days * 86_400;
  return Number.parseInt(setting(UPGRADE_LAST_CHECK_AT), 10) || 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function episodeKey(season: number, episode: number): string {
  return `S${pad(season)}E${pad(episode)}`;
}

/** True when a claimed band stands above the band a title already holds. */
export function isUpgrade(res: number, stand: number): boolean {
  return res > (bandOf(stand) ?? 0);
}

/** The episodes one library title holds. */
function heldEpisodes(hit: LibraryHit): Set<string> {
  const held = new Set<string>();

  const add = (file: LibraryFile): void => {
    if (!file.video || file.sample || !file.episode) return;
    held.add(episodeKey(file.episode.season, file.episode.number));
  };

  for (const file of hit.files) add(file);
  for (const season of hit.seasons.values()) {
    for (const file of season.children) add(file);
  }

  return held;
}

/** tmdb episode counts per season; a season nobody fetched yet is pulled once. */
async function expectedOf(tmdbId: number, total: number): Promise<Map<number, number>> {
  const known = new Set(storedSeasons(tmdbId).map((row) => row.seasonNumber));

  for (let number = 1; number <= total; number += 1) {
    if (known.has(number)) continue;
    try {
      await fetchSeason(tmdbId, number);
    } catch {
      // tmdb answers an empty season: the season keeps an episode count of zero.
    }
  }

  const expected = new Map<number, number>();
  for (const row of storedSeasons(tmdbId)) {
    if (row.seasonNumber > 0) expected.set(row.seasonNumber, row.episodeCount);
  }

  return expected;
}

/** One entry per title or per missing season, its candidates best first. */
function keep(chosen: Map<string, Take>, take: Omit<Take, "candidates">, unit?: string): void {
  const key = unit ?? `${take.kind}:${take.tmdbId}`;
  const held = chosen.get(key);

  if (!held) {
    chosen.set(key, { ...take, candidates: [take.threadId] });
    return;
  }

  if (
    held.res > take.res ||
    (held.res === take.res && (held.publishedAt ?? 0) >= (take.publishedAt ?? 0))
  ) {
    held.candidates.push(take.threadId);
    return;
  }

  held.candidates.unshift(take.threadId);
  held.threadId = take.threadId;
  held.res = take.res;
  held.publishedAt = take.publishedAt;
}

/** The band a stopped row names as claimed above its measurement. */
const DISPROVEN = /measured \d+p, thread claims (\d+)p/;

/** Bands of this title that a stopped download already measured below. */
function disproven(tmdbId: number): Set<number> {
  const out = new Set<number>();

  const rows = db
    .select({ note: downloads.note })
    .from(downloads)
    .innerJoin(mappings, eq(mappings.threadId, downloads.threadId))
    .where(eq(mappings.tmdbId, tmdbId))
    .all();

  for (const row of rows) {
    const whole = DISPROVEN.exec(row.note ?? "");
    if (whole) out.add(Number(whole[1]));
  }

  return out;
}

export async function pickUpgrades(): Promise<Take[]> {
  const chosen = new Map<string, Take>();
  await upgradePicks(chosen);
  await wishPicks(chosen);
  return [...chosen.values()];
}

/** Releases above the stand of a title the app owns, inside the look back. */
export async function upgradePicks(chosen: Map<string, Take>): Promise<void> {
  const since = windowFrom(numberSetting(UPGRADE_LOOKBACK_DAYS, LOOKBACK_DAYS));
  const index = indexLibrary(currentStand().roots);

  const rows = db
    .select({
      threadId: releases.threadId,
      tags: releases.tags,
      subcategory: releases.subcategory,
      publishedAt: releases.publishedAt,
      tmdbId: mappings.tmdbId,
      kind: mappings.kind,
    })
    .from(releases)
    .innerJoin(mappings, eq(mappings.threadId, releases.threadId))
    .leftJoin(downloads, eq(downloads.threadId, releases.threadId))
    .where(
      and(
        // A release whose publish date column is empty stays inside the window.
        or(isNull(releases.publishedAt), gte(releases.publishedAt, since)),
        isNull(downloads.threadId),
      ),
    )
    .all();

  if (on("upgrade_auto_upgrade")) {
    for (const row of rows) {
      const res = releaseRes(row.subcategory, tagsOf(row.tags));
      if (res === null || disproven(row.tmdbId).has(res)) continue;

      const owned = titleStand(
        row.kind,
        row.tmdbId,
        index,
        tagsOf(row.tags).filter((t) => /\dE\d/i.test(t)),
      );
      if (owned === null || !isUpgrade(res, owned)) continue;

      keep(chosen, {
        threadId: row.threadId,
        tmdbId: row.tmdbId,
        kind: row.kind,
        res,
        publishedAt: row.publishedAt,
        reason: "upgrade",
      });
    }

    await gapPicks(chosen, index);
  }
}

/** Releases of a series already in the library that cover its missing episodes. */
async function gapPicks(chosen: Map<string, Take>, index: LibraryIndex): Promise<void> {
  for (const [key, hit] of index) {
    const mark = /^tv:(\d+)$/.exec(key);
    if (!mark) continue;

    const tmdbId = Number(mark[1]);
    const identity = identityFor("tv", tmdbId);
    const expected = await expectedOf(tmdbId, identity?.numberOfSeasons ?? 0);
    const held = heldEpisodes(hit);

    const missing = new Set<string>();
    for (const [season, count] of expected) {
      for (let episode = 1; episode <= count; episode += 1) {
        const at = episodeKey(season, episode);
        if (!held.has(at)) missing.add(at);
      }
    }
    if (missing.size === 0) continue;

    // A gap takes a release at or above the stand of the title.
    const owned = titleStand("tv", tmdbId, index);
    if (owned === null) continue;

    const rows = db
      .select({
        threadId: releases.threadId,
        tags: releases.tags,
        subcategory: releases.subcategory,
        publishedAt: releases.publishedAt,
      })
      .from(releases)
      .innerJoin(mappings, eq(mappings.threadId, releases.threadId))
      .leftJoin(downloads, eq(downloads.threadId, releases.threadId))
      .where(and(eq(mappings.tmdbId, tmdbId), isNull(downloads.threadId)))
      .all();

    for (const row of rows) {
      const tags = tagsOf(row.tags);
      const covered = coveredOf("tv", tags, expected);
      const gaps = covered.keys.filter((episode) => missing.has(episode));
      if (gaps.length === 0) continue;
      const target: WishTarget = {
        minRes: minResOf(gaps.length === covered.keys.length ? 0 : owned),
        hdr: "any",
        audio: "any",
      };

      const res = releaseRes(row.subcategory, tags);
      if (res === null || disproven(tmdbId).has(res) || !resCheck(target.minRes, res, "").ok) {
        continue;
      }

      // One slot per missing episode: a season pack and a single episode release
      // both fill it, and every gap gets its own take.
      for (const at of gaps) {
        keep(
          chosen,
          {
            threadId: row.threadId,
            tmdbId,
            kind: "tv",
            res,
            publishedAt: row.publishedAt,
            reason: "upgrade",
          },
          `tv:${tmdbId}:${at}`,
        );
      }
    }
  }
}

/** Releases that fill a wish whose target the library still falls short of. */
export async function wishPicks(chosen: Map<string, Take>): Promise<void> {
  if (!on("upgrade_auto_wish")) return;

  // What a wish still needs comes from the last library pass; a process with a
  // fresh stand shows every wish as open.
  if (currentStand().scannedAt === null) return;

  for (const wish of await buildWishes()) {
    for (const match of wish.matches) {
      if (match.verdict !== "ok") continue;
      if (findDownload(match.threadId)) continue;

      const res = tagRes(match.tags);
      if (res === null) continue;

      keep(chosen, {
        threadId: match.threadId,
        tmdbId: wish.tmdbId,
        kind: wish.kind,
        res,
        publishedAt: match.publishedAt,
        reason: "wish",
      });
    }
  }
}
