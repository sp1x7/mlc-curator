import type { WishKind, WishList, WishTarget } from "@shared/types/wishlist";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { cn } from "@web/lib/utils";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AddWish from "./AddWish";
import { wishlistApi } from "./api";
import { COLUMNS, loadWidths, matchesOk, saveWidths, searchHit, sortValue } from "./columns";
import { activeCount, FilterBar } from "./FilterBar";
import List from "./List";
import Panel from "./Panel";

// The look of a toolbar button.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8";

// The list before the first answer.
const EMPTY: WishList = { rows: [], scannedAt: null };

/** The wishlist window: search, filters, table, detail panel and the add dialog. */
export default function Wishlist() {
  const client = useQueryClient();

  // The wishes with the state of the library behind them.
  const list = useQuery({ queryKey: KEYS.wishlist.list, queryFn: wishlistApi.list });

  // Search text, the three filter axes, sort, widths, selection and the dialog state.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [minRes, setMinRes] = useState("");
  const [sort, setSort] = useState({ key: "status", back: false });
  const [widths, setWidths] = useState<Record<string, number>>(loadWidths);
  const [selected, setSelected] = useState<number | null>(null);
  const [added, setAdded] = useState<{ tmdbId: number; kind: WishKind } | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const data = list.data ?? EMPTY;
  const rows = data.rows;

  // The rows that answer filters and search, in the order of the sort key; equal
  // values fall back to the title.
  const shown = useMemo(() => {
    const picked = rows.filter(
      (wish) =>
        (!status || wish.status === status) &&
        (!kind || wish.kind === kind) &&
        (!minRes || wish.target.minRes === minRes) &&
        searchHit(wish, search),
    );

    return [...picked].sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      const order =
        typeof left === "string" || typeof right === "string"
          ? String(left).localeCompare(String(right))
          : left - right;
      return (sort.back ? -order : order) || a.identity.title.localeCompare(b.identity.title);
    });
  }, [rows, status, kind, minRes, search, sort]);

  // The row the panel shows.
  const detail = shown.find((wish) => wish.id === selected) ?? null;

  // A written wish carries no row id back, so it is picked by its title once
  // the list holds it.
  useEffect(() => {
    if (added === null) return;

    const row = rows.find((wish) => wish.tmdbId === added.tmdbId && wish.kind === added.kind);
    if (!row) return;

    setSelected(row.id);
    setAdded(null);
  }, [added, rows]);

  /** Reloads the wishes and the library state. */
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: KEYS.wishlist.all });
  };

  /** The same key flips direction, a new key starts forward. */
  const sortBy = (key: string): void => {
    setSort((current) =>
      current.key === key ? { ...current, back: !current.back } : { key, back: false },
    );
  };

  /** Keeps a dragged column width in storage. */
  const setWidth = (key: string, value: number): void => {
    setWidths((current) => {
      const next = { ...current, [key]: value };
      saveWidths(next);
      return next;
    });
  };

  /** Shows the message of a failed write. */
  const fail = (cause: unknown): void => {
    setNotice(cause instanceof Error ? cause.message : String(cause));
  };

  /** Writes the target of one wish and reloads the list. */
  const applyTarget = async (
    id: number,
    target: WishTarget,
    note: string | null,
  ): Promise<void> => {
    setNotice(null);
    try {
      await wishlistApi.target(id, target, note);
      refresh();
    } catch (cause) {
      fail(cause);
    }
  };

  /** Takes one wish off the list and drops the selection. */
  const remove = async (id: number): Promise<void> => {
    setNotice(null);
    try {
      await wishlistApi.remove(id);
      setSelected(null);
      refresh();
    } catch (cause) {
      fail(cause);
    }
  };

  // The state counts of every row, and the rows with a release that fits.
  const counts = { open: 0, part: 0, done: 0 };
  for (const wish of rows) counts[wish.status] += 1;
  const fitting = rows.filter((wish) => matchesOk(wish) > 0).length;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Search, the filter button, reset and the add button. */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
            <input
              placeholder="suchen"
              className="min-w-0 flex-1 rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] outline-none focus:border-acc1/50"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <FilterBar
              value={{ status, kind, minRes }}
              onChange={(next) => {
                setStatus(next.status);
                setKind(next.kind);
                setMinRes(next.minRes);
              }}
            />

            {(activeCount({ status, kind, minRes }) > 0 || search) && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  setStatus("");
                  setKind("");
                  setMinRes("");
                  setSearch("");
                }}
              >
                reset
              </button>
            )}

            <button
              type="button"
              className={cn(button, adding && "border-acc1/50 bg-acc1/16 text-acc1")}
              onClick={() => setAdding((open) => !open)}
            >
              + Add wish
            </button>
          </div>

          {/* The table, or the state that stands in its place. */}
          {list.isPending ? (
            <div className="p-3 text-[12px] text-muted-foreground">wishlist loading …</div>
          ) : list.isError ? (
            <div className="p-3 text-[12px] text-err">{String(list.error.message)}</div>
          ) : shown.length === 0 ? (
            <div className="p-3 text-[12px] text-muted-foreground">
              {rows.length === 0 ? "No wishes. Add a title over TMDB." : "No matches"}
            </div>
          ) : (
            <List
              rows={shown}
              columns={COLUMNS}
              widths={widths}
              sortKey={sort.key}
              sortBack={sort.back}
              selected={detail?.id ?? null}
              onSort={sortBy}
              onWidth={setWidth}
              onSelect={(wish) => setSelected(wish.id)}
            />
          )}
        </main>

        {/* The panel of the selected wish. */}
        <aside className="w-[340px] shrink-0 overflow-auto border-l border-hair-8 bg-glass-2 p-4 text-[12px] scroll-thin">
          {detail ? (
            <Panel
              key={detail.id}
              wish={detail}
              onTarget={(target, note) => void applyTarget(detail.id, target, note)}
              onRemove={() => void remove(detail.id)}
            />
          ) : (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-muted-foreground">
                Details
              </div>
              <p className="text-[11px] leading-[1.5] text-muted-foreground">
                Kein Wunsch gewählt. Wähle einen Eintrag, um Ziel, Bibliothek und die Treffer im
                Catalog zu sehen.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Counts of the states, the count of fitting wishes, the library stand and the last failure. */}
      <div className="flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t border-hair-8 px-3 text-[11px] text-muted-foreground">
        <span className="shrink-0 tabular-nums">
          {shown.length} shown – {counts.open} open – {counts.part} partial – {counts.done} done
        </span>
        <span className="shrink-0 tabular-nums">{fitting} with a release that fits</span>
        <span className="ml-auto shrink-0 truncate">
          {data.scannedAt
            ? `library scan ${new Date(data.scannedAt).toLocaleString()}`
            : "no library scan yet"}
        </span>
        {notice && (
          <span className="flex min-w-0 shrink items-center gap-1 truncate text-err">
            {notice}
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice(null)}>
              <X className="size-3" />
            </button>
          </span>
        )}
      </div>

      {/* The add dialog. */}
      {adding && (
        <AddWish
          known={rows}
          onClose={() => setAdding(false)}
          onAdded={(picked) => {
            setAdding(false);
            setAdded({ tmdbId: picked.tmdbId, kind: picked.kind });
            refresh();
          }}
        />
      )}
    </div>
  );
}
