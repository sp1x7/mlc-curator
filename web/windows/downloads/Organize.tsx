// The plan window: one row per file, with the column heads used everywhere in
// the app. Left stands what sits in the download folder, next what the library
// gets out of it, and what the organizer writes on top (nfo, poster, fanart).

import { bandLabel, probeRes } from "@shared/types/band";
import type { DownloadPlan, OrganizeResult, PlanEntry } from "@shared/types/downloads";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { useParams } from "@web/shell/window-context";
import { useEffect, useMemo, useState } from "react";
import { downloadsApi } from "./api";
import { bytesOf, seasonLabel } from "./format";
import { Section, TmdbCard, Zeile } from "./parts";

// The look of the small buttons of this window.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";

// The button that carries the main action.
const primary = `${button} border-acc1/40 bg-acc1/14 text-acc1 hover:bg-acc1/22`;

/** The word for a plan entry kind. */
const KIND_WORD: Record<PlanEntry["kind"], string> = {
  video: "Video",
  subtitle: "Subtitle",
  nfo: "NFO",
  image: "Picture",
  archive: "Archive",
  other: "Other",
};

// The storage slot of the plan table widths.
const HEAD_KEY = "mlc.organize.columns";

/** The columns of the plan table: label, width before a drag and its floor. */
const HEADS: { key: string; label: string; initial: number | null; min: number }[] = [
  { key: "use", label: "", initial: 40, min: 40 },
  { key: "file", label: "Download file", initial: null, min: 190 },
  { key: "into", label: "Library file", initial: 240, min: 120 },
  { key: "folder", label: "Library folder", initial: 280, min: 110 },
  { key: "kind", label: "Kind", initial: 92, min: 60 },
  { key: "size", label: "Size", initial: 124, min: 80 },
];

/** The release whose plan the window shows. */
type Params = { threadId: number };

