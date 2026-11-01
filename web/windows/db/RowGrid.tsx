import type { CellValue, ColumnInfo, Row } from "@shared/types/db";
import { cn } from "@web/lib/utils";
import { useRef, useState } from "react";

import DataCell from "./DataCell";

// Width of a column before a drag.
const COL_DEFAULT = 120;
/** First column is the row checkbox. */
const CHECK_W = 32;

/** Columns, rows, the selection and the draft row of a new entry. */
type Props = {
  columns: ColumnInfo[];
  rows: Row[];
  selected: string[];
  onToggle(pk: string): void;
  onToggleAll(): void;
  draftOpen: boolean;
  draft: Record<string, string>;
  onDraftChange(name: string, value: string): void;
  onDraftCommit(): void;
  onDraftCancel(): void;
  onSave(row: Row, column: ColumnInfo, next: CellValue): void;
};

/** One col for the checkbox column and one per table column. */
function Colgroup({ columns, widths }: { columns: ColumnInfo[]; widths: Record<string, number> }) {
  return (
    <colgroup>
      <col style={{ width: CHECK_W }} />
      {columns.map((column) => (
        <col key={column.name} style={{ width: widths[column.name] ?? COL_DEFAULT }} />
      ))}
    </colgroup>
  );
}

// Head and body are two tables; only the body scrolls, so the head always
// covers the rows that pass under it.
export default function RowGrid({
  columns,
  rows,
  selected,
  onToggle,
  onToggleAll,
  draftOpen,
  draft,
  onDraftChange,
  onDraftCommit,
  onDraftCancel,
  onSave,
}: Props) {
  // The primary key column; where it is absent the row index is the key.
  const keyName = columns.find((column) => column.pk > 0)?.name;
  const [widths, setWidths] = useState<Record<string, number>>({});
  const head = useRef<HTMLDivElement>(null);

  // The checkbox column plus every column width: both tables get the same total.
  const total =
    CHECK_W + columns.reduce((sum, column) => sum + (widths[column.name] ?? COL_DEFAULT), 0);

  // The line at the right edge of a header cell drags its column.
  const startResize = (event: React.MouseEvent<HTMLElement>, column: ColumnInfo): void => {
    event.preventDefault();

    const cell = event.currentTarget.parentElement;
    if (!cell) return;

    const from = event.clientX;
    const start = cell.getBoundingClientRect().width;
    document.body.style.cursor = "col-resize";

    const move = (moveEvent: MouseEvent): void => {
      setWidths((current) => ({
        ...current,
        [column.name]: Math.max(0, Math.round(start + moveEvent.clientX - from)),
      }));
    };
    const stop = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };

  // The head checkbox stands checked once every row of the page is marked.
  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 overflow-hidden border-b border-hair-12">
        <div ref={head}>
          <table className="table-fixed border-collapse" style={{ width: total }}>
            <Colgroup columns={columns} widths={widths} />
            <thead>
              <tr>
                <th className="label px-2 py-1.5 font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    aria-label="Alle Zeilen markieren"
                    className="size-3.5 cursor-pointer accent-acc1"
                    checked={allSelected}
                    onChange={onToggleAll}
                  />
                </th>
                {columns.map((column) => (
                  <th
                    key={column.name}
                    title={column.type}
                    className="label relative px-2.5 py-1.5 font-medium text-muted-foreground select-none"
                  >
                    <span className="block truncate font-mono">{column.name}</span>
                    <button
                      type="button"
                      title="Breite ändern"
                      aria-label={`Breite der Spalte ${column.name} ändern`}
                      className="group/grip absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
                      onMouseDown={(event) => startResize(event, column)}
                      onKeyDown={(event) => {
                        const step =
                          event.key === "ArrowRight" ? 10 : event.key === "ArrowLeft" ? -10 : 0;
                        if (step === 0) return;
                        event.preventDefault();
                        setWidths((current) => ({
                          ...current,
                          [column.name]: Math.max(0, (current[column.name] ?? COL_DEFAULT) + step),
                        }));
                      }}
                    >
                      <span className="absolute inset-y-[3px] left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-hair-12 group-hover/grip:bg-acc1" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      <div
        className="scroll-thin min-h-0 flex-1 overflow-auto"
        style={{ contentVisibility: "auto", containIntrinsicSize: "40rem" }}
        onScroll={(event) => {
          // The head follows the horizontal scroll of the body.
          if (head.current)
            head.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
        }}
      >
        <table className="table-fixed border-collapse text-[12px]" style={{ width: total }}>
          <Colgroup columns={columns} widths={widths} />
          <tbody>
            {/* The new row stands above the stored ones and edits in place. */}
            {draftOpen && (
              <tr className="bg-glass-2">
                <td className="border-b border-hair-6 p-1" />
                {columns.map((column) => (
                  <td key={column.name} className="border-b border-hair-6 p-0.5">
                    <DataCell
                      draft={{
                        value: draft[column.name] ?? "",
                        onChange: (value) => onDraftChange(column.name, value),
                        onCommit: onDraftCommit,
                        onCancel: onDraftCancel,
                      }}
                    />
                  </td>
                ))}
              </tr>
            )}

            {rows.map((row, index) => {
              // The key of a row: its primary key value, or its position in place of
              // one.
              const pk = keyName === undefined ? `row-${index}` : String(row[keyName]);
              const marked = selected.includes(pk);
              return (
                <tr
                  key={pk}
                  className={cn("transition", marked ? "bg-acc1/12" : "hover:bg-white/5")}
                >
                  <td className="border-t border-hair-6 p-1 text-center">
                    <input
                      type="checkbox"
                      aria-label="Zeile markieren"
                      className="size-3.5 cursor-pointer accent-acc1"
                      checked={marked}
                      onChange={() => onToggle(pk)}
                    />
                  </td>
                  {columns.map((column) => (
                    <td key={column.name} className="border-t border-hair-6 p-0.5 align-top">
                      <DataCell
                        value={row[column.name]}
                        onSave={(next) => onSave(row, column, next as CellValue)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && !draftOpen && (
          <div className="p-3 text-[12px] text-muted-foreground">Keine Zeilen</div>
        )}
      </div>
    </div>
  );
}
