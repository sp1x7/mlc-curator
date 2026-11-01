// One upgrade check: the releases the pick selects go through the same domain
// functions the windows drive, one release after the other. The pass calls domain
// functions alone, so an endpoint that changes shape leaves the pass alone.

import { bandLabel, bandOf, probeRes } from "@shared/types/band";
import type { DownloadPlan } from "@shared/types/downloads";
import type { LibraryFile } from "@shared/types/library";
import { and, eq, isNull } from "drizzle-orm";
import { fetchAccess } from "../board/info";
import { linkUnlinked } from "../board/sync";
import { db } from "../db/db";
import { downloads, releases } from "../db/schema";
import { ftpPaths } from "../downloads/listing";
import { mappingOf, organize, planFor } from "../downloads/organize";
import { accessOf, startDownload } from "../downloads/runner";
import { findDownload, setState } from "../downloads/store";
import { currentStand } from "../library/stand";
import { UPGRADE_LAST_CHECK_AT, UPGRADES_ENABLED } from "../settings/keys";
import { on, writeSetting } from "../settings/store";
import { indexLibrary, libraryKey } from "../wishlist/library";
import type { Take } from "./pick";
import { tagsOf, upgradePicks, wishPicks } from "./pick";
import { releaseRes } from "./stand";

const WAIT_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** True once the release reached the plan. */
async function waitPlanned(threadId: number): Promise<boolean> {
  for (;;) {
    const record = findDownload(threadId);
    if (record?.state === "planned") return true;
    if (!record || record.state === "error" || record.state === "stopped") return false;
    await sleep(WAIT_MS);
  }
}

/** One release: info file, download, plan, move. */
async function take(threadId: number): Promise<boolean> {
  // The info file is what carries ftp host, user, pass and path. That link is
  // handed out once per session, so a release that already has access keeps it.
  if (!accessOf(threadId)) await fetchAccess(threadId);

  const files = await ftpPaths(threadId);
  if (files.length === 0) return false;

  if (!startDownload(threadId, files)) return false;
  if (!(await waitPlanned(threadId))) return false;

  return place(threadId);
}

/** Best band the measured videos reach; null when the map holds zero
    measurements. */
function measuredRes(measured: DownloadPlan["measured"]): number | null {
  let best: number | null = null;

  for (const size of Object.values(measured)) {
    const res = probeRes(size);
    if (res !== null && (best === null || res > best)) best = res;
  }

  return best;
}

/** Band the thread of this release claims through its forum and its tags. */
function claimOf(threadId: number): number | null {
  const row = db
    .select({ tags: releases.tags, subcategory: releases.subcategory })
    .from(releases)
    .where(eq(releases.threadId, threadId))
    .get();

  return row ? releaseRes(row.subcategory, tagsOf(row.tags)) : null;
}

/** Best band the library really holds for the title of this release. */
function heldRes(threadId: number, lands: string[]): number | null {
  const link = mappingOf(threadId);
  if (!link) return null;

  const hit = indexLibrary(currentStand().roots).get(libraryKey(link.kind, link.tmdbId));
  if (!hit) return null;

  let best: number | null = null;

  const seen = (file: LibraryFile): void => {
    if (!file.video || file.sample || !file.probe) return;
    if (file.nameInfo.episodeLabel !== null && !lands.some((to) => to.endsWith(file.path))) return;
    const res = probeRes(file.probe);
    if (res !== null && (best === null || res > best)) best = res;
  };

  for (const file of hit.files) seen(file);
  for (const season of hit.seasons.values()) {
    for (const file of season.children) seen(file);
  }

  return best;
}

/**
 * Whether a finished release may go into the library: ffprobe says what the files
 * carry, and that has to reach what the thread claims and what the library already
 * holds. A release with zero measurements has no basis to decide on.
 */
export function mayPlace(found: number | null, claim: number | null, held: number | null): boolean {
  const measure = bandOf(found);
  if (measure === null) return false;
  if (claim !== null && measure < (bandOf(claim) ?? 0)) return false;
  return held === null || measure >= (bandOf(held) ?? 0);
}

