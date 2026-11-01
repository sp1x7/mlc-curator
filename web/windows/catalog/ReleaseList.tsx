import type { Release } from "@shared/types/catalog";
import { cn } from "@web/lib/utils";
import { ContextMenu } from "@web/ui/context-menu";
import { memo, useRef, useState } from "react";
import {
  COLUMNS,
  type Column,
  displayTitle,
  episodeMark,
  holdText,
  listDate,
  ratingText,
  releaseYear,
} from "./columns";

/** The sorted column and its direction. */
export type Sort = { key: string; dir: "asc" | "desc" };

/** The three actions the context menu calls on a row. */
export type ListActions = {
  onInfo: (release: Release) => void;
  onDownload: (release: Release) => void;
  onAssign: (release: Release) => void;
};

/** Where the context menu opened and the row it belongs to. */
type Menu = { x: number; y: number; release: Release };

/** Rows, column widths, sort state, selection and the actions of the menu. */
type Props = {
  rows: Release[];
  widths: Record<string, number>;
  onWidth: (key: string, value: number) => void;
  sort: Sort;
  onSort: (next: Sort) => void;
  selected: number | null;
  onSelect: (release: Release) => void;
  actions: ListActions;
};

/** The width a column has: the dragged one, otherwise the default. */
const widthOf = (column: Column, widths: Record<string, number>): number =>
  widths[column.key] ?? column.width;

/** The board link with host and path, whatever the row carries. */
function boardUrl(release: Release): string {
  return `https://mlcboard.com/forum/${release.url.replace(/^https?:\/\/mlcboard\.com\/forum\//, "")}`;
}

/** The tmdb page of the mapped title; an unmapped row answers null. */
function tmdbUrl(release: Release): string | null {
  if (!release.tmdb) return null;
  return `https://www.themoviedb.org/${release.tmdb.kind === "tv" ? "tv" : "movie"}/${release.tmdb.tmdbId}`;
}

/** One col per column, so head and body read the same widths. */
function Colgroup({ widths }: { widths: Record<string, number> }) {
  return (
    <colgroup>
      {COLUMNS.map((column) => (
        <col key={column.key} style={{ width: widthOf(column, widths) }} />
      ))}
    </colgroup>
  );
}

/** One release: the seven columns of COLUMNS in their order. */
const Row = memo(function Row({
  release,
  active,
  onSelect,
  onMenu,
}: {
  release: Release;
  active: boolean;
  onSelect: (release: Release) => void;
  onMenu: (event: React.MouseEvent, release: Release) => void;
}) {
  const year = releaseYear(release);
  const mark = episodeMark(release);

  return (
    <tr
      tabIndex={0}
      title={release.tmdb ? `${release.tmdb.title} — ${release.title}` : release.title}
      className={cn(
        "cursor-pointer border-t border-hair-6 transition",
        active ? "bg-acc1/12" : "hover:bg-white/5",
      )}
      onClick={() => onSelect(release)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(release);
      }}
      onContextMenu={(event) => onMenu(event, release)}
    >
      <td className="truncate border-t border-hair-6 px-2.5 py-1.5 text-right align-top font-mono whitespace-nowrap tabular-nums">
        {release.threadId}
      </td>
      <td className="truncate border-t border-hair-6 px-2.5 py-1.5 text-right align-top font-mono whitespace-nowrap tabular-nums">
        {ratingText(release)}
      </td>
      <td className="border-t border-hair-6 px-2.5 py-1.5 align-top">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{displayTitle(release)}</span>
          {mark && (
            <span className="ml-auto shrink-0 rounded bg-glass-8 px-1 text-[10px] uppercase">
              {mark}
            </span>
          )}
        </div>
      </td>
      <td className="truncate border-t border-hair-6 px-2.5 py-1.5 text-right align-top font-mono whitespace-nowrap tabular-nums text-muted-foreground">
        {year}
      </td>
      <td className="truncate border-t border-hair-6 px-2.5 py-1.5 align-top font-mono whitespace-nowrap tabular-nums">
        {listDate(release)}
      </td>
      <td className="border-t border-hair-6 px-2.5 py-1.5 text-center align-top">
        <span
          title={holdText(release)}
          className={`inline-block h-2 w-2 rounded-full ${release.have ? "bg-ok" : "bg-glass-8"}`}
        />
      </td>
      <td className="border-t border-hair-6 px-2.5 py-1.5 text-center align-top">
        <span
          title={release.ftp ? "FTP-Datensatz" : "kein FTP-Datensatz"}
          className={`inline-block h-2 w-2 rounded-full ${release.ftp ? "bg-acc1" : "bg-glass-8"}`}
        />
      </td>
    </tr>
  );
});

