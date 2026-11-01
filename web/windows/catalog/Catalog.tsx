import type { Release, ReleaseFilter } from "@shared/types/catalog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { useWindows } from "@web/shell/window-context";
import { useMemo, useState } from "react";
import { catalogApi } from "./api";
import { CategoryNav } from "./CategoryNav";
import { loadWidths, saveWidths, searchHit, sortValue } from "./columns";
import { DetailColumn } from "./DetailColumn";
import { FilterBar } from "./FilterBar";
import { activeCount, axisValues, matches } from "./filters";
import { ReleaseList, type Sort } from "./ReleaseList";

// The look every small button in the header row shares.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";

/**
 * The catalogue: category and forum nav, the release list under filter, search and
 * sort, and the detail column of the selected row.
 */
export default function Catalog() {
  const windows = useWindows();
  const client = useQueryClient();

  // One piece of state per control of the window.
  const [category, setCategory] = useState("Filme");
  const [forum, setForum] = useState<number | null>(null);
  const [filter, setFilter] = useState<ReleaseFilter>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const [widths, setWidths] = useState<Record<string, number>>(loadWidths);
  const [selected, setSelected] = useState<number | null>(null);
  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Categories, the rows of one category, run progress and board session.
  const categories = useQuery({
    queryKey: KEYS.catalog.categories,
    queryFn: catalogApi.categories,
  });
  const loaded = useQuery({
    queryKey: KEYS.catalog.releases(category),
    queryFn: () => catalogApi.releases(category),
  });
  const status = useQuery({ queryKey: KEYS.catalog.sync, queryFn: catalogApi.sync });
  const session = useQuery({ queryKey: KEYS.catalog.session, queryFn: catalogApi.session });

  // The unfiltered page: base of the facet values and of the count line.
  const all = loaded.data?.rows ?? [];
  // The forums of the chosen category; the picked one narrows the list by its name.
  const forums = categories.data?.categories.find((entry) => entry.name === category)?.forums ?? [];
  const forumName =
    forum === null ? null : (forums.find((entry) => entry.id === forum)?.name ?? null);
  // The facet values of the loaded page, kept while the page stays the same.
  const values = useMemo(() => axisValues(all), [all]);

  // Forum, facets and search first, then the sort of the picked column.
  const rows = useMemo(() => {
    const picked = all.filter(
      (release) =>
        (forumName === null || release.subcategory === forumName) &&
        matches(release, filter) &&
        searchHit(release, search),
    );

    return picked.sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      const order = left < right ? -1 : left > right ? 1 : 0;
      return sort.dir === "asc" ? order : -order;
    });
  }, [all, forumName, filter, search, sort]);

  // The selected row out of the filtered list, so a filter change drops the detail.
  const detail = rows.find((release) => release.threadId === selected) ?? null;
  const sync = status.data?.sync;
  const links = status.data?.links;

  // Reloads every answer of the catalog area.
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: KEYS.catalog.all });
  };

  // Column widths go to storage with every change.
  const setWidth = (key: string, value: number): void => {
    setWidths((current) => {
      const next = { ...current, [key]: value };
      saveWidths(next);
      return next;
    });
  };

  // Fetches the info file; the status line names the ftp host or the first problem.
  const info = async (release: Release): Promise<void> => {
    setNotice(null);
    setDone("Info-Datei läuft …");
    try {
      const answer = await catalogApi.info(release.threadId);
      const what = answer.host
        ? `FTP · ${answer.host}`
        : (answer.problems?.[0] ?? "Zugangsdaten gelesen");
      setDone(answer.thanks ? `Danke gegeben · ${what}` : what);
      refresh();
    } catch (cause) {
      setDone(null);
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  // Opens the download window for one thread.
  const download = (release: Release): void => {
    windows.open("download", { threadId: release.threadId, title: release.title });
  };

  // Selecting a row and opening its assign form are one gesture.
  const assign = (release: Release): void => {
    setSelected(release.threadId);
    setAssignFor(release.threadId);
  };

  // The button text says what a press would do: start a run, or stop a running one.
  const syncLabel = sync?.running ? "Synct …" : "Sync";
  const linkLabel = links?.running ? "Zuordnung stoppt …" : "Zuordnung";

  // Starts the snapshot run.
  const runSync = async (): Promise<void> => {
    setNotice(null);
    try {
      await catalogApi.startSync();
      refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  // Stops the link run while one goes, otherwise queues one.
  const runLinks = async (): Promise<void> => {
    setNotice(null);
    try {
      if (links?.running) await catalogApi.stopLink();
      else await catalogApi.link();
      refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <CategoryNav
          categories={categories.data?.categories ?? []}
          category={category}
          forum={forum}
          onPick={(name, id) => {
            setCategory(name);
            setForum(id);
            setSelected(null);
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
            <input
              className="min-w-0 flex-1 rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] outline-none focus:border-acc1/50"
              placeholder="suchen"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <FilterBar filter={filter} values={values} onChange={setFilter} />
            {(activeCount(filter) > 0 || search) && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  setFilter({});
                  setSearch("");
                }}
              >
                zurücksetzen
              </button>
            )}
            <button type="button" className={button} onClick={() => void runSync()}>
              {syncLabel}
            </button>
            <button type="button" className={button} onClick={() => void runLinks()}>
              {linkLabel}
            </button>
          </div>

          <ReleaseList
            rows={rows}
            widths={widths}
            onWidth={setWidth}
            sort={sort}
            onSort={setSort}
            selected={selected}
            onSelect={(release) => {
              setSelected(release.threadId);
              setAssignFor(null);
            }}
            actions={{
              onInfo: (release) => void info(release),
              onDownload: download,
              onAssign: assign,
            }}
          />
        </main>

        <DetailColumn
          release={detail}
          assignFor={assignFor}
          onClose={() => {
            setSelected(null);
            setAssignFor(null);
          }}
          onInfo={(release) => void info(release)}
          onDownload={download}
        />
      </div>

      {/* The bottom line: counts, the runs in flight and the board session. */}
      <div className="flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t border-hair-8 px-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {rows.length}
          {rows.length !== all.length ? ` / ${all.length}` : ""} Titel
        </span>
        {forumName && <span className="truncate">{forumName}</span>}
        {sync?.running && (
          <span className="tabular-nums">
            {sync.forum} · Seite {sync.page}/{sync.forumPages || "?"} · Forum {sync.forumsDone}/
            {sync.forumsTotal} · {sync.seen} gesehen · {sync.added} neu
          </span>
        )}
        {links?.running && (
          <span className="tabular-nums truncate">
            Zuordnung {links.linked}/{links.processed} · {links.queued} offen
          </span>
        )}
        <span className="ml-auto truncate">
          {session.data?.user
            ? `${session.data.user}${session.data.cookieSet ? " · angemeldet" : " · nicht angemeldet"}`
            : "kein Board-Zugang"}
        </span>
        {done && <span className="truncate text-acc1">{done}</span>}
        {notice && <span className="truncate text-err">{notice}</span>}
      </div>
    </div>
  );
}
