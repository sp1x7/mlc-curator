import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { settings } from "../db/schema";

export const TMDB_KEY = "tmdb_api_key";
export const TMDB_LANGUAGE = "tmdb_language";

const BASE = "https://api.themoviedb.org/3";
const _IMAGE_BASE = "https://image.tmdb.org/t/p";
// One request costs ~115 ms of network, so the gap between launches sets the
// pace: six at a time 25 ms apart is ~40 per second, the rate TMDB answers
// before it says 429.
const MAX_IN_FLIGHT = 6;
const MIN_GAP_MS = 25;
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 15_000;

export class TmdbKeyMissing extends Error {}
export class TmdbKeyRejected extends Error {}
export class TmdbUnreachable extends Error {}

// Answers live in memory only; after a restart TMDB is asked again.
const answers = new Map<string, unknown | null>();

function setting(key: string): string {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? "";
}

/** The two settings rows tmdb needs; language falls back to de-DE. */
export function readSettings(): { apiKey: string; language: string } {
  return { apiKey: setting(TMDB_KEY).trim(), language: setting(TMDB_LANGUAGE).trim() || "de-DE" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let inFlight = 0;
const waiting: (() => void)[] = [];

/** Takes a permit, waiting behind the queue while all six are in use. */
async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    waiting.push(resolve);
  });
}

// A free permit goes to whoever asked first; only an empty queue gives it back.
function release(): void {
  const next = waiting.shift();
  if (next) next();
  else inFlight -= 1;
}

// Launch slots are handed out one after another, so each parallel caller takes a
// later one.
let nextSlotAt = 0;

async function spaceOut(): Promise<void> {
  const at = Math.max(Date.now(), nextSlotAt);
  nextSlotAt = at + MIN_GAP_MS;

  const waitMs = at - Date.now();
  if (waitMs > 0) await sleep(waitMs);
}

/**
 * One request through the launch queue, with the answer cached per url. A 404
 * caches null, a 429 waits out retry_after and runs the attempt again, and a
 * second failed attempt ends the call.
 */
export async function tmdbGet(
  path: string,
  params: Record<string, string> = {},
): Promise<unknown | null> {
  const settings = readSettings();
  if (!settings.apiKey) throw new TmdbKeyMissing();

  const query = new URLSearchParams({ language: settings.language, ...params });
  const cacheKey = `${path}?${query.toString()}`;
  if (answers.has(cacheKey)) return answers.get(cacheKey) ?? null;

  const url = `${BASE}${path}?${query.toString()}&api_key=${settings.apiKey}`;

  await acquire();
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await spaceOut();

      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (error) {
        throw new TmdbUnreachable(error instanceof Error ? error.message : String(error));
      }

      if (response.status === 401) throw new TmdbKeyRejected();

      // A 404 is a real answer: the cache keeps null for that url.
      if (response.status === 404) {
        answers.set(cacheKey, null);
        return null;
      }

      // 429 waits out retry_after, then asks again inside the same permit.
      if (response.status === 429) {
        const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
        await sleep((Number(body.retry_after) || 1) * 1000);
        continue;
      }

      if (!response.ok) throw new Error(`${path} answered ${response.status}`);

      const body = await response.json().catch(() => null);
      if (body === null) throw new Error(`${path} answered without readable body`);

      answers.set(cacheKey, body);
      return body;
    }
  } finally {
    release();
  }

  throw new Error(`${path} stayed rate limited`);
}

/**
 * One exception out of tmdb turned into what a window shows: text and status. A
 * key that is absent or rejected is a settings problem, every other case is a tmdb
 * answer that stayed out. Each route that calls tmdb answers through this, so one
 * failure reads the same in every window.
 */
export function tmdbFailure(cause: unknown): {
  body: { error: string };
  status: 400 | 401 | 502;
} {
  if (cause instanceof TmdbKeyMissing)
    return { body: { error: "Kein TMDB-Schlüssel in den Einstellungen" }, status: 400 };
  if (cause instanceof TmdbKeyRejected)
    return { body: { error: "TMDB-Schlüssel abgelehnt" }, status: 401 };
  if (cause instanceof TmdbUnreachable)
    return { body: { error: `TMDB nicht erreichbar: ${cause.message}` }, status: 502 };

  return {
    body: { error: cause instanceof Error ? cause.message : String(cause) },
    status: 502,
  };
}
