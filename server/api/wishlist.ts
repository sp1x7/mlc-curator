// Wishlist api: GET /wishes answers the computed list, POST /resolve runs the
// add dialog search, and add, target plus delete write the rows. The wish rows
// and the words a target may hold live in `server/wishlist/store.ts`.

import type {
  AudioMode,
  HdrMode,
  MinRes,
  ResolveCandidate,
  WishKind,
  WishTarget,
} from "@shared/types/wishlist";
import { Hono } from "hono";
import { jsonBody } from "../app/json";
import { currentStand } from "../library/stand";
import { tmdbFailure } from "../tmdb/client";
import { resolveText } from "../tmdb/resolve";
import { buildWishes, identityFor } from "../wishlist/evaluate";
import { addWish, removeWish, setTarget } from "../wishlist/store";

export const wishlistRoute = new Hono();

// Accepts the two kind words of the schema, null for every other value.
function kindOf(value: unknown): WishKind | null {
  return value === "movie" || value === "tv" ? value : null;
}

// buildWishes computes the rows from the wish table and the library stand;
// scannedAt carries the time of the last library pass.
wishlistRoute.get("/wishes", async (c) =>
  c.json({ rows: await buildWishes(), scannedAt: currentStand().scannedAt }),
);

// One query text in: search words, a tt id or a tmdb id. The answer is a hit
// with its identity, a candidate list for the dialog, or none.
wishlistRoute.post("/resolve", async (c) => {
  const body = await jsonBody<{ query?: string }>(c.req);
  const query = body?.query?.trim();
  if (!query) return c.json({ error: "query fehlt" }, 400);

  let found: Awaited<ReturnType<typeof resolveText>>;
  try {
    found = await resolveText(query);
    // A tmdb answer that failed keeps its own body and status code.
  } catch (cause) {
    const bad = tmdbFailure(cause);
    return c.json(bad.body, bad.status);
  }

  if (!found) return c.json({ none: true });
  if (!("tmdbId" in found)) {
    // Candidates are reshaped here, so the dialog reads the fields of
    // ResolveCandidate straight off the response.
    const candidates: ResolveCandidate[] = found.candidates.map((candidate) => ({
      kind: candidate.kind,
      tmdbId: candidate.tmdbId,
      title: candidate.title,
      originalTitle: candidate.originalTitle,
      year: candidate.year,
      posterPath: candidate.posterPath,
      voteCount: candidate.voteCount,
    }));
    return c.json({ candidates });
  }

  // identityFor reads title, year and poster of a hit from the local title
  // tables before the row is written.
  const identity = identityFor(found.kind, found.tmdbId);
  if (!identity) return c.json({ none: true });

  return c.json({ hit: { kind: found.kind, tmdbId: found.tmdbId, ...identity } });
});

// addWish returns the row after the write, and a title already on the list
// keeps the target it has.
wishlistRoute.post("/add", async (c) => {
  const body = await jsonBody<{
    tmdbId?: number;
    kind?: string;
    minRes?: MinRes;
    hdr?: HdrMode;
    audio?: AudioMode;
    note?: string | null;
  }>(c.req);

  const tmdbId = Number(body?.tmdbId);
  const kind = kindOf(body?.kind);
  if (!Number.isFinite(tmdbId) || kind === null) return c.json({ error: "Titel fehlt" }, 400);

  return c.json(
    addWish({
      tmdbId,
      kind,
      minRes: body?.minRes,
      hdr: body?.hdr,
      audio: body?.audio,
      note: body?.note,
    }),
  );
});

// Writes the target of one wish. setTarget returns false when the target
// fields fall short, which comes back as 400.
wishlistRoute.put("/target/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "id fehlt" }, 400);

  const body = await jsonBody<WishTarget & { note?: string | null }>(c.req);
  if (!body) return c.json({ error: "Ziel unvollständig" }, 400);

  const taken = setTarget(id, body);

  return taken ? c.json({ ok: true }) : c.json({ error: "Ziel unvollständig" }, 400);
});

// Drops one wish row by id.
wishlistRoute.delete("/wish/:id", (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "id fehlt" }, 400);

  removeWish(id);

  return c.json({ ok: true });
});
