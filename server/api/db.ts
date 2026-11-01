// /api/db/* — raw table access for the DB editor: one route per statement
// kind over any table of the schema.
//
// Domain checks live in the calling windows; `server/db/raw.ts` matches every
// table and column name against the schema before it builds sql.

import type { CellValue } from "@shared/types/db";
import { Hono } from "hono";
import { jsonBody } from "../app/json";
import { deleteRows, insertRow, rowsOf, tablesInfo, updateRow } from "../db/raw";

type Body = Record<string, unknown>;

// Turns a thrown cause into a 400 answer carrying the message text.
function bad(c: { json: (data: unknown, status?: number) => Response }, cause: unknown): Response {
  const message = cause instanceof Error ? cause.message : String(cause);
  return c.json({ error: message }, 400);
}

export const dbRoute = new Hono();

// Table list with their columns, straight from the schema.
dbRoute.get("/tables", (c) => c.json({ tables: tablesInfo() }));

// One table dump. The such query term reaches rowsOf, which filters every
// column of the table over it.
dbRoute.get("/tables/:name/rows", (c) => {
  try {
    const search = (c.req.query("such") ?? "").trim();
    return c.json(rowsOf(c.req.param("name"), search));
  } catch (cause) {
    return bad(c, cause);
  }
});

// Adds one row from the json body, column names taken as they arrive.
dbRoute.post("/tables/:name/rows", async (c) => {
  try {
    const body = await jsonBody<Body>(c.req);
    if (!body) return c.json({ error: "no body" }, 400);

    insertRow(c.req.param("name"), body);
    return c.json({ ok: true });
  } catch (cause) {
    return bad(c, cause);
  }
});

// Rewrites the row addressed by the pk field of the body with the values map.
dbRoute.put("/tables/:name/rows", async (c) => {
  try {
    const body = await jsonBody<{ pk?: CellValue; values?: Body }>(c.req);
    if (!body) return c.json({ error: "no body" }, 400);

    updateRow(c.req.param("name"), body.pk ?? null, body.values ?? {});
    return c.json({ ok: true });
  } catch (cause) {
    return bad(c, cause);
  }
});

// Drops every row listed in the pks array of the body.
dbRoute.delete("/tables/:name/rows", async (c) => {
  try {
    const body = (await jsonBody<{ pks?: CellValue[] }>(c.req)) ?? {};
    deleteRows(c.req.param("name"), body.pks ?? []);
    return c.json({ ok: true });
  } catch (cause) {
    return bad(c, cause);
  }
});
