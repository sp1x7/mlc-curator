import type { WishEntry } from "@shared/types/wishlist";
import { cn } from "@web/lib/utils";
import { memo, type ReactNode, useRef } from "react";
import { ageText, type Column, matchesOk, progressPct, progressText } from "./columns";

/** The rows, the columns with their widths, the sort, the selection and the writes. */
type Props = {
  rows: WishEntry[];
  columns: Column[];
  widths: Record<string, number>;
  sortKey: string;
  sortBack: boolean;
  selected: number | null;
  onSort: (key: string) => void;
  onWidth: (key: string, value: number) => void;
  onSelect: (wish: WishEntry) => void;
};

// The look of a body cell.
const cell = "truncate border-t border-hair-6 px-2.5 py-1.5 align-top whitespace-nowrap";
// A cell with a number, right-aligned.
const num = `${cell} text-right font-mono tabular-nums`;
// A cell of fixed-width words.
const mono = `${cell} font-mono tabular-nums`;

/** The colour of the state dot and its word. */
const STAMP: Record<string, string> = {
  open: "text-info",
  part: "text-wrn",
  done: "text-ok",
};

/** A dragged width first, else the width written in the column. */
const widthOf = (column: Column, widths: Record<string, number>): number =>
  widths[column.key] ?? column.width;

/** The widths of both tables from one source. */
function Colgroup({ columns, widths }: { columns: Column[]; widths: Record<string, number> }) {
  return (
    <colgroup>
      {columns.map((column) => (
        <col key={column.key} style={{ width: widthOf(column, widths) }} />
      ))}
    </colgroup>
  );
}

/** The state of a wish: dot and word. */
const Status = ({ wish }: { wish: WishEntry }) => (
  <span className={cn("label-tight inline-flex items-center gap-1.5", STAMP[wish.status])}>
    <span className={cn("block size-[7px] rounded-full", `bg-current`)} />
    {wish.status === "part" ? "partial" : wish.status}
  </span>
);

/** The content of one cell, picked by the column it belongs to. */
function cellOf(column: Column, wish: WishEntry): ReactNode {
  const pct = progressPct(wish);
  const ok = matchesOk(wish);

  switch (column.key) {
    case "status":
      return <Status wish={wish} />;
    case "type":
      return (
        <span className="label inline-block rounded-sm border border-hair-10 px-1 text-muted-foreground">
          {wish.kind === "tv" ? "series" : "movie"}
        </span>
      );
    case "title":
      return wish.identity.title;
    case "year":
      return wish.identity.year ?? "";
    case "minres":
      return wish.target.minRes;
    case "audio":
      return wish.target.audio;
    case "inlib":
      return wish.inLibrary ? (
        <span className="text-ok">yes</span>
      ) : (
        <span className="text-muted-foreground">no</span>
      );
    case "progress":
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-[52px] overflow-hidden rounded-[2px] bg-glass-8">
            <span
              className={cn("block h-1 rounded-[2px]", pct >= 1 ? "bg-ok" : "bg-wrn")}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </span>
          <span className="font-mono tabular-nums">{progressText(wish)}</span>
        </span>
      );
    case "matches":
      return wish.matches.length === 0 ? (
        <span className="text-muted-foreground">-</span>
      ) : (
        <span className={ok > 0 ? "text-ok" : "text-err"}>
          {ok}/{wish.matches.length}
        </span>
      );
    case "added":
      return ageText(wish.createdAt);
    default:
      return null;
  }
}

/** The cell class a column asks for. */
const classOf = (column: Column): string => (column.mono ? mono : column.num ? num : cell);

/** One wish row; a click or Enter selects it. */
const Row = memo(function Row({
  wish,
  columns,
  active,
  onSelect,
}: {
  wish: WishEntry;
  columns: Column[];
  active: boolean;
  onSelect: (wish: WishEntry) => void;
}) {
  return (
    <tr
      tabIndex={0}
      title={
        wish.identity.originalTitle && wish.identity.originalTitle !== wish.identity.title
          ? wish.identity.originalTitle
          : wish.identity.title
      }
      className={cn("cursor-pointer transition", active ? "bg-acc1/12" : "hover:bg-white/5")}
      onClick={() => onSelect(wish)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(wish);
      }}
    >
      {columns.map((column) => (
        <td key={column.key} className={classOf(column)}>
          {cellOf(column, wish)}
        </td>
      ))}
    </tr>
  );
});

/** The wish table: a head with sortable, resizable columns, and the rows. */
export default function List({
  rows,
  columns,
  widths,
  sortKey,
  sortBack,
  selected,
  onSort,
  onWidth,
  onSelect,
}: Props) {
  const head = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const total = columns.reduce((sum, column) => sum + widthOf(column, widths), 0);

  /** Sorts a column; a drag over the grip leaves sorting alone. */
  const pickSort = (key: string): void => {
    if (dragged.current) return;
    onSort(key);
  };

  /** Drags a column width, held at 40. */
  const startResize = (event: React.MouseEvent<HTMLElement>, column: Column): void => {
    event.preventDefault();
    event.stopPropagation();

    const cellElement = event.currentTarget.parentElement;
    if (!cellElement) return;

    const from = event.clientX;
    const start = cellElement.getBoundingClientRect().width;
    dragged.current = false;
    document.body.style.cursor = "col-resize";

    const move = (moveEvent: MouseEvent): void => {
      dragged.current = true;
      onWidth(column.key, Math.max(40, Math.round(start + moveEvent.clientX - from)));
    };
    const stop = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      document.body.style.cursor = "";
      setTimeout(() => {
        dragged.current = false;
      }, 0);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {/* The head row, moved along by the horizontal scroll of the body. */}
      <div className="shrink-0 overflow-hidden border-b border-hair-12">
        <div ref={head}>
          <table className="table-fixed border-collapse" style={{ width: total }}>
            <Colgroup columns={columns} widths={widths} />
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    aria-sort={
                      sortKey === column.key ? (sortBack ? "descending" : "ascending") : "none"
                    }
                    className="label relative cursor-pointer px-2.5 py-1.5 font-medium text-muted-foreground select-none"
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-pointer items-center text-left",
                        column.num && "justify-end",
                        sortKey === column.key && "text-acc1",
                      )}
                      onClick={() => pickSort(column.key)}
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
                        onWidth(column.key, Math.max(40, widthOf(column, widths) + step));
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

      {/* The rows; the body renders its rows as they come into view. */}
      <div
        className="min-h-0 flex-1 overflow-auto scroll-thin"
        style={{ contentVisibility: "auto", containIntrinsicSize: "40rem" }}
        onScroll={(event) => {
          if (head.current)
            head.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
        }}
      >
        <table className="table-fixed border-collapse text-[12px]" style={{ width: total }}>
          <Colgroup columns={columns} widths={widths} />
          <tbody>
            {rows.map((wish) => (
              <Row
                key={wish.id}
                wish={wish}
                columns={columns}
                active={selected === wish.id}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
