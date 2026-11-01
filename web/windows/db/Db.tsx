import type { CellValue, ColumnInfo, Row } from "@shared/types/db";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { useEffect, useState } from "react";

import { dbApi } from "./api";
import RowGrid from "./RowGrid";
import { StatusFooter } from "./StatusFooter";
import { Tables } from "./Tables";

// The look of the small buttons in the header row.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";
// The button that carries the main action.
const primary = `${button} border-acc1/30 bg-acc1/16 text-acc1 hover:bg-acc1/24`;
// The button that drops rows.
const danger = `${button} border-err/40 text-err hover:bg-err/10`;

/** The search field waits this long after the last keystroke before it queries. */
const SEARCH_DELAY_MS = 250;

/** The table browser: the table list, the rows of one table, inline edit, insert and
 *  delete. */
export default function Db() {
  const client = useQueryClient();

  // Table, search, selection and the draft row of a new entry.
  const [table, setTable] = useState<string | null>(null);
  const [searchField, setSearchField] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // The table list, and the rows of one table under one search word.
  const tables = useQuery({ queryKey: KEYS.db.tables, queryFn: dbApi.tables });
  const rows = useQuery({
    queryKey: KEYS.db.rows(table, search),
    queryFn: () => dbApi.rows(table ?? "", search),
    enabled: table !== null,
  });

  // The debounce: the field text becomes the query key after the pause.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchField.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchField]);

  // The columns of the picked table.
  const info = tables.data?.tables.find((entry) => entry.name === table) ?? null;
  // The column that carries the primary key; every write addresses the row through
  // it.
  const keyName = info?.columns.find((column) => column.pk > 0)?.name;
  // The rows of the current page, and the count of the whole table.
  const list = rows.data?.rows ?? [];
  const total = rows.data?.total ?? 0;

  /** Puts the message of a failed write on the header row. */
  const fail = (cause: unknown): void => {
    setError(cause instanceof Error ? cause.message : String(cause));
  };

  /** Reloads every db answer. */
  const reload = (): void => {
    void client.invalidateQueries({ queryKey: KEYS.db.all });
  };

  /** Writes one cell of one row, addressed by its primary key. */
  const store = async (row: Row, column: ColumnInfo, next: CellValue): Promise<void> => {
    if (table === null || keyName === undefined) return;
    setError(null);
    try {
      await dbApi.update(table, (row[keyName] ?? null) as CellValue, { [column.name]: next });
      reload();
    } catch (cause) {
      fail(cause);
    }
  };

  /** Deletes the selected rows in one call. */
  const removeSelected = async (): Promise<void> => {
    if (table === null || selected.length === 0) return;
    setError(null);
    try {
      await dbApi.remove(table, selected);
      setSelected([]);
      reload();
    } catch (cause) {
      fail(cause);
    }
  };

  /** One row from the draft cells; an empty cell becomes null. */
  const insertDraft = async (): Promise<void> => {
    if (info === null) return;
    setError(null);
    const values: Record<string, CellValue> = {};
    for (const column of info.columns) {
      const value = (draft[column.name] ?? "").trim();
      values[column.name] = value === "" ? null : value;
    }
    try {
      await dbApi.create(info.name, values);
      setDraftOpen(false);
      setDraft({});
      reload();
    } catch (cause) {
      fail(cause);
    }
  };

  /** Adds or drops one primary key in the selection. */
  const toggle = (pk: string): void => {
    setSelected((current) =>
      current.includes(pk) ? current.filter((entry) => entry !== pk) : [...current, pk],
    );
  };

  /** Selects every row of the page, or clears the selection when all stand selected. */
  const toggleAll = (): void => {
    if (keyName === undefined) return;
    const keys = list.map((row) => String(row[keyName]));
    setSelected((current) => (current.length === keys.length && keys.length > 0 ? [] : keys));
  };

  return (
    <div className="flex h-full min-h-0">
      <Tables
        tables={tables.data?.tables ?? []}
        active={table}
        onPick={(name) => {
          setTable(name);
          setSelected([]);
          setDraftOpen(false);
          setDraft({});
          setError(null);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search field, the last failure and the write buttons. */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
          <input
            className="h-[26px] w-[220px] shrink-0 rounded-lg border border-hair-8 bg-glass-3 px-2 text-[11px] outline-none focus:border-acc1/50"
            placeholder="Suchen …"
            value={searchField}
            onChange={(event) => setSearchField(event.target.value)}
          />

          {error && (
            <span className="min-w-0 truncate text-[11px] text-err" title={error}>
              {error}
            </span>
          )}

          <div className="flex-1" />

          <button
            type="button"
            className={danger}
            disabled={selected.length === 0}
            onClick={() => void removeSelected()}
          >
            Löschen ({selected.length})
          </button>

          {draftOpen ? (
            <>
              <button
                type="button"
                className={button}
                onClick={() => {
                  setDraftOpen(false);
                  setDraft({});
                }}
              >
                Abbrechen
              </button>
              <button type="button" className={primary} onClick={() => void insertDraft()}>
                Anlegen
              </button>
            </>
          ) : (
            <button
              type="button"
              className={primary}
              onClick={() => {
                setDraft({});
                setDraftOpen(true);
              }}
            >
              + Zeile
            </button>
          )}
        </div>

        {info !== null && (
          <RowGrid
            columns={info.columns}
            rows={list}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            draftOpen={draftOpen}
            draft={draft}
            onDraftChange={(name, value) => setDraft((current) => ({ ...current, [name]: value }))}
            onDraftCommit={() => void insertDraft()}
            onDraftCancel={() => {
              setDraftOpen(false);
              setDraft({});
            }}
            onSave={(row, column, next) => void store(row, column, next)}
          />
        )}

        <StatusFooter table={info?.name ?? null} total={total} />
      </div>
    </div>
  );
}
