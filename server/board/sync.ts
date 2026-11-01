// Board snapshot: the forum list pages into `releases`.
//
// A list page carries id, title, url and start time of every thread, so the run
// stays off the thread pages.
//
// Every pass covers all forums: threads disappear from the board and new ones
// appear, and only a full pass tells a gone thread from a forum left out.
//
// Title lookup runs alongside the page walk on its own queue, so the walk keeps
// its pace.
//
// The walk reads the table once, folds every page into memory and writes once
// when it is through: on a spinning disk a commit per thread is what costs, and
// a `catalog.changed` per page makes the window reload the whole category.

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { publish } from "../app/events";
import { passOf } from "../app/pass";
import { db } from "../db/db";
import { mappings, releases } from "../db/schema";
import { numberSetting } from "../settings/store";
import { resolveText } from "../tmdb/resolve";
import { allForumIds, categoryOf, linksTitles, subcategoryOf } from "./forums";
import { decodeEntities, textOf } from "./html";
import { getPage } from "./http";
import { loginFromSettings } from "./login";
import { isHint, parseTitle } from "./tags";

export type SyncState = {
  running: boolean;
  forumId: number | null;
  forum: string | null;
  page: number;
  // Pages of the current forum, 0 until the first page reports the count.
  forumPages: number;
  forumsTotal: number;
  forumsDone: number;
  // Threads this run has read; a progress counter, separate from added and
  // updated.
  seen: number;
  added: number;
  updated: number;
  removed: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

function emptySync(): SyncState {
  return {
    running: false,
    forumId: null,
    forum: null,
    page: 0,
    forumPages: 0,
    forumsTotal: 0,
    forumsDone: 0,
    seen: 0,
    added: 0,
    updated: 0,
    removed: 0,
    error: null,
    startedAt: null,
    finishedAt: null,
  };
}

/** The walk over the forums: one at a time, its counters in the frame. */
const pass = passOf<SyncState>(emptySync);

export function syncState(): SyncState {
  return { ...pass.state() };
}

export type LinkState = {
  running: boolean;
  queued: number;
  processed: number;
  linked: number;
  unmatched: number;
  current: string | null;
};

const links: LinkState = {
  running: false,
  queued: 0,
  processed: 0,
  linked: 0,
  unmatched: 0,
  current: null,
};

export function linkState(): LinkState {
  return { ...links };
}

interface Thread {
  threadId: number;
  title: string;
  url: string;
  forumId: number;
  forumName: string;
  // Board time as raw text, e.g. "Heute, 20:28 Uhr".
  started: string | null;
}

const THREAD_BLOCK = /<li[^>]*id="thread_(\d+)"[^>]*>([\s\S]*?)(?=<li[^>]*id="thread_\d+"|<\/ol>)/g;
const TITLE_LINK = /<a[^>]*\bhref="([^"]+)"[^>]*\bid="thread_title_\d+"[^>]*>([\s\S]*?)<\/a>/;
const AUTHOR_LINE = /class="username[^"]*"[^>]*>([^<]+)<\/a>\s*&nbsp;-\s*&nbsp;([^<]+)</;

/**
 * Reads one forum list page: every thread block with its title link, url and
 * start time. A block whose title link is missing carries no release.
 */
export function parseForumPage(html: string, forumId: number, forumName: string | null): Thread[] {
  const found: Thread[] = [];
  THREAD_BLOCK.lastIndex = 0;

  for (;;) {
    const block = THREAD_BLOCK.exec(html);
    if (!block) break;

    const link = TITLE_LINK.exec(block[2] ?? "");
    if (!link) continue;

    const title = textOf(link[2] ?? "");
    const { name, tags } = parseTitle(title);
    // Pinned notices, rules and announcements, stay out of the table and out of
    // the seen set, so a later run deletes ones an earlier run stored.
    if (isHint(title, name, tags)) continue;

    const author = AUTHOR_LINE.exec(block[2] ?? "");
    found.push({
      threadId: Number.parseInt(block[1] ?? "", 10),
      title,
      url: decodeEntities(link[1] ?? ""),
      forumId,
      forumName: forumName ?? "",
      // The board writes "Heute,&nbsp;13:33 Uhr" with entities in place of the
      // spaces; postedAt needs the decoded text to read a time.
      started: author ? decodeEntities(author[2] ?? "").trim() : null,
    });
  }

  return found;
}

