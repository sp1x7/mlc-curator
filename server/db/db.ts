import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

// The sqlite file, taken from DATABASE_PATH.
const path = process.env.DATABASE_PATH ?? "data/curator.db";

const sqlite = new Database(path, { create: true });
sqlite.run("PRAGMA foreign_keys = ON");

// WAL and NORMAL together are what make "one write per snapshot" cheap on the
// media disk: a commit becomes an append and syncs once for the whole batch,
// each statement riding along. A filesystem that keeps shared memory away
// refuses WAL, and there the code picks FULL, where every commit pays the full
// sync price.
const wal = sqlite.query("PRAGMA journal_mode = WAL").get() as { journal_mode?: string } | null;
sqlite.run(
  wal?.journal_mode?.toLowerCase() === "wal"
    ? "PRAGMA synchronous = NORMAL"
    : "PRAGMA synchronous = FULL",
);

// Raw handle for the database editor: it runs sql beyond the tables of the
// schema.
export { sqlite };

export const db = drizzle(sqlite, { schema });