/** Folder part of a path; the file name is shown on its own. */
function folderOf(path: string): string {
  const parts = path.split("/");

  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

/** A path below the library folder. */
function below(root: string, path: string): string {
  return root !== "" && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

/** Release folder and the sub folder of the file; the download root is left out. */
function sourcePathOf(folder: string, path: string): string {
  const mark = `/${folder}/`;
  const at = path.lastIndexOf(mark);

  if (at === -1) return folder;

  const below = path
    .slice(at + mark.length)
    .split("/")
    .slice(0, -1)
    .join("/");

  return below === "" ? folder : `${folder}/${below}`;
}

/** The last segment of a path. */
function nameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/** `1080p · 52m` out of what ffprobe said about the source file; the band is the one
 *  the server decides with, the pixel height of the encode stands behind it. */
function shapeOf(measured: DownloadPlan["measured"], from: string): string {
  const values = measured[from];
  if (!values) return "";

  const picture = bandLabel(probeRes(values));
  const minutes = values.duration === null ? "" : `${values.duration}m`;

  return [picture, minutes].filter(Boolean).join(" · ");
}

/** The move plan: one row per file, source at the left, library target next to it,
 *  and the files the organizer writes on top. */
export default function Organize(): React.JSX.Element {
  const params = useParams<Params>();
  const client = useQueryClient();
  const [dropped, setDropped] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<OrganizeResult | null>(null);

  // The plan of the release, and its title with episodes.
  const loaded = useQuery({
    queryKey: KEYS.downloads.plan(params?.threadId ?? 0),
    queryFn: () => downloadsApi.plan(params?.threadId ?? 0),
    enabled: params !== undefined,
  });

  const deeper = useQuery({
    queryKey: KEYS.downloads.detail(params?.threadId ?? 0),
    queryFn: () => downloadsApi.detail(params?.threadId ?? 0),
    enabled: params !== undefined,
  });

  /** Column widths, read once from storage. */
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

  // The plan and its rows.
  const plan = loaded.data;
  const entries = useMemo(() => plan?.entries ?? [], [plan]);

  /** Library folder first, so the files of one folder stand together. */
  const shown = useMemo(() => {
    const keyOf = (entry: PlanEntry): string =>
      entry.move
        ? `${below(plan?.root ?? "", entry.to)}\u0000${nameOf(entry.to)}`
        : `\uffff${entry.from}`;

    return [...entries].sort((a, b) => keyOf(a).localeCompare(keyOf(b), "en"));
  }, [entries, plan]);

  // The four groups of the plan: files that move, files the organizer writes, files
  // that stay, and the ones the checkboxes keep. `blocked` counts the targets that
  // already hold a file.
  const movable = useMemo(() => entries.filter((entry) => entry.move && !entry.added), [entries]);

  const added = useMemo(() => entries.filter((entry) => entry.added), [entries]);
  const staying = entries.filter((entry) => !entry.move && !entry.added);
  const chosen = entries.filter((entry) => entry.move && !dropped.includes(entry.from));
  const blocked = entries.filter((entry) => entry.exists).length;

  if (!params) return <div />;

  const threadId = params.threadId;

  /** Hands the chosen source paths to the organizer and reloads plan and detail. */
  const apply = async (): Promise<void> => {
    setNotice(null);
    setBusy(true);

    try {
      const answer = await downloadsApi.organize(
        threadId,
        chosen.map((entry) => entry.from),
      );

      setDone(answer);
      await client.invalidateQueries({ queryKey: KEYS.downloads.plan(threadId) });
      await client.invalidateQueries({ queryKey: KEYS.downloads.detail(threadId) });
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  // The clicked row, and the tmdb detail of the release.
  const selected = entries.find((entry) => entry.from === picked) ?? null;
  const info = deeper.data?.info ?? null;
  const episodes = deeper.data?.episodes ?? [];

  // The longest description available, with the label of the level it came from.
  const described = info === null ? null : (info.seasonOverview ?? info.overview ?? null);

  const describedBy =
    info === null
      ? ""
      : info.seasonOverview !== null
        ? `${seasonLabel(info.season ?? 1)} description`
        : info.kind === "movie"
          ? "Story"
          : "Series description";

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Bulk picks and the button that sorts the chosen files in. */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
          <span className="label text-muted-foreground">Release</span>
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {plan === undefined ? "" : plan.folder}
          </span>

          <button
            type="button"
            className={`${button} ml-auto`}
            onClick={() => setDropped([])}
            disabled={chosen.length !== movable.length + added.length}
          >
            All
          </button>

          <button
            type="button"
            className={button}
            onClick={() => setDropped(movable.map((entry) => entry.from))}
            disabled={movable.length === 0}
          >
            Files only
          </button>

          <button
            type="button"
            className={primary}
            disabled={busy || chosen.length === 0}
            onClick={() => void apply()}
          >
            {busy ? "Sorting …" : `Sort in ${chosen.length}`}
          </button>
        </div>

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

            {loaded.isPending && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">building plan …</div>
            )}

            {loaded.isError && (
              <div className="px-3 py-2 text-[11px] text-err">
                {loaded.error instanceof Error ? loaded.error.message : "plan not readable"}
              </div>
            )}

            {plan !== undefined && plan.root === "" && (
              <div className="px-3 py-2 text-[11px] text-wrn">
                no library folder to sort into — set one under Settings → Library
              </div>
            )}

            {plan !== undefined && plan.root !== "" && entries.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                nothing sits in <span className="font-mono">{plan.folder}</span> — download the
                release first
              </div>
            )}

            {plan !== undefined && plan.root !== "" && plan.metadataNote !== null && (
              <div className="px-3 py-2 text-[11px] text-wrn">
                no NFO and no pictures: {plan.metadataNote}
              </div>
            )}

            {/* One row per plan entry; the checkbox drops it from the move. */}
            {shown.map((entry) => {
              const off = !entry.move || dropped.includes(entry.from);

              return (
                <button
                  type="button"
                  key={`${entry.from}#${entry.to}`}
                  onClick={() => setPicked(entry.from)}
                  className={`flex h-9 w-full cursor-pointer items-center border-b border-hair-6 px-3 text-left hover:bg-white/4 ${
                    picked === entry.from ? "bg-acc1/10" : ""
                  } ${off ? "opacity-55" : ""}`}
                >
                  <div
                    style={cellOf("use")}
                    className="flex items-center justify-center border-r border-hair-6"
                  >
                    <input
                      type="checkbox"
                      checked={entry.move && !off}
                      disabled={!entry.move}
                      onChange={() =>
                        setDropped((previous) =>
                          entry.move && !off
                            ? previous.filter((path) => path !== entry.from)
                            : [...previous, entry.from],
                        )
                      }
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--primary)] disabled:cursor-default"
                    />
                  </div>

                  <div style={cellOf("file")} className="min-w-0 border-r border-hair-6">
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {entry.added ? "—" : nameOf(entry.from)}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {entry.added ? "" : sourcePathOf(plan?.folder ?? "", entry.from)}
                    </div>
                  </div>

                  <div style={cellOf("into")} className="min-w-0 border-r border-hair-6">
                    <div
                      className={`truncate font-mono text-[11px] ${
                        entry.added ? "text-acc1" : entry.move ? "" : "text-muted-foreground"
                      }`}
                    >
                      {entry.move ? nameOf(entry.to) : "—"}
                    </div>
                    <div
                      className={`truncate font-mono text-[10px] ${
                        entry.exists ? "text-wrn" : "text-muted-foreground"
                      }`}
                    >
                      {entry.exists
                        ? "already there"
                        : entry.added
                          ? "written new"
                          : (entry.reason ?? "")}
                    </div>
                  </div>

                  <div
                    style={cellOf("folder")}
                    className="truncate border-r border-hair-6 px-1.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {plan === undefined || !entry.move ? "" : below(plan.root, folderOf(entry.to))}
                  </div>

                  <div
                    style={cellOf("kind")}
                    className="truncate border-r border-hair-6 px-1.5 text-[10px] text-muted-foreground"
                  >
                    {KIND_WORD[entry.kind]}
                  </div>

                  <div style={cellOf("size")} className="min-w-0 last:border-r-0">
                    <div className="truncate text-right font-mono text-[10px] tabular-nums">
                      {entry.added ? "new" : bytesOf(entry.bytes)}
                    </div>
                    <div className="truncate text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                      {shapeOf(plan?.measured ?? {}, entry.from)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Counts of the four groups, the blocked targets and the last failure. */}
        <div className="flex h-8 shrink-0 items-center gap-3 border-t border-hair-8 px-3 text-[11px]">
          <span className="font-mono tabular-nums text-muted-foreground">
            {chosen.length} of {movable.length + added.length} go
          </span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {added.length} written
          </span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {staying.length} stay
          </span>
          {blocked > 0 && (
            <span className="font-mono tabular-nums text-wrn">{blocked} already there</span>
          )}
          {notice && <span className="ml-auto truncate text-err">{notice}</span>}
        </div>
      </section>

      {/* Title card, release paths, episode list and the clicked row. */}
      <aside className="scroll-thin w-[340px] shrink-0 overflow-auto border-l border-hair-8 bg-glass-2 p-4 text-[12px]">
        {plan === undefined || info === null ? (
          <div className="text-[11px] text-muted-foreground">reading the release …</div>
        ) : (
          <>
            <div className="mb-1.5 text-[10px] tracking-[1px] text-muted-foreground uppercase">
              {plan.organizedAt === null ? "To sort in" : "Sorted in"}
            </div>

            <h2 className="text-[20px] leading-tight font-bold break-words">
              {info.title ?? plan.folder}
            </h2>

            <TmdbCard
              info={info}
              description={described === null ? null : { label: describedBy, text: described }}
            />

            <Section title="Release">
              <Zeile k="Thread" v={String(threadId)} />
              <Zeile k="From" v={plan.folder} muted />
              <Zeile k="Into" v={plan.root} muted />
              <Zeile k="Videos" v={String(movable.length)} />
              <Zeile k="NFO" v={String(added.filter((entry) => entry.kind === "nfo").length)} />
              <Zeile
                k="Pictures"
                v={String(added.filter((entry) => entry.kind === "image").length)}
              />
              {plan.organizedAt !== null && (
                <Zeile k="Sorted" v={plan.organizedAt.slice(0, 16).replace("T", " ")} />
              )}
            </Section>

            {episodes.length > 0 && (
              <Section title="Episodes">
                <table className="w-full table-fixed border-collapse text-[12px]">
                  <colgroup>
                    <col style={{ width: 52 }} />
                    <col />
                  </colgroup>
                  <tbody>
                    {episodes.map((episode) => (
                      <tr key={`${episode.season}/${episode.episode}`}>
                        <td className="px-1 py-[3px] font-mono text-[10px] tabular-nums text-muted-foreground">
                          {`S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`}
                        </td>
                        <td
                          className="truncate px-1 py-[3px]"
                          title={episode.overview ?? episode.name ?? ""}
                        >
                          {episode.name ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {selected === null ? (
              <div className="mt-4 text-[11px] text-muted-foreground">
                click a file name for its place
              </div>
            ) : (
              <Section title="Selected file">
                <Zeile k="Kind" v={KIND_WORD[selected.kind]} />
                <Zeile
                  k="Size"
                  v={selected.added ? "written by the organizer" : bytesOf(selected.bytes)}
                />
                {shapeOf(plan.measured, selected.from) !== "" && (
                  <Zeile k="Picture" v={shapeOf(plan.measured, selected.from)} />
                )}
                {!selected.added && <Zeile k="Name" v={nameOf(selected.from)} muted />}
                {!selected.added && (
                  <Zeile k="Below" v={sourcePathOf(plan.folder, selected.from)} muted />
                )}
                <Zeile
                  k="Into"
                  v={
                    selected.move
                      ? `${below(plan.root, folderOf(selected.to))}/${nameOf(selected.to)}`
                      : "—"
                  }
                />
                {selected.reason !== null && <Zeile k="Why" v={selected.reason} muted />}
              </Section>
            )}

            {done !== null && (
              <Section title="Written">
                <Zeile k="Moved" v={String(done.moved)} />
                <Zeile k="NFO" v={String(done.nfo.length)} muted={done.nfo.length === 0} />
                <Zeile
                  k="Pictures"
                  v={String(done.images.length)}
                  muted={done.images.length === 0}
                />
                {done.skipped !== null && <Zeile k="Skipped" v={done.skipped} muted />}
                {done.kept !== null && <Zeile k="Kept" v={done.kept} muted />}

                <div className="mt-1.5 flex flex-col gap-0.5">
                  {[...done.nfo, ...done.images].map((path) => (
                    <div
                      key={path}
                      className="truncate font-mono text-[10px] text-muted-foreground"
                      title={path}
                    >
                      {below(plan.root, path)}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