/** The forum name out of the page title, null for a page that carries one
    empty. */
function forumNameOf(html: string): string | null {
  const title = /<title>([^<]*)<\/title>/.exec(html);
  return title ? textOf(title[1] ?? "") : null;
}

// Board start time -> epoch seconds, null for a text in other words.
function postedAt(raw: string | null): number | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, " ").trim();

  // "28.08.2026, 20:28 Uhr" — single digits allowed.
  const dated = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),\s*(\d{1,2}):(\d{2})\s*Uhr$/.exec(text);
  if (dated) {
    const date = new Date(
      Number(dated[3]),
      Number(dated[2]) - 1,
      Number(dated[1]),
      Number(dated[4]),
      Number(dated[5]),
    );
    return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
  }

  // "Heute, 20:28 Uhr" / "Gestern, 20:28 Uhr"
  const relative = /^(Heute|Gestern),\s*(\d{1,2}):(\d{2})\s*Uhr$/.exec(text);
  if (relative) {
    const date = new Date();
    if (relative[1] === "Gestern") date.setDate(date.getDate() - 1);
    date.setHours(Number(relative[2]), Number(relative[3]), 0, 0);
    return Math.floor(date.getTime() / 1000);
  }

  return null;
}

function pageCountOf(html: string): number {
  const match = /Seite\s*1\s*von\s*(\d+)/.exec(html);
  return match ? Number.parseInt(match[1] ?? "1", 10) : 1;
}

// A lookup job carries title, name and tags along: during a run the row of a
// fresh thread exists only in memory, so the job brings its own fields.
type LinkJob = { threadId: number; title: string; name: string; tags: string };

// Title lookups waiting for their turn.
const linkQueue: LinkJob[] = [];
// A thread joins the queue once per pass; the set holds the id against every
// later page that shows it.
const linkQueued = new Set<number>();
// One name, one tmdb walk: the same title in 1080p and on DVD, or the same
// dead end in five threads, is answered once.
type Lookup = Awaited<ReturnType<typeof resolveText>>;
const resolved = new Map<string, Lookup>();

function queueLinks(jobs: LinkJob[]): void {
  for (const job of jobs) {
    if (linkQueued.has(job.threadId)) continue;
    linkQueued.add(job.threadId);
    linkQueue.push(job);
  }

  links.queued = linkQueue.length;
  if (linkQueue.length > 0) void drainLinks();
}

// A mapping hangs off its release row, and during a run that row is still only
// in memory, so the foreign key would turn the link away. It waits here and
// goes in with the snapshot.
const pendingMappings = new Map<number, { tmdbId: number; kind: "movie" | "tv" }>();
let snapshotOpen = false;

function storeMapping(threadId: number, tmdbId: number, kind: "movie" | "tv"): void {
  if (!snapshotOpen) {
    db.insert(mappings)
      .values({ threadId, tmdbId, kind, origin: "auto" })
      .onConflictDoNothing()
      .run();
    return;
  }

  pendingMappings.set(threadId, { tmdbId, kind });
}

// One name in, one title out; a unique hit stores its mapping, every other
// answer leaves the thread for the manual pick in the window.
async function drainLinks(): Promise<void> {
  if (links.running) return;
  links.running = true;

  while (linkQueue.length > 0) {
    const job = linkQueue.shift();
    if (job === undefined) break;
    linkQueued.delete(job.threadId);

    links.current = job.title;
    // Name plus the year from the release tags: the resolver reads the year out
    // of the text and searches it bound, which is where the chain ends early.
    const year = /year:(\d{4})/.exec(job.tags)?.[1] ?? "";
    const text = year ? `${job.name} (${year})` : job.name;

    let found = resolved.get(text);
    if (found === undefined) {
      found = await resolveText(text);
      resolved.set(text, found);
    }

    if (found && "tmdbId" in found) {
      storeMapping(job.threadId, found.tmdbId, found.kind);
      links.linked += 1;
    } else {
      links.unmatched += 1;
    }
    links.processed += 1;
    links.queued = linkQueue.length;
  }

  links.current = null;
  links.running = false;
  publish("catalog.changed", { reason: "links" });
}

