// Raw table access for the DB editor.
//
// Domain validation stays out on purpose: the editor writes any cell of any row.
// Table and column names are still checked against the live schema, so a typo or
// a sql fragment stays out of the statement text.

import type { CellValue, ColumnInfo, Row, RowPage, TableInfo } from "@shared/types/db";

import { publish } from "../app/events";
import { sqlite } from "./db";

// A plain identifier is allowed into statement text; everything else is a
// fragment.
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Bind = string | number | null;

// Every user table of the live file, sqlite internals and drizzle bookkeeping
// left out.
function tableNames(): string[] {
  const rows = sqlite
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
    )
    .all() as { name: string }[];
  return rows.map((row) => row.name);
}

// Column list of one table, straight from pragma table_info.
function columnsOf(name: string): ColumnInfo[] {
  return sqlite.query(`PRAGMA table_info("${name}")`).all() as ColumnInfo[];
}

/** Only names the schema actually has. */
function checked(name: unknown): string {
  if (typeof name !== "string" || !NAME.test(name) || !tableNames().includes(name)) {
    throw new Error(`unknown table: ${String(name)}`);
  }
  return name;
}

// The primary key column of a table, taken from its pragma table_info.
function keyColumn(name: string): ColumnInfo {
  const key = columnsOf(name).find((column) => column.pk > 0);
  if (!key) throw new Error(`table without primary key: ${name}`);
  return key;
}

// Row count behind one where clause.
function countOf(name: string, where = "1=1", args: Bind[] = []): number {
  const row = sqlite.query(`SELECT COUNT(*) AS n FROM "${name}" WHERE ${where}`).get(...args) as {
    n: number;
  };
  return row.n;
}

/** Name, columns and row count of every table, the payload of the table list. */
export function tablesInfo(): TableInfo[] {
  return tableNames().map((name) => ({
    name,
    columns: columnsOf(name),
    count: countOf(name),
  }));
}

/**
 * Every row of one table in key order. The search compares each column cast to
 * text; the whole set travels in one answer and the grid scrolls it.
 */
export function rowsOf(name: string, search: string): RowPage {
  const table = checked(name);
  const columns = columnsOf(table);
  const key = keyColumn(table);

  let where = "1=1";
  const args: Bind[] = [];
  if (search !== "") {
    where = columns.map((column) => `CAST("${column.name}" AS TEXT) LIKE ?`).join(" OR ");
    args.push(...columns.map(() => `%${search}%`));
  }

  const rows = sqlite
    .query(`SELECT * FROM "${table}" WHERE ${where} ORDER BY "${key.name}"`)
    .all(...args) as Row[];

  return { rows, total: countOf(table, where, args) };
}

/** Unknown column names drop out silently. */
function kept(table: string, values: Record<string, unknown>): Record<string, CellValue> {
  const known = new Set(columnsOf(table).map((column) => column.name));
  const out: Record<string, CellValue> = {};
  for (const [column, value] of Object.entries(values)) {
    if (known.has(column)) out[column] = (value ?? null) as CellValue;
  }
  return out;
}

/** Writes one row. Fields holding null stay out of the column list, and a body
    that keeps zero columns takes DEFAULT VALUES. */
export function insertRow(name: string, values: Record<string, unknown>): void {
  const table = checked(name);
  const clean = kept(table, values);
  const keys = Object.keys(clean).filter((key) => clean[key] !== null);

  if (keys.length === 0) {
    sqlite.query(`INSERT INTO "${table}" DEFAULT VALUES`).run();
  } else {
    const sql = `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(", ")}) VALUES (${keys
      .map(() => "?")
      .join(", ")})`;
    sqlite.query(sql).run(...keys.map((key) => clean[key] as Bind));
  }

  publish("db.changed", { table, action: "insert" });
}

/** Rewrites one row by its primary key; a value map with zero columns leaves the
    row alone. */
export function updateRow(name: string, keyValue: Bind, values: Record<string, unknown>): void {
  const table = checked(name);
  const key = keyColumn(table);
  const clean = kept(table, values);
  const columns = Object.keys(clean);
  if (columns.length === 0) return;

  sqlite
    .query(
      `UPDATE "${table}" SET ${columns.map((column) => `"${column}" = ?`).join(", ")} WHERE "${key.name}" = ?`,
    )
    .run(...columns.map((column) => clean[column] as Bind), keyValue);

  publish("db.changed", { table, action: "update" });
}

/** Deletes the rows of the key list in one statement. */
export function deleteRows(name: string, keys: Bind[]): void {
  const table = checked(name);
  const key = keyColumn(table);
  if (keys.length === 0) return;

  sqlite
    .query(`DELETE FROM "${table}" WHERE "${key.name}" IN (${keys.map(() => "?").join(", ")})`)
    .run(...keys);

  publish("db.changed", { table, action: "delete" });
}