// Head and body are two tables; only the body scrolls, so the head always
// covers the rows that pass under it.
export function ReleaseList({
  rows,
  widths,
  onWidth,
  sort,
  onSort,
  selected,
  onSelect,
  actions,
}: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const head = useRef<HTMLDivElement>(null);
  // A finished width drag leaves the sort alone: the flag swallows the click that
  // follows the release.
  const dragged = useRef(false);
  // Both tables get the same total width.
  const total = COLUMNS.reduce((sum, column) => sum + widthOf(column, widths), 0);

  const openMenu = (event: React.MouseEvent, release: Release): void => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, release });
  };

  /** The same key flips the direction; a new key starts desc, title asc. */
  const pickSort = (key: string): void => {
    if (!key || dragged.current) return;
    onSort(
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "title" ? "asc" : "desc" },
    );
  };

  // The line at the right edge of a header cell drags its column; the cell
  // itself sorts.
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
      onWidth(column.key, Math.max(0, Math.round(start + moveEvent.clientX - from)));
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 overflow-hidden border-b border-hair-12">
        <div ref={head}>
          <table className="table-fixed border-collapse" style={{ width: total }}>
            <Colgroup widths={widths} />
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    aria-sort={
                      sort.key === column.key
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="label relative cursor-pointer px-2.5 py-1.5 font-medium text-muted-foreground select-none"
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-pointer items-center text-left",
                        column.num && "justify-end",
                        sort.key === column.key && "text-acc1",
                      )}
                      onClick={() => pickSort(column.key)}
                    >
                      <span className="block truncate">{column.label}</span>
                      {sort.key === column.key && (
                        <span className="ml-1">{sort.dir === "asc" ? "▲" : "▼"}</span>
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
                        onWidth(column.key, Math.max(0, widthOf(column, widths) + step));
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
        className="min-h-0 flex-1 overflow-auto scroll-thin"
        style={{ contentVisibility: "auto", containIntrinsicSize: "40rem" }}
        onScroll={(event) => {
          // The head follows the horizontal scroll of the body.
          setMenu(null);
          if (head.current)
            head.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
        }}
      >
        <table className="table-fixed border-collapse text-[12px]" style={{ width: total }}>
          <Colgroup widths={widths} />
          <tbody>
            {rows.map((release) => (
              <Row
                key={release.threadId}
                release={release}
                active={selected === release.threadId}
                onSelect={onSelect}
                onMenu={openMenu}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-3 text-[12px] text-muted-foreground">Keine Treffer</div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            // The tmdb entry appears once the row carries a mapped title.
            { label: "Danke", run: () => actions.onInfo(menu.release) },
            { label: "Download", run: () => actions.onDownload(menu.release) },
            {
              label: menu.release.tmdb ? "Zuweisung ändern" : "TMDB zuweisen",
              run: () => actions.onAssign(menu.release),
            },
            { label: "Im Board öffnen", run: () => window.open(boardUrl(menu.release), "_blank") },
            ...(menu.release.tmdb
              ? [
                  {
                    label: "TMDB öffnen",
                    run: () => {
                      const url = tmdbUrl(menu.release);
                      if (url) window.open(url, "_blank");
                    },
                  },
                ]
              : []),
            { label: "In den Details öffnen", run: () => onSelect(menu.release) },
          ]}
        />
      )}
    </div>
  );
}