// Sends every release of a title forum back through the resolver; a row that
// already carries a mapping stays out of the queue.
export function linkUnlinked(): number {
  const rows = db
    .select({
      threadId: releases.threadId,
      forumId: releases.forumId,
      title: releases.title,
      name: releases.name,
      tags: releases.tags,
    })
    .from(releases)
    .leftJoin(mappings, eq(mappings.threadId, releases.threadId))
    .where(and(isNotNull(releases.forumId), isNull(mappings.threadId)))
    .all();

  const open = rows
    .filter((row) => row.forumId !== null && linksTitles(row.forumId))
    .map((row) => ({
      threadId: row.threadId,
      title: row.title,
      name: row.name,
      tags: row.tags,
    }));

  queueLinks(open);
  return open.length;
}

// Stop the lookup: everything queued is dropped, the running title finishes.
export function stopLinking(): number {
  const left = linkQueue.length;
  linkQueue.length = 0;
  linkQueued.clear();
  links.queued = 0;
  return left;
}

type Stored = typeof releases.$inferSelect;

type Snapshot = {
  threadId: number;
  title: string;
  name: string;
  tags: string;
  category: string | null;
  subcategory: string | null;
  forumId: number | null;
  publishedAt: number | null;
  url: string;
  lastSeenAt: number;
};

/** What one run has collected and writes in a single transaction at the end. */
type Pending = { inserts: Snapshot[]; updates: Snapshot[] };

/**
 * Folds one page into the rows the run has collected; the write happens at the
 * end. Returns a lookup job for every fresh thread of a title forum.
 */
function collect(
  threads: Thread[],
  base: Map<number, Stored>,
  seen: Set<number>,
  pending: Pending,
  now: number,
): LinkJob[] {
  const fresh: LinkJob[] = [];
  // The counters of the pass that reads this page.
  const state = pass.state();

  for (const thread of threads) {
    // A thread that shows up on two pages of one forum already stands in the
    // collected rows.
    if (seen.has(thread.threadId)) continue;
    seen.add(thread.threadId);

    const { name, tags } = parseTitle(thread.title);
    const published = postedAt(thread.started);
    const category = categoryOf(thread.forumId) ?? thread.forumName;
    const subcategory = subcategoryOf(thread.forumId);
    const tagJson = JSON.stringify(tags);
    const stored = base.get(thread.threadId);

    if (!stored) {
      pending.inserts.push({
        threadId: thread.threadId,
        title: thread.title,
        name,
        tags: tagJson,
        category,
        subcategory,
        forumId: thread.forumId,
        publishedAt: published,
        url: thread.url,
        lastSeenAt: now,
      });
      state.added += 1;
      if (linksTitles(thread.forumId)) {
        fresh.push({ threadId: thread.threadId, title: thread.title, name, tags: tagJson });
      }
      continue;
    }

    // A row keeps its place while every stored field still matches the page.
    const same =
      stored.title === thread.title &&
      stored.tags === tagJson &&
      stored.category === category &&
      stored.subcategory === subcategory &&
      stored.forumId === thread.forumId &&
      stored.url === thread.url &&
      (stored.publishedAt ?? 0) === (published ?? 0);
    if (same) continue;

    pending.updates.push({
      threadId: thread.threadId,
      title: thread.title,
      name,
      tags: tagJson,
      category,
      subcategory,
      forumId: thread.forumId,
      publishedAt: published,
      url: thread.url,
      lastSeenAt: now,
    });
    state.updated += 1;
  }

  return fresh;
}

/**
 * The run's one write: new rows, changed rows, the threads every page left
 * unseen, and the links that resolved during the walk, in a single transaction.
 * The disk syncs once, and the table is either the old snapshot or the new one.
 * `lastSeenAt` rides along in the written rows, which keeps a second touch of
 * the table away. A deleted release takes its mapping with it.
 */
function write(
  pending: Pending,
  base: Map<number, Stored>,
  seen: Set<number>,
  complete: boolean,
): number {
  // An empty seen set leaves the comparison empty, so an unreachable board keeps
  // its catalogue. `mappings` hangs off `releases`, so its rows follow the
  // delete.
  const gone = seen.size > 0 && complete ? [...base.keys()].filter((id) => !seen.has(id)) : [];
  const goneSet = new Set(gone);
  const linked = [...pendingMappings].filter(([threadId]) => !goneSet.has(threadId));
  pendingMappings.clear();

  db.transaction((tx) => {
    for (const row of pending.inserts) tx.insert(releases).values(row).run();
    for (const row of pending.updates) {
      tx.update(releases).set(row).where(eq(releases.threadId, row.threadId)).run();
    }

    if (gone.length > 0) {
      tx.delete(mappings).where(inArray(mappings.threadId, gone)).run();
      tx.delete(releases).where(inArray(releases.threadId, gone)).run();
    }

    // Last, because a mapping needs its release row to exist.
    if (linked.length > 0) {
      tx.insert(mappings)
        .values(
          linked.map(([threadId, hit]) => ({
            threadId,
            tmdbId: hit.tmdbId,
            kind: hit.kind,
            origin: "auto" as const,
          })),
        )
        .onConflictDoNothing()
        .run();
    }
  });

  return gone.length;
}

