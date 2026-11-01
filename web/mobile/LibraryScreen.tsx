// The library on a phone: one row per work on disk, a chip per library folder, and
// a sheet with its seasons.

import type { LibraryFile, LibrarySeason, LibraryTitle } from "@shared/types/library";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { libraryApi } from "@web/windows/library/api";
import { useState } from "react";
import { Action, bytes, Chips, day, Field, Note, Poster, Row, Search, Sheet } from "./parts";

// A row is either a title folder or a flat file: both name one work, and both
// are reached the same way from the list.
type Entry = {
  key: string;
  name: string;
  group: string;
  poster: string | null;
  year: number | null;
  rating: number | null;
  kind: string;
  files: number;
  size: number;
  seasons: { label: string; files: number }[];
  path: string;
  quality: string | null;
};

/** The works on disk, narrowed by folder chip and title search. */
export default function LibraryScreen() {
  const client = useQueryClient();
  const stand = useQuery({ queryKey: KEYS.library.stand, queryFn: libraryApi.stand });
  const [group, setGroup] = useState("");
  const [needle, setNeedle] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roots = stand.data?.roots ?? [];
  // One entry per child of every root; the chips carry the root names and their
  // counts.
  const entries = roots.flatMap((root) => root.children.map((child) => entryOf(root.name, child)));
  const groups = roots.map((root) => ({
    id: root.name,
    label: root.name,
    count: root.children.length,
  }));

  // The chip picks one root, the needle compares the title.
  const shown = entries.filter(
    (entry) =>
      (group === "" || entry.group === group) &&
      (!needle.trim() || entry.name.toLowerCase().includes(needle.trim().toLowerCase())),
  );
  // The tapped entry, looked up again in the shown list.
  const open = openKey === null ? null : (shown.find((entry) => entry.key === openKey) ?? null);

  return (
    <div>
      <div className="sticky top-0 z-10 space-y-2 border-b border-hair-6 bg-background px-3 pt-3 pb-2">
        <Chips
          items={[{ id: "", label: "alle", count: entries.length }, ...groups]}
          active={group}
          onPick={setGroup}
        />
        <Search value={needle} onChange={setNeedle} placeholder="Titel in der Bibliothek" />
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            {entries.length} Titel
            {stand.data?.scannedAt
              ? ` · Stand ${day(stand.data.scannedAt)}`
              : " · noch nicht gescannt"}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void libraryApi
                .scan()
                .then(() => client.invalidateQueries({ queryKey: KEYS.library.all }))
                .finally(() => setBusy(false));
            }}
            className="h-8 shrink-0 rounded-md border border-hair-12 px-3 text-[12px] text-muted-foreground disabled:opacity-50"
          >
            {stand.data?.scan.running ? "läuft" : "scannen"}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <Note>
          {stand.isLoading
            ? "lädt …"
            : entries.length === 0
              ? "kein Bibliotheksordner gesetzt oder noch nie gescannt"
              : "nichts gefunden"}
        </Note>
      ) : (
        <div className="pb-2">
          {shown.map((entry) => (
            <Row key={entry.key} onClick={() => setOpenKey(entry.key)}>
              <Poster path={entry.poster} height={68} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px]">{entry.name}</div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                  <span>{entry.year ?? "—"}</span>
                  <span>{entry.kind}</span>
                  {entry.rating !== null && (
                    <span className="text-ok">★ {entry.rating.toFixed(1)}</span>
                  )}
                  <span className="ml-auto shrink-0">
                    {entry.files} {entry.files === 1 ? "Datei" : "Dateien"}
                  </span>
                </div>
              </div>
            </Row>
          ))}
        </div>
      )}

      {open && (
        <Sheet title={open.name} onClose={() => setOpenKey(null)}>
          <div className="space-y-4">
            <div className="flex gap-3">
              <Poster path={open.poster} height={150} />
              <div className="min-w-0 flex-1 space-y-1 text-[12px] text-muted-foreground">
                <div className="text-[14px] text-foreground">{open.year ?? "—"}</div>
                <div>{open.kind}</div>
                {open.rating !== null && <div className="text-ok">★ {open.rating.toFixed(1)}</div>}
                <div>
                  {open.files} {open.files === 1 ? "Datei" : "Dateien"} · {bytes(open.size)}
                </div>
                {open.quality && <div>{open.quality}</div>}
              </div>
            </div>

            {open.seasons.length > 0 && (
              <div>
                <h3 className="mb-1 text-[11px] uppercase text-muted-foreground">Staffeln</h3>
                <div className="border-t border-hair-6">
                  {open.seasons.map((season) => (
                    <div
                      key={season.label}
                      className="flex items-baseline border-b border-hair-6 py-2.5 font-mono text-[12px] tabular-nums"
                    >
                      <span>{season.label}</span>
                      <span className="ml-auto text-muted-foreground">
                        {season.files} {season.files === 1 ? "Datei" : "Dateien"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Field label="Pfad" value={<span className="break-all">{open.path}</span>} />

            <Action
              href={`https://www.themoviedb.org/${open.kind === "Serie" ? "tv" : "movie"}`}
              label="Bei TMDB öffnen"
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** One child of a root as a row: a flat file as one film, a title folder with its
    season labels. */
function entryOf(group: string, child: LibraryTitle | LibraryFile): Entry {
  if (child.type === "file") {
    const probe = child.probe;
    return {
      key: child.path,
      name: child.tmdb?.title ?? child.name,
      group,
      poster: child.tmdb?.posterPath ?? null,
      year: child.tmdb?.year ?? null,
      rating: child.tmdb?.rating ?? null,
      kind: "Film",
      files: 1,
      size: child.size,
      seasons: [],
      path: child.path,
      quality: probe ? qualityOf(probe) : null,
    };
  }

  // Season children contribute their files, so the count covers the whole folder.
  const files = child.children.flatMap((entry) =>
    entry.type === "file" ? [entry] : entry.children,
  );
  const seasons = child.children
    .filter((entry): entry is LibrarySeason => entry.type === "season")
    .map((entry) => ({
      label: `S${String(entry.number ?? 0).padStart(2, "0")}`,
      files: entry.children.length,
    }));

  return {
    key: child.path,
    name: child.tmdb?.title ?? child.name,
    group,
    poster: child.tmdb?.posterPath ?? null,
    year: child.tmdb?.year ?? null,
    rating: child.tmdb?.rating ?? null,
    kind: child.kind === "series" ? "Serie" : "Film",
    files: files.length,
    size: files.reduce((sum, file) => sum + file.size, 0),
    seasons,
    path: child.path,
    quality: qualityOf(files.find((file) => file.probe)?.probe ?? null),
  };
}

/** Height, hdr word and codec joined by " · "; an absent probe answers null. */
function qualityOf(probe: LibraryFile["probe"]): string | null {
  if (!probe) return null;
  const parts = [probe.height ? `${probe.height}p` : null, probe.hdr, probe.videoCodec].filter(
    (part): part is string => part !== null && part !== "",
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}
