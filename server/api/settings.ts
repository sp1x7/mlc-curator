// Settings api: the stored value of every key the Settings window edits, plus
// the board session, the run triggers and the folder picker levels.

import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Hono } from "hono";
import { publish } from "../app/events";
import { jsonBody } from "../app/json";
import { clearSession } from "../board/cookies";
import { loginFromSettings, sessionState } from "../board/login";
import { startSync, syncState } from "../board/sync";
import { currentStand, scanRunning, startScan } from "../library/stand";
import { snapshot, writeSettings } from "../settings/store";
import { startUpgradeCheck } from "../upgrades/run";

export const settingsRoute = new Hono();

settingsRoute.get("/", (c) => c.json(snapshot()));

/**
 * One save carries a whole area: a flat object of key to text. Keys outside the
 * field map are skipped, a secret sent as an empty string keeps its row, and
 * every other key is written as it arrived. The keys that changed go out on the
 * settings.changed event.
 */
settingsRoute.put("/", async (c) => {
  const body = await jsonBody<{ values?: unknown }>(c.req);
  const incoming = body?.values;
  if (!incoming || typeof incoming !== "object") return c.json({ error: "values missing" }, 400);

  const written = writeSettings(incoming as Record<string, unknown>);

  if (written.length > 0) publish("settings.changed", { keys: written });

  return c.json(snapshot());
});

/** Reports the stored user, the state of the session cookies and the state of
    the stored password. */
settingsRoute.get("/session", (c) => c.json(sessionState()));

/** Sign in with the stored user and the stored password. */
settingsRoute.post("/session/login", async (c) => {
  const result = await loginFromSettings();
  if (!result.ok) return c.json({ error: result.error ?? "board login failed" }, 502);
  return c.json({ ok: true });
});

/** Clears every stored session cookie. */
settingsRoute.post("/session/logout", (c) => {
  clearSession();
  return c.json({ ok: true });
});

/** State of the last snapshot run. */
settingsRoute.get("/board/sync", (c) => c.json({ sync: syncState() }));

// Starts a snapshot run; a live run answers 409, so a second press stays idle.
settingsRoute.post("/board/sync", (c) => {
  if (!startSync()) return c.json({ error: "a sync is already running" }, 409);
  return c.json({ sync: syncState() });
});

/** The current library stand. */
settingsRoute.get("/library/scan", (c) => c.json({ stand: currentStand() }));

// Starts a library pass; a live scan answers 409, so a second press stays idle.
settingsRoute.post("/library/scan", (c) => {
  if (scanRunning()) return c.json({ error: "a scan is already running" }, 409);
  startScan();
  return c.json({ stand: currentStand() });
});

/** One upgrade check; a disabled upgrade switch answers 409. */
settingsRoute.post("/upgrade/check", (c) =>
  startUpgradeCheck() ? c.json({ ok: true }) : c.json({ error: "upgrades are off" }, 409),
);

/**
 * One level for the folder picker: the path itself, its parent for walking
 * back up, and the directories inside it, sorted by name. A relative query
 * falls back to the root, symbolic links join the list once their target is a
 * directory, and a failing read answers the level with an empty list.
 */
settingsRoute.get("/fs", async (c) => {
  const asked = c.req.query("path") ?? "/";
  const folder = resolve(asked.startsWith("/") ? asked : "/");

  const dirs: string[] = [];

  try {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        dirs.push(entry.name);
        continue;
      }
      if (!entry.isSymbolicLink()) continue;
      const target = await stat(join(folder, entry.name)).catch(() => null);
      if (target?.isDirectory()) dirs.push(entry.name);
    }
  } catch {
    return c.json({ path: folder, parent: folder === "/" ? null : dirname(folder), dirs: [] });
  }

  dirs.sort((a, b) => a.localeCompare(b, "en"));

  return c.json({ path: folder, parent: folder === "/" ? null : dirname(folder), dirs });
});
