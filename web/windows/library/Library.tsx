import type { LibraryStand } from "@shared/types/library";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { cn } from "@web/lib/utils";
import { ArrowLeft, ArrowUp, Pencil, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { libraryApi } from "./api";
import { columnsFor } from "./columns";
import Detail from "./Detail";
import { sizeText } from "./format";
import List, { sortedRows } from "./List";
import {
  childrenOf,
  hasContents,
  indexNodes,
  type LibraryGroup,
  type LibraryNode,
  totalSize,
  trailOf,
} from "./node";
import { fuzzyHit } from "./search";
import Tree from "./Tree";

// The stand before the first answer.
const EMPTY: LibraryStand = {
  root: null,
  scannedAt: null,
  scan: {
    running: false,
    startedAt: null,
    finishedAt: null,
    folders: 0,
    files: 0,
    probed: 0,
    probeFailures: 0,
    titles: 0,
    resolved: 0,
    error: null,
  },
  roots: [],
};

// The storage slot of the column widths.
const WIDTH_KEY = "library.spalten";

// The look of the small icon buttons.
const ICON_BUTTON =
  "cursor-pointer rounded-lg border border-hair-8 bg-glass-3 p-1.5 transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";

// The column widths come back from storage, so a reopened window keeps them.
function savedWidths(): Record<string, number> {
  const stored = localStorage.getItem(WIDTH_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as Record<string, number>;
  } catch {
    return {};
  }
}

export default function LibraryView() {
  const client = useQueryClient();
  const stand = useQuery({ queryKey: KEYS.library.stand, queryFn: libraryApi.stand });

  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  // Why the last folder was refused; the draft stays while it stands.
  const [problem, setProblem] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "name", back: false });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const [widths, setWidths] = useState<Record<string, number>>(savedWidths);

  const data = stand.data ?? EMPTY;

  // The configured folder is a node of its own: its groups stand at the top of the
  // tree, a click into the tree stays free.
  const top = useMemo<LibraryGroup | null>(() => {
    if (data.root === null || data.roots.length === 0) return null;
    const parts = data.root.split("/").filter(Boolean);

    return {
      type: "root-folder",
      name: parts.at(-1) ?? data.root,
      path: "",
      children: data.roots,
    };
  }, [data.root, data.roots]);

  const tree = useMemo<LibraryNode[]>(() => (top ? [top] : data.roots), [top, data.roots]);
  const index = useMemo(() => indexNodes(tree), [tree]);

  // A rescan replaces the paths, so an unknown path falls back to the top.
  const opened = (openedPath ? index.byPath.get(openedPath) : undefined) ?? tree[0] ?? null;
  const selected = (selectedPath ? index.byPath.get(selectedPath) : undefined) ?? opened;

  // Only folders that hold a file somewhere below count as entries.
  const kids = opened ? childrenOf(opened).filter((child) => hasContents(child)) : [];
  const rows = useMemo(() => {
    const wanted = search.trim();
    const found = wanted ? kids.filter((node) => fuzzyHit(node.name, wanted)) : kids;
    return sortedRows(found, sort.key, sort.back);
  }, [kids, search, sort]);

  const columns = columnsFor(kids);

  const rootInput = useRef<HTMLInputElement>(null);

  // The path field appears with the pencil, so the focus arrives by hand.
  useEffect(() => {
    if (draft !== null) rootInput.current?.focus();
  }, [draft]);

  // The configured folder and its groups start open; below that the caret
  // decides.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || tree.length === 0) return;
    seeded.current = true;
    setExpanded(new Set(tree.map((node) => node.path)));
  }, [tree]);

  // The bar describes the opened folder: how many entries it holds and how big
  // it is.
  const statusLine = (): string => {
    if (!opened) return "leer";
    return `${kids.length} Einträge · ${sizeText(totalSize(opened))}`;
  };

  /** Opens a folder and pushes the previous one on the history. */
  const open = (node: LibraryNode): void => {
    if (node.type === "file") return;
    if (opened && opened.path !== node.path) setHistory((older) => [...older, opened.path]);
    setOpenedPath(node.path);
    setSelectedPath(node.path);
  };

  /** The folder above the opened one. */
  const above = opened ? (index.parent.get(opened.path) ?? null) : null;

  /** Steps one level up. */
  const goUp = (): void => {
    if (above) open(above);
  };

  /** Pops the last folder off the history. */
  const goBack = (): void => {
    const previous = history.at(-1);
    if (previous === undefined) return;
    setHistory(history.slice(0, -1));
    setOpenedPath(previous);
    setSelectedPath(previous);
  };

  /** Opens or closes one branch of the tree. */
  const toggle = (path: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  /** Keeps a dragged column width in storage. */
  const resize = (key: string, width: number): void => {
    setWidths((current) => {
      const next = { ...current, [key]: width };
      localStorage.setItem(WIDTH_KEY, JSON.stringify(next));
      return next;
    });
  };

  /** The same key flips direction, a new key starts forward. */
  const sortBy = (key: string): void => {
    setSort((current) =>
      current.key === key ? { ...current, back: !current.back } : { key, back: false },
    );
  };

  /** Starts a pass and reloads the stand. */
  const rescan = (): void => {
    void libraryApi.scan().then(() => {
      void client.invalidateQueries({ queryKey: KEYS.library.all });
    });
  };

  /** Writes the folder; a refusal keeps the draft and shows its reason. */
  const saveRoot = (): void => {
    const wanted = (draft ?? data.root ?? "").trim();
    if (!wanted.startsWith("/")) return;

    void libraryApi.root(wanted).then((answer) => {
      if ("error" in answer) {
        setProblem(answer.error);
        return;
      }

      setProblem("");
      setDraft(null);
      void client.invalidateQueries({ queryKey: KEYS.library.all });
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        {/* The folder tree. */}
        <aside className="w-[230px] shrink-0 overflow-auto border-r border-hair-8 bg-glass-2 scroll-thin">
          <Tree
            roots={tree}
            expanded={expanded}
            openedPath={opened?.path ?? null}
            selectedPath={selected?.path ?? null}
            onOpen={open}
            onToggle={toggle}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Back, up, the path of the opened folder, search and the rescan button. */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
            <button
              type="button"
              aria-label="zurück"
              title="zurück"
              className={ICON_BUTTON}
              onClick={goBack}
              disabled={history.length === 0}
            >
              <ArrowLeft className="size-3" />
            </button>
            <button
              type="button"
              aria-label="eine Ebene hoch"
              title="eine Ebene hoch"
              className={ICON_BUTTON}
              onClick={goUp}
              disabled={above === null}
            >
              <ArrowUp className="size-3" />
            </button>
            <span className="max-w-[300px] min-w-0 truncate text-[12px] text-muted-foreground">
              {opened
                ? trailOf(opened, index)
                    .map((part) => part.name)
                    .join(" / ")
                : ""}
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="suchen"
              className="min-w-0 flex-1 rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] outline-none focus:border-acc1/50"
            />
            <button
              type="button"
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8",
                data.scan.running && "text-acc1",
              )}
              onClick={rescan}
              disabled={data.scan.running}
            >
              <RefreshCw className={cn("size-3", data.scan.running && "animate-spin")} />
              {data.scan.running ? "scannt" : "neu scannen"}
            </button>
          </div>

          {/* The rows of the opened folder, one of five states. */}
          <div className="flex min-h-0 flex-1 flex-col">
            {stand.isPending ? (
              <div className="p-3 text-[12px] text-muted-foreground">Stand wird geladen …</div>
            ) : stand.isError ? (
              <div className="p-3 text-[12px] text-err">{String(stand.error.message)}</div>
            ) : data.root === null ? (
              <div className="p-3 text-[12px] text-muted-foreground">
                Kein Bibliothekspfad gesetzt. Pfad unten über das Stift-Symbol setzen.
              </div>
            ) : data.roots.length === 0 ? (
              <div className="p-3 text-[12px] text-muted-foreground">Keine Bibliothek gefunden</div>
            ) : rows.length === 0 ? (
              <div className="p-3 text-[12px] text-muted-foreground">Keine Treffer</div>
            ) : (
              <List
                rows={rows}
                columns={columns}
                sortKey={sort.key}
                sortBack={sort.back}
                selectedPath={selected?.path ?? null}
                widths={widths}
                onSort={sortBy}
                onSelect={(node) => setSelectedPath(node.path)}
                onOpen={open}
                onResize={resize}
              />
            )}
          </div>
        </main>

        {/* The detail column of the selected node. */}
        <aside className="w-[356px] shrink-0 overflow-auto border-l border-hair-8 bg-glass-2 scroll-thin">
          <Detail node={selected} index={index} />
        </aside>
      </div>

      {/* Counts of the last pass and the field for the library folder. */}
      <div className="flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t border-hair-8 px-3 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{statusLine()}</span>
        {data.scan.error && (
          <span className="min-w-0 truncate text-err">Fehler: {data.scan.error}</span>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-3">
          {data.scan.startedAt !== null && (
            <span className="shrink-0 tabular-nums">
              {data.scan.folders} Ordner · {data.scan.files} Dateien · {data.scan.probed} geprüft ·{" "}
              {data.scan.resolved}/{data.scan.titles} Titel
            </span>
          )}

          {draft === null ? (
            <div className="flex min-w-0 items-center gap-1">
              <span className="max-w-[300px] min-w-0 truncate" title={data.root ?? ""}>
                {data.root ?? "kein Pfad"}
              </span>
              <button
                type="button"
                aria-label="Pfad ändern"
                title="Pfad ändern"
                className="shrink-0 cursor-pointer rounded p-1 transition hover:bg-white/8 hover:text-acc1"
                onClick={() => setDraft(data.root ?? "")}
              >
                <Pencil className="size-3" />
              </button>
            </div>
          ) : (
            <form
              className="flex min-w-0 items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                saveRoot();
              }}
            >
              <input
                ref={rootInput}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setDraft(null);
                }}
                placeholder="/pfad/zur/bibliothek"
                className="w-72 min-w-0 rounded border border-hair-8 bg-glass-3 px-2 py-0.5 text-[11px] outline-none focus:border-acc1/50"
              />
              {problem !== "" && (
                <span className="shrink-0 text-[10px] text-muted-foreground" title={problem}>
                  {problem}
                </span>
              )}
              <button
                type="submit"
                className="shrink-0 cursor-pointer rounded border border-hair-8 bg-glass-3 px-2 py-0.5 text-[11px] transition hover:bg-white/8"
              >
                übernehmen
              </button>
              <button
                type="button"
                className="shrink-0 cursor-pointer rounded border border-hair-8 bg-glass-3 px-2 py-0.5 text-[11px] transition hover:bg-white/8"
                onClick={() => setDraft(null)}
              >
                abbrechen
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
