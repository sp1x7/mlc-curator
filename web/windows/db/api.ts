// Client of the raw table access: five endpoints over one table — list, page,
// insert, update, delete. A table name outside the schema answers an error.

import type { CellValue, RowPage, TableInfo } from "@shared/types/db";
import { clientOf } from "@web/lib/api";

// The area prefix of every path.
const tables = clientOf("db");

/** The row endpoint of one table; the name goes url-escaped. */
const pathOf = (table: string): string => `/tables/${encodeURIComponent(table)}/rows`;

/** The table endpoints, one function each. */
export const dbApi = {
  /** Every table with its columns and its row count. */
  tables: () => tables.get<{ tables: TableInfo[] }>("/tables"),

  /** One page of rows; an empty search word stays out of the query. */
  rows: (table: string, such = "") =>
    tables.get<RowPage>(pathOf(table), such === "" ? undefined : { such }),

  /** One row built from the form values. */
  create: (table: string, values: Record<string, CellValue>) =>
    tables.post<{ ok: boolean }>(pathOf(table), values),

  /** One row addressed by its primary key value. */
  update: (table: string, pk: CellValue, values: Record<string, CellValue>) =>
    tables.put<{ ok: boolean }>(pathOf(table), { pk, values }),

  /** The rows whose primary keys are listed. */
  remove: (table: string, pks: CellValue[]) => tables.del<{ ok: boolean }>(pathOf(table), { pks }),
};
