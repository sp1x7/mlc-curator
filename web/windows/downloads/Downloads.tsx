// The Downloads window: releases on the left, the files of the chosen release
// on the right. Bytes, tempo and rest time come over the rows, the size of each
// file over the ftp listing of that release.

import type { DownloadRow } from "@shared/types/downloads";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { useWindows } from "@web/shell/window-context";
import { ContextMenu } from "@web/ui/context-menu";
import { settingsApi } from "@web/windows/settings/api";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadsApi } from "./api";
import {
  BUSY,
  belowOf,
  bytesOf,
  clockOf,
  durationOf,
  episodeLabel,
  fileWord,
  nameOf,
  STATE_TONE,
  STATE_WORD,
  seasonLabel,
  shareOf,
  speedOf,
} from "./format";
import { Section, TmdbCard, Zeile } from "./parts";

// The look of the small buttons of this window.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";

// The button that carries the main action.
const primary = `${button} border-acc1/40 bg-acc1/14 text-acc1 hover:bg-acc1/22`;

/** Where the context menu opened and the release it belongs to. */
type Menu = { x: number; y: number; threadId: number };

// The input look inside the settings menu.
const field =
  "h-6 shrink-0 rounded-md border border-hair-8 bg-glass-3 px-1.5 font-mono text-[11px] text-foreground outline-none focus:border-acc1/50";

/** One line of the settings menu: word on the left, control on the right. */
function Row({
  label,
  unit,
  children,
}: {
  label: string;
  unit?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex h-7 items-center gap-2">
      <span className="w-40 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {children}
      {unit && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{unit}</span>}
    </div>
  );
}

