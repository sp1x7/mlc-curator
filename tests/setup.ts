// Preload for `bun test`: an empty database in memory, built from the migration
// files, so a test opens data/curator.db zero times.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

process.env.DATABASE_PATH = ":memory:";

const READY = Symbol.for("mlc.test.database");
const scope = globalThis as typeof globalThis & Record<symbol, boolean | undefined>;

if (!scope[READY]) {
  scope[READY] = true;

  const { sqlite } = await import("../server/db/db");

  for (const file of readdirSync("drizzle")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    sqlite.run(readFileSync(join("drizzle", file), "utf8"));
  }
}

/**
 * Empties every table a test writes into and forgets the library pass. The stand
 * lives in memory, a table holds zero copies of it, so a pass of the file before
 * would otherwise answer "library seen" to a test that wants an empty library.
 */
export async function clearTables(): Promise<void> {
  // Imported here: the db module opens its file at load, so the in-memory path
  // above has to stand first.
  const { db } = await import("../server/db/db");
  const { resetStand } = await import("../server/library/stand");
  const { downloads, mappings, releases, settings, tmdbMovies, tmdbSeries, wishes } = await import(
    "../server/db/schema"
  );

  for (const table of [downloads, mappings, releases, wishes, settings, tmdbMovies, tmdbSeries]) {
    db.delete(table).run();
  }

  resetStand();
}
