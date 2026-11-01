// Download routes for the browser: the ftp file list of a release, the rows of
// the Downloads window, the detail payload, and the folder plan with its move.

import { Hono } from "hono";
import { jsonBody } from "../app/json";
import { downloadFolder } from "../downloads/config";
import { releaseDetailOf } from "../downloads/detail";
import { listingOf } from "../downloads/listing";
import { organize, planFor } from "../downloads/organize";
import { isRunning, resumeDownload, rows, startDownload, stopDownload } from "../downloads/runner";
import { findDownload, removeDownload } from "../downloads/store";

export const downloadsRoute = new Hono();

// Rows of the download runner plus the folder downloads land in.
downloadsRoute.get("/", (c) => c.json({ rows: rows(), root: downloadFolder() }));

/** Lists the ftp folder of a release, the same list the boxes are drawn from;
    a failing listing carries its own status code. */
downloadsRoute.get("/files/:threadId", async (c) => {
  const answer = await listingOf(Number(c.req.param("threadId")));

  return answer.ok ? c.json(answer.listing) : c.json({ error: answer.error }, answer.status);
});

// Kicks off a run for the files of one thread. A thread with a live run gets
// 409.
downloadsRoute.post("/start", async (c) => {
  const body = (await jsonBody<{ threadId?: number; files?: string[] }>(c.req)) ?? {};
  const threadId = Number(body.threadId);

  if (!Number.isInteger(threadId) || !Array.isArray(body.files) || body.files.length === 0) {
    return c.json({ error: "threadId and files missing" }, 400);
  }

  if (isRunning(threadId)) return c.json({ error: "already running" }, 409);

  startDownload(threadId, body.files);
  return c.json({ ok: true });
});

// Halts the runner of one thread.
downloadsRoute.post("/stop/:threadId", (c) => {
  stopDownload(Number(c.req.param("threadId")));
  return c.json({ ok: true });
});

// Hands a stored entry back to the runner, 404 once the store has it gone.
downloadsRoute.post("/resume/:threadId", (c) => {
  const threadId = Number(c.req.param("threadId"));
  if (isRunning(threadId)) return c.json({ error: "already running" }, 409);

  return resumeDownload(threadId) ? c.json({ ok: true }) : c.json({ error: "no entry" }, 404);
});

/** Poster, overview, episodes and ffprobe measurements of one release, read
    from the folder of its store record. */
downloadsRoute.get("/detail/:threadId", async (c) => {
  const threadId = Number(c.req.param("threadId"));
  const record = findDownload(threadId);

  if (!record) return c.json({ error: "no entry" }, 404);

  return c.json(await releaseDetailOf(threadId, record.folder));
});

/** Reads the folder of a release and answers its plan with the organizedAt
    stamp of the last organize pass. */
downloadsRoute.get("/plan/:threadId", async (c) => {
  const found = await planFor(Number(c.req.param("threadId")));

  return found
    ? c.json({ ...found.plan, organizedAt: found.organizedAt })
    : c.json({ error: "no entry" }, 404);
});

/** Moves the checked paths of a plan and answers the counters of the pass:
    moved files, placed releases, written nfo files, images, skipped paths and
    kept leftovers. */
downloadsRoute.post("/organize", async (c) => {
  const body = (await jsonBody<{ threadId?: number; paths?: string[] }>(c.req)) ?? {};
  if (!Array.isArray(body.paths)) return c.json({ error: "paths missing" }, 400);

  const done = await organize(Number(body.threadId), body.paths);

  if (!done.ok) return c.json({ error: done.error }, done.error === "no entry" ? 404 : 400);

  return c.json({
    moved: done.moved,
    placed: done.placed,
    nfo: done.nfo,
    images: done.images,
    skipped: done.skipped,
    kept: done.kept,
  });
});

// Stops the runner and drops the stored row of one thread.
downloadsRoute.delete("/:threadId", (c) => {
  const threadId = Number(c.req.param("threadId"));
  stopDownload(threadId);
  removeDownload(threadId);
  return c.json({ ok: true });
});