/** Measured band, and the band it falls below, as one line of text. */
function noteOf(found: number | null, claim: number | null, held: number | null): string {
  const measure = bandOf(found);
  const measured = measure === null ? "nothing measured" : `measured ${bandLabel(measure)}`;

  if (measure !== null && claim !== null && measure < (bandOf(claim) ?? 0)) {
    return `${measured}, thread claims ${bandLabel(claim)}`;
  }

  if (measure !== null && held !== null && measure < (bandOf(held) ?? 0)) {
    return `${measured}, library holds ${bandLabel(held)}`;
  }

  return measured;
}

/** A release that stands ready in the download folder goes to the library. */
export async function place(threadId: number): Promise<boolean> {
  const found = await planFor(threadId);
  if (!found) return false;

  const measured = measuredRes(found.plan.measured);
  const claim = claimOf(threadId);
  const held = heldRes(
    threadId,
    found.plan.entries.filter((entry) => entry.kind === "video").map((entry) => entry.to),
  );

  if (!mayPlace(measured, claim, held)) {
    setState(threadId, "stopped", noteOf(measured, claim, held));
    return false;
  }

  // The move covers what the organizer writes on top: nfo, poster, fanart.
  const paths = found.plan.entries.filter((entry) => entry.move).map((entry) => entry.from);

  if (paths.length === 0) {
    // A release whose files can be named after no library title would stand in
    // the download folder forever: the reason goes into its row.
    setState(threadId, "stopped", "nothing to move");
    return false;
  }

  // The move tells the library pass about the folders it touched, so the next
  // pick sees the release ahead of a walk over the whole library.
  return (await organize(threadId, paths)).ok;
}

/** The candidates of one title or season, best first, until one goes through. */
async function takeAll(picked: Take, taken: Set<number>): Promise<boolean> {
  for (const threadId of picked.candidates) {
    // The picks are decided before the first release starts, so both switches are
    // read again per candidate: a switch moved during the run drops every release
    // that waits to start.
    if (!on(UPGRADES_ENABLED)) return false;
    if (!on(picked.reason === "upgrade" ? "upgrade_auto_upgrade" : "upgrade_auto_wish")) {
      return false;
    }

    // A series pack fills several seasons, so one start per thread id is the
    // rule.
    if (taken.has(threadId)) continue;
    taken.add(threadId);

    if (await take(threadId)) return true;

    // A release that stands stopped or failed ends this title: the next
    // candidate would start the same download again against that outcome.
    const state = findDownload(threadId)?.state;
    if (state === "stopped" || state === "error") return false;
  }

  return false;
}

async function check(): Promise<void> {
  // Finished releases still waiting for a place come first: they hold library
  // space the pick would otherwise ask for again.
  const waiting = db
    .select({ threadId: downloads.threadId })
    .from(downloads)
    .where(and(eq(downloads.state, "planned"), isNull(downloads.organizedAt)))
    .all();

  for (const row of waiting) {
    if (!on(UPGRADES_ENABLED)) return;
    await place(row.threadId);
  }

  // Releases the link pass has yet to reach lack a tmdb row and stay out of the
  // pick, so the existing pass runs first.
  linkUnlinked();

  const chosen = new Map<string, Take>();

  await upgradePicks(chosen);
  await wishPicks(chosen);

  // Every title or season goes on its own: the runner keeps the releases apart
  // and the job slots of the download area set how many run at once.
  const taken = new Set<number>();
  await Promise.all(Array.from(chosen.values(), (picked) => takeAll(picked, taken)));
}

/** Starts a check; the downloads of the releases it takes run one after the other. */
export function startUpgradeCheck(): boolean {
  if (!on(UPGRADES_ENABLED)) return false;

  const stamp = Math.floor(Date.now() / 1000);

  void check().catch((cause: unknown) => {
    console.error("upgrades", cause instanceof Error ? cause.message : cause);
  });

  writeSetting(UPGRADE_LAST_CHECK_AT, String(stamp));

  return true;
}
