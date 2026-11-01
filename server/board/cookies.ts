// Cookie jar for board access.
//
// The board hands out its "mlc" cookie through javascript: and answers a
// meta-refresh page to a request whose cookie is absent or stale. Solving that
// challenge happens where pages are fetched; the jar keeps names and values.
//
// One settings row per board cookie, named `board_cookie_<cookie name>`.

import { eq, like } from "drizzle-orm";
import { db } from "../db/db";
import { settings } from "../db/schema";

export const BOARD = "https://mlcboard.com/forum";
/** One settings row per cookie: `board_cookie_<cookie name>`. */
export const COOKIE_PREFIX = "board_cookie_";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Matches the createCookie call of the meta-refresh page and captures its hex
// value.
export const CHALLENGE_RE = /createCookie\(\s*"mlc"\s*,\s*"([0-9a-f]+)"/;

const jar = new Map<string, string>();
let loaded = false;

// Joins the jar into one Cookie header line.
function asHeader(map: Map<string, string>): string {
  return [...map].map(([name, value]) => `${name}=${value}`).join("; ");
}

// Pulls every board_cookie_ row into the jar, once per process.
function load(): void {
  if (loaded) return;
  loaded = true;
  const stored = db
    .select()
    .from(settings)
    .where(like(settings.key, `${COOKIE_PREFIX}%`))
    .all();
  for (const row of stored) jar.set(row.key.slice(COOKIE_PREFIX.length), row.value);
}

// Writes one cookie row, insert or update on the key.
function store(name: string, value: string): void {
  db.insert(settings)
    .values({ key: `${COOKIE_PREFIX}${name}`, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

// Deletes one cookie row.
function forget(name: string): void {
  db.delete(settings)
    .where(eq(settings.key, `${COOKIE_PREFIX}${name}`))
    .run();
}

// The jar as one header string, ready for a board request.
export function cookieHeader(): string {
  load();
  return asHeader(jar);
}

// True once the jar carries a cookie.
export function cookieSet(): boolean {
  load();
  return jar.size > 0;
}

// Adds one cookie to jar and settings; an equal value leaves the row alone.
export function setBoardCookie(name: string, value: string): void {
  load();
  if (jar.get(name) === value) return;
  jar.set(name, value);
  store(name, value);
}

// Empties jar and settings rows, and marks the jar as loaded so the next read
// stays empty.
export function clearSession(): void {
  jar.clear();
  loaded = true;
  db.delete(settings)
    .where(like(settings.key, `${COOKIE_PREFIX}%`))
    .run();
}

// Takes the Set-Cookie answers of the board into the jar and reports the cookie
// names it touched. An empty value or an epoch expires date drops the entry
// from jar and settings.
export function cookiesFromResponse(response: Response): string[] {
  const touched: string[] = [];

  for (const line of response.headers.getSetCookie()) {
    const end = line.indexOf(";");
    const pair = (end >= 0 ? line.slice(0, end) : line).trim();
    const at = pair.indexOf("=");
    if (at <= 0) continue;

    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1);
    touched.push(name);

    const expired = value === "" || /expires=Thu,\s*01 Jan 1970/i.test(line);
    if (expired) {
      if (jar.delete(name)) forget(name);
    } else {
      setBoardCookie(name, value);
    }
  }

  return touched;
}