/** One numeric setting: digits only, written when the field leaves focus. */
function NumberInput({
  valueKey,
  values,
  save,
}: {
  valueKey: string;
  values: Record<string, string>;
  save: (key: string, value: string) => void;
}): React.JSX.Element {
  const stored = values[valueKey] ?? "";
  const [text, setText] = useState(stored);

  useEffect(() => setText(stored), [stored]);

  return (
    <input
      value={text}
      inputMode="numeric"
      onChange={(event) => setText(event.target.value.replace(/[^0-9]/g, ""))}
      onBlur={() => {
        if (text !== stored) save(valueKey, text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={`${field} w-16 text-right tabular-nums`}
    />
  );
}

/** One switch setting: a stored "1" reads as on, a press writes the other word. */
function Check({
  valueKey,
  values,
  save,
}: {
  valueKey: string;
  values: Record<string, string>;
  save: (key: string, value: string) => void;
}): React.JSX.Element {
  const on = (values[valueKey] ?? "0") === "1";

  return (
    <input
      type="checkbox"
      checked={on}
      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--primary)]"
      onChange={() => save(valueKey, on ? "0" : "1")}
    />
  );
}

/** The download settings, opened over the button that names them. */
function SettingsMenu({
  anchor,
  values,
  save,
  onClose,
}: {
  anchor: DOMRect;
  values: Record<string, string>;
  save: (key: string, value: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  useEffect(() => {
    const away = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-settings]")) return;

      onClose();
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);

    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const folder = values.download_folder ?? "";
  const [text, setText] = useState(folder);

  useEffect(() => setText(folder), [folder]);

  // The menu sits over the button that opens it; it is placed once its own
  // size is known so it stays inside the screen.
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const node = box.current;
    if (node === null) return;

    const left = Math.min(Math.max(8, anchor.left), window.innerWidth - node.offsetWidth - 8);

    let top = anchor.top - node.offsetHeight - 6;
    if (top < 8) top = Math.max(8, window.innerHeight - node.offsetHeight - 8);

    setPlace({ left, top });
  }, [anchor]);

  return createPortal(
    <div
      data-settings=""
      ref={box}
      className="scroll-thin fixed z-[9600] max-h-[calc(100vh-16px)] w-[23rem] overflow-y-auto rounded-xl border border-hair-12 bg-window px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-[14px]"
      style={{
        left: place?.left ?? anchor.left,
        top: place?.top ?? anchor.top,
        visibility: place === null ? "hidden" : "visible",
      }}
    >
      <div className="mb-1 flex h-6 items-center gap-2">
        <span className="label text-muted-foreground">Download settings</span>
        <button type="button" className={`${button} ml-auto`} onClick={onClose}>
          Close
        </button>
      </div>

      <Row label="Download folder">
        <input
          value={text}
          spellCheck={false}
          placeholder={values.download_folder ?? "data/downloads"}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            if (text !== folder) save("download_folder", text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className={`${field} min-w-0 flex-1`}
        />
      </Row>

      <div className="my-1.5 border-t border-hair-8" />

      <Row label="Files at once">
        <NumberInput valueKey="download_max_parallel" values={values} save={save} />
      </Row>
      <Row label="Speed, all files" unit="KB/s">
        <NumberInput valueKey="download_speed_total_kb" values={values} save={save} />
      </Row>
      <Row label="Speed, per file" unit="KB/s">
        <NumberInput valueKey="download_speed_per_kb" values={values} save={save} />
      </Row>
      <Row label="Tries, per file">
        <NumberInput valueKey="download_retries_file" values={values} save={save} />
      </Row>
      <Row label="Tries, per release">
        <NumberInput valueKey="download_retries_total" values={values} save={save} />
      </Row>
      <Row label="Wait, after a try" unit="s">
        <NumberInput valueKey="download_retry_delay_file" values={values} save={save} />
      </Row>
      <Row label="Wait, after a stop" unit="s">
        <NumberInput valueKey="download_retry_delay_total" values={values} save={save} />
      </Row>

      <div className="my-1.5 border-t border-hair-8" />

      <Row label="Unpack the archives">
        <Check valueKey="rar_auto_extract" values={values} save={save} />
      </Row>
      <Row label="Delete the archives">
        <Check valueKey="rar_delete_extracted" values={values} save={save} />
      </Row>
      <Row label="Empty folder after organize">
        <Check valueKey="prune_empty_source" values={values} save={save} />
      </Row>
      <Row label="Continue when the app starts">
        <Check valueKey="download_resume" values={values} save={save} />
      </Row>
    </div>,
    document.body,
  );
}

/** Thin bar of a release row or of a file line. */
function Bar({ share, tone }: { share: number; tone: string }): React.JSX.Element {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-glass-3">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </div>
  );
}

function toneOf(row: DownloadRow): string {
  if (row.organizedAt) return "bg-ok";
  if (row.state === "error") return "bg-err";
  if (row.state === "stopped") return "bg-wrn";

  return "bg-acc1";
}

/** Bytes that have come in against the bytes the ftp server names. */
function partOf(row: DownloadRow): number {
  if (row.organizedAt) return 1;

  return row.bytesWanted && row.bytesWanted > 0
    ? Math.min(1, row.bytesOnDisk / row.bytesWanted)
    : 0;
}

// The storage slot of the dragged file-table widths.
const HEAD_KEY = "mlc.downloads.columns";

/** The columns of the file table: label, width before a drag and its floor. */
const HEADS: Array<{ key: string; label: string; initial: number | null; min: number }> = [
  { key: "file", label: "File", initial: null, min: 150 },
  { key: "episode", label: "Episode", initial: 140, min: 70 },
  { key: "resolution", label: "Resolution", initial: 84, min: 56 },
  { key: "codec", label: "Codec", initial: 66, min: 44 },
  { key: "runtime", label: "Runtime", initial: 68, min: 48 },
  { key: "audio", label: "Audio", initial: 116, min: 60 },
  { key: "size", label: "Size", initial: 82, min: 52 },
  { key: "progress", label: "Progress", initial: 116, min: 70 },
  { key: "state", label: "State", initial: 96, min: 60 },
];

/** Releases at the left, the files of the chosen one in the middle, tmdb and probe
 *  detail at the right. */
export default function Downloads(): React.JSX.Element {
  const client = useQueryClient();
  const windows = useWindows();
  const [selected, setSelected] = useState<number | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [options, setOptions] = useState<DOMRect | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  // Rows come once a second; the running ones and the waiting ones drive the two
  // bulk buttons.
  const loaded = useQuery({
    queryKey: KEYS.downloads.rows,
    queryFn: downloadsApi.rows,
    refetchInterval: 1000,
  });

  const rows = loaded.data?.rows ?? [];
  const running = rows.filter((row) => BUSY.includes(row.state));
  const waiting = rows.filter((row) => !BUSY.includes(row.state) && row.organizedAt === null);

  // The first row takes the selection while the list is untouched.
  useEffect(() => {
    if (selected === null && rows.length > 0) setSelected(rows[0]?.threadId ?? null);
  }, [rows, selected]);

  // A new release drops the picked file line.
  useEffect(() => {
    if (selected !== null) setPicked(null);
  }, [selected]);

  const row = rows.find((entry) => entry.threadId === selected) ?? null;

  // The ftp listing of the chosen release.
  const listed = useQuery({
    queryKey: KEYS.downloads.listing(row?.threadId ?? 0),
    queryFn: () => downloadsApi.listing(row?.threadId ?? 0),
    enabled: row !== null,
  });

  // tmdb data and probe measurements of the chosen release.
  const deeper = useQuery({
    queryKey: KEYS.downloads.detail(row?.threadId ?? 0),
    queryFn: () => downloadsApi.detail(row?.threadId ?? 0),
    enabled: row !== null,
  });

  // tmdb and ffprobe are read again when the release moves a step further.
  const step = row === null ? null : `${row.threadId}/${row.state}`;

  useEffect(() => {
    if (step === null) return;

    void client.invalidateQueries({ queryKey: KEYS.downloads.all });
  }, [client, step]);

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

  const stored = useQuery({ queryKey: KEYS.settings.values, queryFn: settingsApi.values });
  const values = stored.data?.values ?? {};

  /** Writes one settings key and reloads the settings answers. */
  const saveSetting = (key: string, value: string): void => {
    void run(async () => {
      await settingsApi.save({ values: { [key]: value } });
      await client.invalidateQueries({ queryKey: KEYS.settings.all });
    });
  };

  // The files of the listing, the set the row picked, and their byte sum.
  const entries = listed.data?.entries ?? [];
  const chosen = new Set(row?.files ?? []);
  const wantedBytes = entries
    .filter((entry) => !entry.directory && chosen.has(entry.path))
    .reduce((total, entry) => total + entry.size, 0);

  // The byte base of the bar: the picked sum, otherwise what ftp named. The rest
  // time counts from the bytes left.
  const total = wantedBytes > 0 ? wantedBytes : (row?.bytesWanted ?? 0);
  const speed = row?.speed ?? null;
  const missing = total > 0 ? Math.max(0, total - (row?.bytesOnDisk ?? 0)) : 0;

  /** Part of a path under the release folder: ftp and disk name files that way. */
  const tailOf = (path: string): string => {
    const parts = path.split("/");
    const at = parts.indexOf(row?.folder ?? "");

    return at === -1 ? parts.slice(-2).join("/") : parts.slice(at + 1).join("/");
  };

  // The measured line of a file path, the disk name matched against the videos.
  const videoOf = (path: string | null) =>
    path === null
      ? null
      : ((deeper.data?.videos ?? []).find((entry) => entry.path === tailOf(path)) ?? null);

  // The tmdb episode whose file list carries this path.
  const episodeFor = (path: string | null) =>
    path === null
      ? undefined
      : (deeper.data?.episodes ?? []).find((entry) => entry.files.includes(tailOf(path)));

  /** Episode the file names, taken from the tmdb lookup of the release. */
  const episodeOf = (path: string): string | null => {
    const found = episodeFor(path);

    if (found === undefined) return null;

    return `${episodeLabel(found.season, found.episode)} ${found.name ?? ""}`.trim();
  };

  // The probe of a path, null for an unmeasured one.
  const probeOf = (path: string) => videoOf(path)?.probe ?? null;

  /** The ftp line of a file the tmdb lookup names. */
  const foundOf = (path: string) =>
    entries.find((entry) => entry.path === path || tailOf(entry.path) === path) ?? null;

  /** Bytes of the episode files on the disk against the bytes ftp names. */
  const markOf = (paths: string[]): { word: string; whole: boolean } => {
    const here = paths.map(foundOf).filter((entry) => entry !== null);

    if (here.length === 0) return { word: "—", whole: false };

    if (here.every((entry) => entry.size > 0 && entry.bytesOnDisk >= entry.size))
      return { word: "✓", whole: true };

    const got = here.reduce((total, entry) => total + entry.bytesOnDisk, 0);
    const want = here.reduce((total, entry) => total + entry.size, 0);

    return {
      word: want > 0 ? `${bytesOf(got)} / ${bytesOf(want)}` : bytesOf(got),
      whole: false,
    };
  };

  /** The file lines: the release folder names them, ftp adds the sizes. */
  const shown = (() => {
    type Line = { path: string; bytes: number; size: number; ftp: boolean };
    const byTail = new Map<string, Line>();

    for (const file of row?.disk ?? [])
      byTail.set(file.path, { path: file.path, bytes: file.bytes, size: file.bytes, ftp: false });

    for (const entry of entries) {
      if (entry.directory) continue;

      const tail = tailOf(entry.path);
      const known = byTail.get(tail);

      byTail.set(tail, {
        path: known?.path ?? entry.path,
        bytes: Math.max(known?.bytes ?? 0, entry.bytesOnDisk),
        size: entry.size > 0 ? entry.size : (known?.size ?? 0),
        ftp: true,
      });
    }

    return [...byTail.values()].sort((a, b) => a.path.localeCompare(b.path, "en"));
  })();

  /** Chosen file, by the ftp path or by the name the folder gives it. */
  const pickedIn = (path: string): boolean =>
    (row?.files ?? []).some((file) => tailOf(file) === tailOf(path));

  /** Column widths of the file table, read once from storage. */
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const kept = localStorage.getItem(HEAD_KEY);
      return kept === null ? {} : (JSON.parse(kept) as Record<string, number>);
    } catch {
      return {};
    }
  });

  // Every change of a width goes back to storage.
  useEffect(() => {
    localStorage.setItem(HEAD_KEY, JSON.stringify(widths));
  }, [widths]);

  /** The head of one column, for its label and its floor. */
  const headOf = (key: string) => HEADS.find((head) => head.key === key);

  /** The width a column has: the dragged one, otherwise the initial of its head. */
  const widthOf = (key: string): number | null => {
    const kept = widths[key];
    return typeof kept === "number" ? kept : (headOf(key)?.initial ?? null);
  };

  /** A column with a width keeps it, a column without one grows over the rest. */
  const cellOf = (key: string): React.CSSProperties => {
    const width = widthOf(key);

    return width === null
      ? { flexGrow: 1, minWidth: headOf(key)?.min ?? 60 }
      : { width, flexShrink: 0 };
  };

  /** Widths of all columns: the table scrolls when the window grows thinner. */
  const minTotal = HEADS.reduce((total, head) => total + (widthOf(head.key) ?? head.min), 0);

  /** Drags one column width, held at the floor of its head. */
  const startResize = (event: React.MouseEvent, key: string): void => {
    event.preventDefault();

    const from = event.clientX;
    const begin = widthOf(key) ?? 120;
    const min = headOf(key)?.min ?? 60;

    const move = (next: MouseEvent): void => {
      setWidths((previous) => ({ ...previous, [key]: Math.max(min, begin + next.clientX - from) }));
    };

    const end = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  };

  // The measurement and the episode of the picked file line.
  const video = videoOf(picked);
  const episode = episodeFor(picked);

  /** The words that fit the picked file: its episode, its season, the series. */
  const described =
    episode?.overview ?? deeper.data?.info.seasonOverview ?? deeper.data?.info.overview ?? null;

  const describedBy =
    episode !== undefined
      ? `Episode ${episodeLabel(episode.season, episode.episode)}`
      : deeper.data !== undefined && deeper.data.info.season !== null
        ? `Season ${seasonLabel(deeper.data.info.season)}`
        : "Series";

  const stoppable = row !== null && BUSY.includes(row.state);

  return (
    <div className="flex h-full min-h-0">
      {/* The release list: state, bytes, speed and progress bar per row. */}
      <aside className="flex w-[19rem] shrink-0 flex-col border-r border-hair-8">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
          <span className="label text-muted-foreground">Downloads</span>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {rows.length}
          </span>
          <button
            type="button"
            className={`${button} ml-auto`}
            disabled={running.length === 0}
            onClick={() =>
              void run(() => Promise.all(running.map((entry) => downloadsApi.stop(entry.threadId))))
            }
          >
            Stop all
          </button>
          <button
            type="button"
            className={button}
            disabled={waiting.length === 0}
            onClick={() =>
              void run(() =>
                Promise.all(waiting.map((entry) => downloadsApi.resume(entry.threadId))),
              )
            }
          >
            Start all
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {loaded.isError && (
            <div className="px-3 py-2 text-[11px] text-err">
              {loaded.error instanceof Error ? loaded.error.message : "rows unreadable"}
            </div>
          )}

          {!loaded.isError && rows.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="label text-muted-foreground">nothing loaded</span>
            </div>
          )}

          {rows.map((entry) => {
            const share = partOf(entry);

            return (
              <button
                key={entry.threadId}
                type="button"
                onClick={() => setSelected(entry.threadId)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setSelected(entry.threadId);
                  setMenu({ x: event.clientX, y: event.clientY, threadId: entry.threadId });
                }}
                className={`block w-full cursor-pointer border-b border-hair-6 px-3 py-2 text-left transition hover:bg-white/4 ${
                  entry.threadId === selected ? "bg-acc1/10" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px]">{entry.title}</span>
                  {BUSY.includes(entry.state) && entry.speed !== null && (
                    <span className="shrink-0 font-mono text-[10px] text-acc1 tabular-nums">
                      {speedOf(entry.speed)}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <span className={`shrink-0 text-[10px] ${STATE_TONE[entry.state]}`}>
                    {STATE_WORD[entry.state]}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {bytesOf(entry.bytesOnDisk)}
                    {entry.bytesWanted ? ` / ${bytesOf(entry.bytesWanted)}` : ""}
                  </span>
                </div>

                <div className="mt-1.5">
                  <Bar share={share} tone={toneOf(entry)} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex h-7 shrink-0 items-center gap-2 border-t border-hair-8 px-3">
          <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
            {loaded.data?.root}
          </span>
          <button
            type="button"
            className={`${button} ml-auto`}
            onClick={(event) =>
              setOptions(options === null ? event.currentTarget.getBoundingClientRect() : null)
            }
          >
            Settings
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {row === null ? (
          <div className="flex h-full items-center justify-center">
            <span className="label text-muted-foreground">no release chosen</span>
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-9 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
                  <span className="min-w-0 truncate font-mono text-[11px]">{row.folder}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {row.files.length} file{row.files.length === 1 ? "" : "s"} ·{" "}
                    {bytesOf(row.bytesOnDisk)}
                  </span>

                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {row.organizedAt === null && (
                      <button
                        type="button"
                        className={button}
                        onClick={() =>
                          void run(
                            stoppable
                              ? () => downloadsApi.stop(row.threadId)
                              : () => downloadsApi.resume(row.threadId),
                          )
                        }
                      >
                        {stoppable ? "Stop" : "Resume"}
                      </button>
                    )}

                    <button
                      type="button"
                      className={button}
                      onClick={() =>
                        windows.open("download", { threadId: row.threadId, title: row.title })
                      }
                    >
                      Choose files
                    </button>

                    <button
                      type="button"
                      className={primary}
                      onClick={() => windows.open("organize", { threadId: row.threadId })}
                    >
                      Organize
                    </button>
                  </div>
                </div>

                <div className="flex h-9 shrink-0 items-center gap-3 border-b border-hair-8 px-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="w-40 shrink-0 font-mono text-[11px] tabular-nums">
                      {bytesOf(row.bytesOnDisk)}
                      {total > 0 ? ` of ${bytesOf(total)}` : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Bar share={partOf(row)} tone={toneOf(row)} />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                      {total > 0 ? `${Math.round(partOf(row) * 100)}%` : "—"}
                    </span>
                  </div>

                  <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums">
                    {speed === null ? "—" : speedOf(speed)}
                  </span>

                  <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {speed !== null && speed > 0 && missing > 0
                      ? `${clockOf(missing / speed)} left`
                      : "—"}
                  </span>

                  <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {BUSY.includes(row.state) || row.finishedAt !== null
                      ? (durationOf(row.startedAt, row.finishedAt) ?? "—")
                      : "—"}
                  </span>
                </div>

                {/* One line per file: the folder names it, ftp adds the size. */}
                <div className="scroll-thin min-h-0 flex-1 overflow-auto">
                  <div style={{ minWidth: minTotal }} className="min-w-full">
                    <div className="sticky top-0 z-10 flex h-7 items-center border-b border-hair-8 bg-window px-3">
                      {HEADS.map((head) => (
                        <div
                          key={head.key}
                          style={cellOf(head.key)}
                          className="flex items-center border-r border-hair-8 last:border-r-0"
                        >
                          <span className="label min-w-0 flex-1 truncate px-1.5 text-left text-muted-foreground">
                            {head.label}
                          </span>
                          <button
                            type="button"
                            aria-label={`${head.label} width`}
                            onMouseDown={(event) => startResize(event, head.key)}
                            className="h-3 w-[6px] shrink-0 cursor-col-resize rounded-[2px] hover:bg-acc1/70"
                          />
                        </div>
                      ))}
                    </div>
                    {listed.isPending && (
                      <div className="px-3 py-2 text-[11px] text-muted-foreground">
                        reading folder …
                      </div>
                    )}

                    {listed.isError && (
                      <div className="px-3 py-2 text-[11px] text-err">
                        {listed.error instanceof Error ? listed.error.message : "folder unreadable"}
                      </div>
                    )}

                    {shown.map((entry) => {
                      const share = shareOf(entry.bytes, entry.size);
                      const probe = probeOf(entry.path);

                      return (
                        <button
                          type="button"
                          key={entry.path}
                          onClick={() => setPicked(entry.path)}
                          className={`flex h-10 w-full cursor-pointer items-center border-b border-hair-6 px-3 text-left hover:bg-white/4 ${
                            picked === entry.path ? "bg-acc1/10" : ""
                          }`}
                        >
                          <div style={cellOf("file")} className="min-w-0">
                            <div className="truncate font-mono text-[11px]">
                              {nameOf(entry.path)}
                            </div>
                            {belowOf(entry.path) !== "" && (
                              <div className="truncate font-mono text-[10px] text-muted-foreground">
                                {belowOf(entry.path)}
                              </div>
                            )}
                          </div>

                          <div
                            style={cellOf("episode")}
                            className="truncate px-1.5 font-mono text-[10px]"
                          >
                            {episodeOf(entry.path) ?? ""}
                          </div>

                          <div
                            style={cellOf("resolution")}
                            className="truncate px-1.5 font-mono text-[10px] tabular-nums"
                          >
                            {probe !== null && probe.height !== null ? `${probe.height}p` : ""}
                          </div>

                          <div
                            style={cellOf("codec")}
                            className="truncate px-1.5 font-mono text-[10px]"
                          >
                            {probe?.videoCodec ?? ""}
                          </div>

                          <div
                            style={cellOf("runtime")}
                            className="truncate px-1.5 font-mono text-[10px] tabular-nums"
                          >
                            {probe?.runtimeMinutes ? `${probe.runtimeMinutes}m` : ""}
                          </div>

                          <div
                            style={cellOf("audio")}
                            className="truncate px-1.5 font-mono text-[10px] text-muted-foreground"
                          >
                            {probe === null
                              ? ""
                              : probe.audio
                                  .map((track) => track.language ?? track.codec)
                                  .filter(Boolean)
                                  .join(" ")}
                          </div>

                          <div
                            style={cellOf("size")}
                            className="truncate px-1.5 text-right font-mono text-[10px] tabular-nums"
                          >
                            {bytesOf(entry.size)}
                          </div>

                          <div
                            style={cellOf("progress")}
                            className="flex items-center gap-1 px-1.5"
                          >
                            <div className="flex-1">
                              <Bar
                                share={share}
                                tone={
                                  share >= 1
                                    ? "bg-ok"
                                    : pickedIn(entry.path)
                                      ? "bg-acc1"
                                      : "bg-white/25"
                                }
                              />
                            </div>
                            <span className="w-8 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                              {entry.size > 0 ? `${Math.round(share * 100)}%` : "—"}
                            </span>
                          </div>

                          <div
                            style={cellOf("state")}
                            className={`truncate px-1.5 text-right text-[10px] ${
                              chosen.has(entry.path)
                                ? "text-muted-foreground"
                                : "text-muted-foreground/60"
                            }`}
                          >
                            {entry.ftp
                              ? fileWord(entry.bytes, entry.size, pickedIn(entry.path))
                              : "from disk"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* tmdb card, episode table and the measurement of the picked line. */}
              <aside className="scroll-thin w-[340px] shrink-0 overflow-auto border-l border-hair-8 bg-glass-2 p-4 text-[12px]">
                {deeper.data === undefined ? (
                  <div className="text-[11px] text-muted-foreground">reading tmdb …</div>
                ) : (
                  <>
                    <div className="mb-1.5 text-[10px] tracking-[1px] text-muted-foreground uppercase">
                      {STATE_WORD[row.state]}
                    </div>

                    <h2 className="text-[20px] leading-tight font-bold break-words">
                      {deeper.data.info.title ?? row.title}
                    </h2>

                    <TmdbCard
                      info={deeper.data.info}
                      description={
                        described === null ? null : { label: describedBy, text: described }
                      }
                    />

                    <Section title="Board">
                      <Zeile k="Thread" v={String(row.threadId)} />
                      <Zeile k="Title" v={row.title} muted />
                      <Zeile k="Folder" v={row.folder} muted />
                    </Section>

                    <Section title="Episodes">
                      {deeper.data.episodes.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground">
                          no episode named in the files
                        </div>
                      ) : (
                        <table className="w-full table-fixed border-collapse text-[12px]">
                          <colgroup>
                            <col style={{ width: 50 }} />
                            <col />
                            <col style={{ width: 64 }} />
                            <col style={{ width: 92 }} />
                          </colgroup>
                          <thead>
                            <tr className="border-b border-hair-8">
                              <th className="label px-1 py-1 text-right text-muted-foreground">
                                Nr
                              </th>
                              <th className="label px-1 py-1 text-left text-muted-foreground">
                                Episode
                              </th>
                              <th className="label px-1 py-1 text-left text-muted-foreground">
                                Aired
                              </th>
                              <th className="label px-1 py-1 text-right text-muted-foreground">
                                On disk
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {deeper.data.episodes.map((episode) => {
                              const mark = markOf(episode.files);

                              return (
                                <tr key={`${episode.season}/${episode.episode}`}>
                                  <td className="px-1 py-[3px] text-right font-mono tabular-nums">
                                    {episodeLabel(episode.season, episode.episode)}
                                  </td>

                                  <td
                                    className="truncate px-1 py-[3px]"
                                    title={episode.overview ?? episode.name ?? ""}
                                  >
                                    {episode.name ?? "—"}
                                  </td>

                                  <td className="px-1 py-[3px] font-mono text-[10px] tabular-nums text-muted-foreground">
                                    {episode.airDate ?? "-"}
                                  </td>

                                  <td
                                    className={`px-1 py-[3px] text-right font-mono text-[10px] tabular-nums ${
                                      mark.whole ? "text-ok" : "text-muted-foreground"
                                    }`}
                                  >
                                    {mark.word}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </Section>

                    {video === null ? (
                      <div className="mt-2.5 text-[11px] text-muted-foreground">
                        click a file line for its measurement
                      </div>
                    ) : (
                      <Section title="Video and sound">
                        <div className="mb-1 font-mono text-[10px] break-all text-muted-foreground">
                          {nameOf(video.path)}
                        </div>

                        {video.probe === null ? (
                          <div className="text-[11px] text-wrn">
                            {video.note === null ? "not measured" : video.note}
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-1">
                              <span className="label-tight text-muted-foreground">Resolution</span>
                              <span className="font-mono text-[11px] tabular-nums">
                                {video.probe.width}×{video.probe.height}
                              </span>

                              <span className="label-tight text-muted-foreground">Codec</span>
                              <span className="font-mono text-[11px]">
                                {video.probe.videoCodec}
                              </span>

                              <span className="label-tight text-muted-foreground">HDR</span>
                              <span className="font-mono text-[11px]">
                                {video.probe.hdr ?? "no"}
                              </span>

                              <span className="label-tight text-muted-foreground">Runtime</span>
                              <span className="font-mono text-[11px] tabular-nums">
                                {video.probe.runtimeMinutes === null
                                  ? "—"
                                  : `${video.probe.runtimeMinutes} min`}
                              </span>

                              <span className="label-tight text-muted-foreground">Container</span>
                              <span className="font-mono text-[11px]">{video.probe.container}</span>
                            </div>

                            <div className="mt-2 grid grid-cols-[104px_1fr] gap-x-3 gap-y-1">
                              {[...video.probe.audio.entries()].map(([at, track]) => (
                                <div key={`a${at}`} className="contents">
                                  <span className="label-tight text-muted-foreground">
                                    Audio {at + 1}
                                  </span>
                                  <span className="font-mono text-[11px]">
                                    {[
                                      track.language ?? "?",
                                      track.codec,
                                      track.channels === null ? null : `${track.channels} ch`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </div>
                              ))}

                              {[...video.probe.subtitles.entries()].map(([at, line]) => (
                                <div key={`s${at}`} className="contents">
                                  <span className="label-tight text-muted-foreground">
                                    Subtitle {at + 1}
                                  </span>
                                  <span className="font-mono text-[11px]">{line}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </Section>
                    )}
                  </>
                )}
              </aside>
            </div>

            <div className="flex h-8 shrink-0 items-center gap-3 border-t border-hair-8 px-3 text-[11px]">
              <span className="font-mono tabular-nums text-muted-foreground">
                {row.files.length} chosen
              </span>
              {running.length > 0 && (
                <span className="font-mono tabular-nums text-acc1">{running.length} running</span>
              )}
              {row.state === "error" && row.note && (
                <span className="truncate text-err">{row.note}</span>
              )}
              {notice && <span className="ml-auto truncate text-err">{notice}</span>}
            </div>
          </>
        )}
      </section>

      {options !== null && (
        <SettingsMenu
          anchor={options}
          values={values}
          save={saveSetting}
          onClose={() => setOptions(null)}
        />
      )}

      {menu &&
        rows
          .filter((entry) => entry.threadId === menu.threadId)
          .map((entry) => (
            <ContextMenu
              key={entry.threadId}
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
              items={[
                {
                  label: "Choose files",
                  run: () =>
                    windows.open("download", { threadId: entry.threadId, title: entry.title }),
                },
                {
                  label: BUSY.includes(entry.state) ? "Stop" : "Resume",
                  run: () =>
                    void run(
                      BUSY.includes(entry.state)
                        ? () => downloadsApi.stop(entry.threadId)
                        : () => downloadsApi.resume(entry.threadId),
                    ),
                },
                {
                  label: "Remove",
                  tone: "text-err",
                  run: () => {
                    void run(() => downloadsApi.remove(entry.threadId));
                    if (selected === entry.threadId) setSelected(null);
                  },
                },
              ]}
            />
          ))}
    </div>
  );
}
