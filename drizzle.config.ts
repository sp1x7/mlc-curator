// The migration setup: the schema file to read, the folder the sql lands in, and the
// database to diff against.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/curator.db",
  },
});
