// Tmdb api: the key and language row, plus one text lookup through resolveText.

import type { TmdbSettings, TmdbSettingsPatch } from "@shared/types/tmdb";
import { Hono } from "hono";
import { jsonBody } from "../app/json";
import { TMDB_KEY, TMDB_LANGUAGE } from "../settings/keys";
import { writeSettings } from "../settings/store";
import { readSettings, tmdbFailure } from "../tmdb/client";
import { resolveText } from "../tmdb/resolve";

export const tmdbRoute = new Hono();

// Reads the settings row and answers key presence plus language; the key text
// itself stays server side.
tmdbRoute.get("/settings", (c) => {
  const { apiKey, language } = readSettings();
  const answer: TmdbSettings = { keySet: apiKey !== "", language };

  return c.json(answer);
});

tmdbRoute.put("/settings", async (c) => {
  const body = await jsonBody<TmdbSettingsPatch>(c.req);
  const values: Record<string, string> = {};

  // The window sends the key it shows; an empty text leaves the row alone.
  if (typeof body?.apiKey === "string" && body.apiKey.trim() !== "")
    values[TMDB_KEY] = body.apiKey.trim();
  if (typeof body?.language === "string") values[TMDB_LANGUAGE] = body.language.trim();

  writeSettings(values);

  return c.json({ ok: true });
});

// The text is a catalog name or a library path. resolveText answers a unique
// hit with its id, or the candidate list for the browser to pick from.
tmdbRoute.get("/resolve", async (c) => {
  const text = c.req.query("name")?.trim() ?? "";
  if (!text) return c.json({ error: "name missing" }, 400);

  try {
    return c.json(await resolveText(text));
    // A tmdb answer that failed lands here, and its body plus status code go
    // straight to the browser.
  } catch (cause) {
    const bad = tmdbFailure(cause);
    return c.json(bad.body, bad.status);
  }
});
