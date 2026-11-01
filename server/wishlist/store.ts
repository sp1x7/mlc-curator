// The wish list's own rows: what a wish is, and the three writes a window makes.
// Each write publishes wishlist.changed, so every entry point leaves the same event
// behind.

import { MIN_RES_VALUES } from "@shared/types/band";
import type { AudioMode, HdrMode, MinRes, WishKind } from "@shared/types/wishlist";
import { and, eq } from "drizzle-orm";
import { publish } from "../app/events";
import { db } from "../db/db";
import { wishes } from "../db/schema";

export type WishRow = typeof wishes.$inferSelect;

/** The words the three pickers of a wish offer; a word outside them leaves the
 *  target empty. */
const RES: readonly MinRes[] = MIN_RES_VALUES;
const HDR: readonly HdrMode[] = ["any", "only", "never"];
const AUDIO: readonly AudioMode[] = ["any", "ger", "orig"];

/** One of the allowed words, null for every other value, an absent one included. */
function mode<T>(value: unknown, allowed: readonly unknown[]): T | null {
  return typeof value === "string" && allowed.includes(value) ? (value as T) : null;
}

/** A wish as a window sends it: the target falls back to the plain defaults. */
export type WishInput = {
  tmdbId: number;
  kind: WishKind;
  minRes: unknown;
  hdr: unknown;
  audio: unknown;
  note?: string | null;
};

/** The row of one title on the list, null for a title that stays off it. */
export function wishOf(tmdbId: number, kind: WishKind): WishRow | null {
  return (
    db
      .select()
      .from(wishes)
      .where(and(eq(wishes.tmdbId, tmdbId), eq(wishes.kind, kind)))
      .get() ?? null
  );
}

/**
 * Puts a title on the list. A title that is already there keeps the target it was
 * given, and the answer says so.
 */
export function addWish(input: WishInput): { ok: true; exists: boolean } {
  if (wishOf(input.tmdbId, input.kind) !== null) return { ok: true, exists: true };

  db.insert(wishes)
    .values({
      tmdbId: input.tmdbId,
      kind: input.kind,
      minRes: mode<MinRes>(input.minRes, RES) ?? "1080p",
      hdr: mode<HdrMode>(input.hdr, HDR) ?? "any",
      audio: mode<AudioMode>(input.audio, AUDIO) ?? "any",
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .run();

  publish("wishlist.changed", { tmdbId: input.tmdbId, kind: input.kind, action: "add" });

  return { ok: true, exists: false };
}

/**
 * Writes the target of one row. A word outside the pickers returns false, and the
 * row stands as it was: half a target stays unwritten.
 */
export function setTarget(
  id: number,
  target: { minRes: unknown; hdr: unknown; audio: unknown; note?: string | null },
): boolean {
  const minRes = mode<MinRes>(target.minRes, RES);
  const hdr = mode<HdrMode>(target.hdr, HDR);
  const audio = mode<AudioMode>(target.audio, AUDIO);
  if (!minRes || !hdr || !audio) return false;

  db.update(wishes)
    .set({ minRes, hdr, audio, note: target.note?.trim() ? target.note.trim() : null })
    .where(eq(wishes.id, id))
    .run();

  publish("wishlist.changed", { id, action: "target" });

  return true;
}

/** Takes one row off the list. */
export function removeWish(id: number): void {
  db.delete(wishes).where(eq(wishes.id, id)).run();
  publish("wishlist.changed", { id, action: "remove" });
}
