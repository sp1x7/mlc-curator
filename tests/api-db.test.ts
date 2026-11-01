// The DB editor over the live schema: the tables it lists, the columns a write
// accepts, and the answer of a table outside the schema or a body of broken json.

import { beforeEach, describe, expect, test } from "bun:test";
import { api } from "../server/app/app";
import { wishRow } from "./rows";
import { clearTables } from "./setup";

/** The json an endpoint answers with, read as the cells the editor shows. */
type Answer = { status: number; body: Record<string, unknown> };

/** One request against the api, the answer read as status and json. */
async function call(
  path: string,
  init?: { method?: string; body?: unknown | string },
): Promise<Answer> {
  // A body that is already a string goes out as it is: that is the broken one.
  const sent = init?.body;
  const text =
    sent === undefined ? undefined : typeof sent === "string" ? sent : JSON.stringify(sent);

  const response = await api.request(path, {
    method: init?.method ?? "GET",
    headers: text === undefined ? undefined : { "content-type": "application/json" },
    body: text,
  });

  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** The rows of an answer, and the first one; the tables here hold one or two. */
function rowsOf(body: Record<string, unknown>): Record<string, unknown>[] {
  const rows = (body.rows ?? []) as Record<string, unknown>[];

  return rows;
}

/** The entry of one table in the table list. */
function tableOf(answer: Answer, name: string) {
  const tables = answer.body.tables as { name: string; count: number }[];

  return tables.find((table) => table.name === name);
}

beforeEach(async () => {
  await clearTables();
});

describe("GET /db/tables", () => {
  test("the tables of the schema are listed with their columns", async () => {
    const answer = await call("/db/tables");
    const names = (answer.body.tables as { name: string }[]).map((table) => table.name);

    expect(answer.status).toBe(200);
    expect(names).toContain("wishes");
    expect(names).toContain("downloads");
  });

  test("a table is listed with the number of its rows", async () => {
    wishRow({ id: 1, tmdbId: 100 });

    expect(tableOf(await call("/db/tables"), "wishes")?.count).toBe(1);
  });
});

describe("GET /db/tables/:name/rows", () => {
  test("the rows of a table come back with their cells", async () => {
    wishRow({ id: 2, tmdbId: 100 });

    const answer = await call("/db/tables/wishes/rows");

    expect(answer.status).toBe(200);
    expect(answer.body.total).toBe(1);
    expect(rowsOf(answer.body)[0]?.tmdb_id).toBe(100);
  });

  test("a search keeps only the rows that hold the word", async () => {
    wishRow({ id: 3, tmdbId: 100 });
    wishRow({ id: 4, tmdbId: 999 });

    const answer = await call("/db/tables/wishes/rows?such=999");

    expect(answer.body.total).toBe(1);
    expect(rowsOf(answer.body)[0]?.tmdb_id).toBe(999);
  });

  test("a table the schema does not have is refused", async () => {
    const answer = await call("/db/tables/nothing_here/rows");

    expect(answer.status).toBe(400);
    expect(String(answer.body.error)).toContain("nothing_here");
  });
});

describe("writing a row", () => {
  test("a cell is written to the row its key names", async () => {
    wishRow({ id: 5, tmdbId: 100 });

    const saved = await call("/db/tables/wishes/rows", {
      method: "PUT",
      body: { pk: 5, values: { note: "by hand" } },
    });

    expect(saved.status).toBe(200);
    expect(rowsOf((await call("/db/tables/wishes/rows")).body)[0]?.note).toBe("by hand");
  });

  test("a column the table does not have changes nothing", async () => {
    wishRow({ id: 6, tmdbId: 100 });

    const saved = await call("/db/tables/wishes/rows", {
      method: "PUT",
      body: { pk: 6, values: { not_a_column: "x" } },
    });

    expect(saved.status).toBe(200);
    expect(rowsOf((await call("/db/tables/wishes/rows")).body)[0]?.tmdb_id).toBe(100);
  });

  test("a body that is not json is refused", async () => {
    expect((await call("/db/tables/wishes/rows", { method: "PUT", body: "{" })).status).toBe(400);
  });

  test("rows are deleted by their keys", async () => {
    wishRow({ id: 7, tmdbId: 100 });
    wishRow({ id: 8, tmdbId: 101 });

    const gone = await call("/db/tables/wishes/rows", { method: "DELETE", body: { pks: [7] } });

    expect(gone.status).toBe(200);
    expect((await call("/db/tables/wishes/rows")).body.total).toBe(1);
  });
});
