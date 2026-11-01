// File selection of one release: the ftp folder with its subfolders, the chosen
// files go to the release folder in the download folder.

import type { FtpEntry } from "@shared/types/downloads";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { useParams, useWindows } from "@web/shell/window-context";
import { useEffect, useMemo, useState } from "react";
import { downloadsApi } from "../downloads/api";
import {
  belowOf,
  bytesOf,
  durationOf,
  isArchive,
  STATE_TONE,
  STATE_WORD,
  setKey,
  speedOf,
} from "../downloads/format";

/** The states in which the release is working, so a fresh start would collide. */
const BUSY = ["listing", "downloading", "extracting", "measuring"];

// The look of the small buttons in the header rows.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";

/** The thread and the title the window was opened with. */
type Params = { threadId: number; title: string };

/** One file path in mono, truncated. */
function rowOf(entry: FtpEntry): React.JSX.Element {
  return <span className="truncate font-mono text-[11px]">{entry.path}</span>;
}

/** The ftp listing of one release grouped by folder, the picked files and the start
    button. */
export default function Download(): React.JSX.Element {
  const params = useParams<Params>();
  const windows = useWindows();
  const client = useQueryClient();
  const [picked, setPicked] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loaded = useQuery({
    queryKey: KEYS.downloads.listing(params?.threadId ?? 0),
    queryFn: () => downloadsApi.listing(params?.threadId ?? 0),
    enabled: params !== undefined,
  });

  const files = useMemo(
    () => (loaded.data?.entries ?? []).filter((entry) => !entry.directory),
    [loaded.data],
  );

  const groups = useMemo(() => {
    const byFolder = new Map<string, FtpEntry[]>();

    for (const entry of files) {
      const folder = belowOf(entry.path);
      const list = byFolder.get(folder) ?? [];
      list.push(entry);
      byFolder.set(folder, list);
    }

    return [...byFolder.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "en"))
      .map(([folder, entries]) => ({ folder, entries }));
  }, [files]);

  const all = useQuery({
    queryKey: KEYS.downloads.rows,
    queryFn: downloadsApi.rows,
    refetchInterval: 1000,
  });
  const row = all.data?.rows.find((entry) => entry.threadId === (params?.threadId ?? 0)) ?? null;

  /** Part of a path under the release folder; the rows name files that way. */
  const tailOf = (path: string): string => {
    const parts = path.split("/");
    const at = parts.indexOf(loaded.data?.folder ?? "");

    return at === -1 ? parts.slice(-2).join("/") : parts.slice(at + 1).join("/");
  };

  /** Bytes that are under the release folder for a file of the ftp list. */
  const bytesOn = (path: string): number =>
    (row?.disk ?? []).find((file) => file.path === tailOf(path))?.bytes ?? 0;

  // With the pick untouched: every file whose bytes on disk fall short of its size.
  const chosen =
    picked ??
    files
      .filter((entry) => entry.size === 0 || bytesOn(entry.path) < entry.size)
      .map((e) => e.path);

  useEffect(() => {
    if (loaded.data && !loaded.data.listed) {
      setNotice("no access data — fetch the info file in the catalog first");
    }
  }, [loaded.data]);

  if (!params) return <div />;

  const toggle = (path: string): void => {
    // An archive part goes with its volumes, a half set cannot be unpacked.
    const paths = isArchive(path)
      ? files.filter((entry) => setKey(entry.path) === setKey(path)).map((entry) => entry.path)
      : [path];
    const on = chosen.includes(path);

    setPicked(
      on ? chosen.filter((value) => !paths.includes(value)) : [...new Set([...chosen, ...paths])],
    );
  };

  // A folder line picks or drops every file it holds.
  const toggleFolder = (entries: FtpEntry[]): void => {
    const paths = entries.map((entry) => entry.path);
    const whole = paths.every((path) => chosen.includes(path));

    setPicked(
      whole
        ? chosen.filter((path) => !paths.includes(path))
        : [...chosen, ...paths.filter((path) => !chosen.includes(path))],
    );
  };

  /** Hands the picked files to the runner and closes the window. */
  const start = async (): Promise<void> => {
    setNotice(null);
    try {
      await downloadsApi.start(params.threadId, chosen);
      await client.invalidateQueries({ queryKey: KEYS.downloads.all });
      windows.close("download");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /** Runs one control call and reloads the download answers. */
  const run = async (what: () => Promise<unknown>): Promise<void> => {
    setNotice(null);
    try {
      await what();
      await client.invalidateQueries({ queryKey: KEYS.downloads.all });
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  // Sum of the picked files as the ftp server named them.
  const bytes = files
    .filter((entry) => chosen.includes(entry.path))
    .reduce((total, entry) => total + entry.size, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
        <span className="min-w-0 flex-1 truncate text-[12px]">{params.title}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {loaded.data?.folder}
        </span>
      </div>

      {/* The live line of the release: state, bytes, speed, run time and Stop. */}
      {row && (
        <div className="flex h-8 shrink-0 items-center gap-3 border-b border-hair-8 px-3 text-[11px]">
          <span className={`shrink-0 text-[11px] ${STATE_TONE[row.state]}`}>
            {STATE_WORD[row.state]}
          </span>
          <span className="font-mono text-[11px] tabular-nums">{bytesOf(row.bytesOnDisk)}</span>
          {row.speed !== null && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {speedOf(row.speed)}
            </span>
          )}
          {(BUSY.includes(row.state) || row.finishedAt !== null) && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {durationOf(row.startedAt, row.finishedAt)}
            </span>
          )}
          {row.state === "error" && row.note && (
            <span className="truncate text-err">{row.note}</span>
          )}
          {BUSY.includes(row.state) && (
            <button
              type="button"
              className={`${button} ml-auto`}
              onClick={() => void run(() => downloadsApi.stop(params.threadId))}
            >
              Stop
            </button>
          )}
        </div>
      )}

      {/* Picks over the whole listing: everything, empty, inverted, the incomplete
          set and the archive volumes. */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
        <button
          type="button"
          className={button}
          onClick={() => setPicked(files.map((entry) => entry.path))}
        >
          All
        </button>
        <button type="button" className={button} onClick={() => setPicked([])}>
          None
        </button>
        <button
          type="button"
          className={button}
          onClick={() =>
            setPicked(files.filter((entry) => !chosen.includes(entry.path)).map((e) => e.path))
          }
        >
          Invert
        </button>
        <button
          type="button"
          className={button}
          onClick={() => {
            // A file counts as whole when its bytes on disk reach its size.
            const whole = (entry: FtpEntry): boolean =>
              entry.size > 0 && bytesOn(entry.path) >= entry.size;
            const sets = new Set(
              files
                .filter((entry) => !whole(entry) && isArchive(entry.path))
                .map((entry) => setKey(entry.path)),
            );

            setPicked(
              files
                .filter((entry) => !whole(entry) || sets.has(setKey(entry.path)))
                .map((entry) => entry.path),
            );
          }}
        >
          Missing
        </button>
        <button
          type="button"
          className={button}
          onClick={() =>
            setPicked(files.filter((entry) => isArchive(entry.path)).map((e) => e.path))
          }
        >
          Archives
        </button>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
          {files.length} files
        </span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {loaded.isPending && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">reading folder …</div>
        )}
        {loaded.isError && (
          <div className="px-3 py-2 text-[11px] text-err">
            {loaded.error instanceof Error ? loaded.error.message : "folder unreadable"}
          </div>
        )}

        {/* One block per folder under the release folder. */}
        {groups.map((group) => (
          <div key={group.folder || "."}>
            <button
              type="button"
              onClick={() => toggleFolder(group.entries)}
              className="flex h-7 w-full cursor-pointer items-center gap-2 bg-glass-3 px-3 text-left transition hover:bg-white/6"
            >
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {group.folder || loaded.data?.folder}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                {group.entries.filter((entry) => chosen.includes(entry.path)).length}/
                {group.entries.length} ·{" "}
                {bytesOf(group.entries.reduce((total, entry) => total + entry.size, 0))}
              </span>
            </button>

            {group.entries.map((entry) => (
              <label
                key={entry.path}
                className="flex h-8 cursor-pointer items-center gap-2 border-b border-hair-6 px-3 hover:bg-white/4"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
                  checked={chosen.includes(entry.path)}
                  onChange={() => toggle(entry.path)}
                />
                {rowOf(entry)}
                {isArchive(entry.path) && (
                  <span className="shrink-0 rounded bg-glass-8 px-1 font-mono text-[10px] text-muted-foreground">
                    volume
                  </span>
                )}
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {bytesOf(entry.size)}
                </span>
                {bytesOn(entry.path) > 0 && (
                  <span className="shrink-0 text-[10px] text-ok">
                    {bytesOn(entry.path) === entry.size
                      ? "on disk"
                      : `${bytesOf(bytesOn(entry.path))} of ${bytesOf(entry.size)}`}
                  </span>
                )}
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="flex h-10 shrink-0 items-center gap-3 border-t border-hair-8 px-3">
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {chosen.length} files · {bytesOf(bytes)}
        </span>
        <span className="truncate text-[11px] text-err">{notice}</span>
        <button
          type="button"
          className={`${button} ml-auto border-acc1/40 bg-acc1/14 text-acc1`}
          disabled={chosen.length === 0 || (row !== null && BUSY.includes(row.state))}
          onClick={() => void start()}
        >
          {row !== null && BUSY.includes(row.state) ? "running" : "Download"}
        </button>
      </div>
    </div>
  );
}
