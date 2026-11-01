import { cn } from "@web/lib/utils";
import { useRef } from "react";
import { type Column, cellLines, sortValue } from "./columns";
import { haveOf, type LibraryNode } from "./node";

// The colour of a season with episodes left out.
const WARN = "text-wrn";

// Columns without a set width start here; the name columns need room.
const DEFAULT_WIDTH: Record<string, number> = {
  name: 340,
  title: 220,
  episode: 220,
  seasonName: 180,
  quality: 110,
  codec: 110,
  audio: 180,
  airDate: 130,
  size: 100,
  modified: 140,
  year: 80,
  rating: 90,
  files: 80,
  entries: 90,
  episodes: 90,
};

/** The warning tone of a cell: a season with episodes left over. */
function toneOf(node: LibraryNode, key: string): string {
  if (key === "episodes" && node.type === "season" && haveOf(node) < node.expected) return WARN;
  return "";
}

/** The table of the opened folder: a head that follows the horizontal scroll, columns
    sortable and resizable. */
export default function List({
  rows,
  columns,
  sortKey,
  sortBack,
  selectedPath,
  widths,
  onSort,
  onSelect,
  onOpen,
  onResize,
}: {
  rows: LibraryNode[];
  columns: Column[];
  sortKey: string;
  sortBack: boolean;
  selectedPath: string | null;
  widths: Record<string, number>;
  onSort(key: string): void;
  onSelect(node: LibraryNode): void;
  onOpen(node: LibraryNode): void;
  onResize(key: string, width: number): void;
}) {
  // A dragged width first, then the default of the column, then 120.
  const widthOf = (column: Column): number =>
    widths[column.key] ?? DEFAULT_WIDTH[column.key] ?? 120;
  const total = columns.reduce((sum, column) => sum + widthOf(column), 0);
  const head = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);

  // The head stands above the scrolling body, so it moves with the horizontal
  // scroll of the body.
  const syncScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    if (head.current)
      head.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
  };

  // The line at the right edge of a header cell drags its column; the cell itself
  // sorts, and a drag keeps sorting alone.
  const startResize = (event: React.MouseEvent<HTMLElement>, column: Column): void => {
    event.preventDefault();
    event.stopPropagation();

    const cell = event.currentTarget.parentElement;
    if (!cell) return;

    const from = event.clientX;
    const start = cell.getBoundingClientRect().width;
    dragged.current = false;
    document.body.style.cursor = "col-resize";

    const move = (moveEvent: MouseEvent): void => {
      dragged.current = true;
      onResize(column.key, Math.max(0, Math.round(start + moveEvent.clientX - from)));
    };
    const stop = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      document.body.style.cursor = "";
      // The click that follows the release is swallowed once.
      setTimeout(() => {
        dragged.current = false;
      }, 0);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The head row, moved along by the horizontal scroll of the body. */}
      <div className="shrink-0 overflow-hidden border-b border-hair-12">
        <div ref={head}>
          <table className="table-fixed border-collapse" style={{ width: total }}>
            <colgroup>
              {columns.map((column) => (
                <col key={column.key} style={{ width: widthOf(column) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    aria-sort={
                      sortKey === column.key ? (sortBack ? "descending" : "ascending") : "none"
                    }
                    className="label relative cursor-pointer px-2.5 py-1.5 text-left font-medium text-muted-foreground select-none"
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-pointer items-center text-left",
                        column.num && "justify-end",
                        sortKey === column.key && "text-acc1",
                      )}
                      onClick={() => {
                        if (dragged.current) return;
                        onSort(column.key);
                      }}
                    >
                      <span className="block truncate">{column.label}</span>
                      {sortKey === column.key && (
                        <span className="ml-1">{sortBack ? "▲" : "▼"}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      title="Breite ändern"
                      aria-label={`Breite der Spalte ${column.label} ändern`}
                      className="group/grip absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
                      onMouseDown={(event) => startResize(event, column)}
                      onKeyDown={(event) => {
                        const step =
                          event.key === "ArrowRight" ? 10 : event.key === "ArrowLeft" ? -10 : 0;
                        if (step === 0) return;
                        event.preventDefault();
                        onResize(column.key, Math.max(0, widthOf(column) + step));
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

      {/* The rows; a click selects, a double click opens a folder. */}
      <div className="min-h-0 flex-1 overflow-auto scroll-thin" onScroll={syncScroll}>
        <table className="table-fixed border-collapse" style={{ width: total }}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: widthOf(column) }} />
            ))}
          </colgroup>
          <tbody>
            {rows.map((node) => (
              <tr
                key={node.path}
                className={cn(
                  "cursor-pointer border-t border-hair-6 transition",
                  selectedPath === node.path ? "bg-acc1/12" : "hover:bg-white/5",
                )}
                onClick={() => onSelect(node)}
                onDoubleClick={() => (node.type === "file" ? onSelect(node) : onOpen(node))}
              >
                {columns.map((column) => {
                  const lines = cellLines(node, column.key);
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        "truncate border-t border-hair-6 px-2.5 py-1.5 align-top whitespace-nowrap",
                        column.num && "text-right font-mono tabular-nums",
                        toneOf(node, column.key),
                      )}
                    >
                      {lines.map((line, index) => (
                        <div
                          key={`${column.key}:${line}`}
                          className={index === 0 ? "" : "text-[10px] text-muted-foreground"}
                        >
                          {line}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Rows by the value of one column: numbers subtract, everything else compares as
    German text with numbers inside. */
export function sortedRows(rows: LibraryNode[], key: string, back: boolean): LibraryNode[] {
  return [...rows].sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);

    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * (back ? -1 : 1);
    }

    return (
      String(left).localeCompare(String(right), "de", { numeric: true, sensitivity: "base" }) *
      (back ? -1 : 1)
    );
  });
}