function reportPage(): void {
  // Progress traffic: `catalog.changed` makes the window reload the whole
  // category, so it comes once, when the snapshot is written.
  const state = pass.state();

  publish("catalog.sync", {
    forumId: state.forumId,
    forum: state.forum,
    page: state.page,
    forumPages: state.forumPages,
    forumsDone: state.forumsDone,
    forumsTotal: state.forumsTotal,
    seen: state.seen,
    added: state.added,
    updated: state.updated,
  });
}

/** Start a snapshot. False when one is already running. */
export function startSync(): boolean {
  const forums = allForumIds();

  return pass.start(
    (state) => {
      state.forumsTotal = forums.length;
      return run(forums, state);
    },
    // The frame is closed by then: the window sees the end, the list reloads.
    (state) => {
      publish("catalog.sync", { ...state });
      publish("catalog.changed", { reason: "done" });
    },
  );
}

async function run(forums: number[], frame: SyncState): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // The diff base: one sequential read of the table up front, which keeps the
  // per-page lookups away.
  const base = new Map<number, Stored>();
  const seen = new Set<number>();
  const pending: Pending = { inserts: [], updates: [] };
  // A forum left before its last page makes the basis incomplete, and deletion
  // stays off until every forum was read to its end.
  let incomplete = false;

  snapshotOpen = true;
  try {
    const session = await loginFromSettings();
    if (!session.ok) frame.error = session.error ?? "Board-Login fehlgeschlagen";

    for (const row of db.select().from(releases).all()) base.set(row.threadId, row);

    for (const forumId of forums) {
      frame.forumId = forumId;
      frame.forum = null;

      let previous: number[] | null = null;
      // The ceiling is a settings row; a zero value lets the walk run on until
      // the page repeats or the forum ends.
      const ceiling = numberSetting("board_max_pages");

      for (let page = 1; ceiling === 0 || page <= ceiling; page += 1) {
        frame.page = page;
        const path =
          `/forumdisplay.php?${forumId}` +
          (page > 1 ? `&page=${page}` : "") +
          "&sort=threadstart&order=desc";

        const answer = await getPage(path);
        if (!answer.ok && !answer.body) {
          // A forum that stays unreachable leaves the run alive and marks the
          // delete basis incomplete.
          frame.error = answer.error ?? `HTTP ${answer.status}`;
          incomplete = true;
          break;
        }
        if (!frame.forum) frame.forum = forumNameOf(answer.body);
        if (page === 1) frame.forumPages = pageCountOf(answer.body);

        const threads = parseForumPage(answer.body, forumId, frame.forum);

        // An empty forum is reported too, else the status line sticks on the
        // last forum that had releases and the run looks stuck.
        if (threads.length === 0) {
          reportPage();
          break;
        }

        const last = frame.forumPages > 0 && page >= frame.forumPages;
        const ids = threads.map((thread) => thread.threadId);
        // The same id list twice marks the end of the forum.
        if (!last && previous && ids.join() === previous.join()) break;
        previous = ids;

        queueLinks(collect(threads, base, seen, pending, now));
        frame.seen += threads.length;

        reportPage();
        if (last) break;
      }

      frame.forumsDone += 1;
      frame.forumId = null;
      frame.page = 0;
    }

    if (incomplete) frame.error ??= "Sync unvollständig — es wurde nichts gelöscht";
  } catch (error) {
    frame.error = error instanceof Error ? error.message : String(error);
    // A walk that stopped early leaves the rest of the forums unchecked.
    incomplete = true;
  } finally {
    // Even a broken run writes what it collected; an hour of board requests
    // stays worth more than one page that came back wrong.
    try {
      frame.removed = write(pending, base, seen, !incomplete);
    } catch (error) {
      frame.error ??= error instanceof Error ? error.message : String(error);
    } finally {
      snapshotOpen = false;
    }
  }
}
