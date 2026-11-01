// Shapes the raw table access moves: the columns of a table, one row, one page of
// rows.

/**
 * One column, as `PRAGMA table_info` describes it. The field names mirror the
 * columns of that pragma, so the values arrive as sqlite answers them: `notnull`
 * as 1 or 0, `dflt_value` as the default expression text of the table definition.
 */
export type ColumnInfo = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  /** Position inside the primary key, `0` when the column is not part of it. */
  pk: number;
};

/**
 * One table: its columns in the order the pragma lists them, and the number of
 * rows it holds.
 */
export type TableInfo = {
  name: string;
  columns: ColumnInfo[];
  count: number;
};

/** One row: the keys are the column names as the table defines them. */
export type Row = Record<string, unknown>;

/** One page of rows together with the total row count of the table. */
export type RowPage = {
  rows: Row[];
  total: number;
};

/** A value a write accepts; an empty input field arrives as `null`. */
export type CellValue = string | number | null;
