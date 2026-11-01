// The catalogue on a phone: category chips, a search field, one row per release,
// and a sheet per release with sync, assignment and download.

import type { Release } from "@shared/types/catalog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { catalogApi } from "@web/windows/catalog/api";
import { displayTitle, holdText, ratingText, releaseYear } from "@web/windows/catalog/columns";
import { downloadsApi } from "@web/windows/downloads/api";
import { useState } from "react";
import { Action, Chips, Dot, day, Field, Note, Poster, Row, Search, Sheet } from "./parts";

/** The catalogue list: chips per category, a filter over the loaded page and the
    two run buttons. */
export default function CatalogScreen() {
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: KEYS.catalog.categories,
    queryFn: catalogApi.categories,
  });
  const status = useQuery({ queryKey: KEYS.catalog.sync, queryFn: catalogApi.sync });

  const known = categories.data?.categories ?? [];
  const [chosen, setChosen] = useState("");
  // The first category stands in until a chip picks one.
  const category = chosen || known[0]?.name || "";

  const loaded = useQuery({
    queryKey: KEYS.catalog.releases(category),
    queryFn: () => catalogApi.releases(category),
    enabled: category !== "",
  });

  const [needle, setNeedle] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  // The needle is compared on title, scene name and tags of the loaded page.
  const rows = (loaded.data?.rows ?? []).filter((release) => hits(release, needle));
  // The tapped row, looked up again in the loaded page.
  const open =
    openId === null
      ? null
      : (loaded.data?.rows.find((release) => release.threadId === openId) ?? null);

  const sync = status.data?.sync;
  const links = status.data?.links;

  /** Runs one action, puts its failure on the sheet and reloads the catalogue. */
  async function work(action: () => Promise<unknown>) {
    setNote("…");
    try {
      await action();
      setNote("");
      await client.invalidateQueries({ queryKey: KEYS.catalog.all });
    } catch (error) {
      setNote(error instanceof Error ? error.message : "fehlgeschlagen");
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 space-y-2 border-b border-hair-6 bg-background px-3 pt-3 pb-2">
        <Chips
          items={known.map((entry) => ({ id: entry.name, label: entry.name }))}
          active={category}
          onPick={setChosen}
        />
        <Search value={needle} onChange={setNeedle} placeholder="Titel oder Szenenname" />

        {/* The line names the run that is in flight, otherwise the row count. */}
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 font-mono text-[11px] leading-4 tabular-nums text-muted-foreground">
            {sync?.running
              ? `Sync ${sync.forumsDone}/${sync.forumsTotal} Foren · Seite ${sync.page}/${sync.forumPages || "?"}`
              : links?.running
                ? `Zuordnung ${links.linked}/${links.processed} · ${links.queued} offen`
                : `${loaded.data?.total ?? 0} Releases`}
          </p>
          <button
            type="button"
            disabled={sync?.running}
            onClick={() => void work(catalogApi.startSync)}
            className="h-8 shrink-0 rounded-md border border-hair-12 px-3 text-[12px] text-muted-foreground disabled:opacity-50"
          >
            {sync?.running ? "syncen …" : "syncen"}
          </button>
          <button
            type="button"
            onClick={() => void work(links?.running ? catalogApi.stopLink : catalogApi.link)}
            disabled={links?.running ? false : Boolean(sync?.running)}
            className="h-8 shrink-0 rounded-md border border-hair-12 px-3 text-[12px] text-muted-foreground disabled:opacity-50"
          >
            {links?.running ? "stoppen" : "zuordnen"}
          </button>
        </div>

        {(note || sync?.error) && <p className="text-[12px] text-wrn">{note || sync?.error}</p>}
      </div>

      {rows.length === 0 ? (
        <Note>
          {loaded.isLoading
            ? "lädt …"
            : needle
              ? "nichts gefunden"
              : "kein Release in dieser Kategorie"}
        </Note>
      ) : (
        <div className="pb-2">
          {rows.map((release) => (
            <Row key={release.threadId} onClick={() => setOpenId(release.threadId)}>
              <Poster path={release.tmdb?.posterPath ?? null} height={68} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px]">{displayTitle(release)}</div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                  <span>{releaseYear(release) || "—"}</span>
                  {ratingText(release) && <span className="text-ok">★ {ratingText(release)}</span>}
                  {release.subcategory && <span className="truncate">{release.subcategory}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2.5 pr-1">
                <Dot on={release.have !== null} ok title={holdText(release)} />
                <Dot
                  on={release.ftp !== null}
                  title={release.ftp ? "FTP-Datensatz" : "kein FTP-Datensatz"}
                />
              </div>
            </Row>
          ))}
        </div>
      )}

      {open && <Detail release={open} onClose={() => setOpenId(null)} client={client} />}
    </div>
  );
}

/** One release as a sheet: title block, fields, tags and the actions. */
function Detail({
  release,
  onClose,
  client,
}: {
  release: Release;
  onClose: () => void;
  client: ReturnType<typeof useQueryClient>;
}) {
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<string | null>(null);

  /** Puts the answer text on the sheet and releases the busy flag. */
  function say(message: string) {
    setNote(message);
    setBusy("");
  }

  /** Fetches the info file; the note says whether the ftp row and the thanks came. */
  async function info() {
    setBusy("info");
    try {
      const answer = await catalogApi.info(release.threadId);
      if (answer.problems && answer.problems.length > 0) say(answer.problems.join(", "));
      else if (!answer.ok) say("kein Downloadlink im Infoblock");
      else say(answer.thanks ? "Danke gesagt, FTP-Datensatz steht" : "FTP-Datensatz steht");
      await client.invalidateQueries({ queryKey: KEYS.catalog.all });
    } catch (error) {
      say(error instanceof Error ? error.message : "fehlgeschlagen");
    }
  }

  /** Lists ftp, starts the files that stand elsewhere, and counts what went. */
  async function download() {
    setBusy("download");
    try {
      const listing = await downloadsApi.listing(release.threadId);
      if (!listing.listed) {
        say("kein FTP-Zugriff — vorher die Infodatei holen");
        return;
      }

      // Directories and files already on disk stay out of the start list.
      const files = listing.entries
        .filter((entry) => !entry.directory && !entry.onDisk)
        .map((entry) => entry.path);
      if (files.length === 0) {
        say("alles liegt schon auf der Platte");
        return;
      }

      await downloadsApi.start(release.threadId, files);
      say(`${files.length} ${files.length === 1 ? "Datei" : "Dateien"} geladen`);
      await client.invalidateQueries({ queryKey: KEYS.downloads.all });
    } catch (error) {
      say(error instanceof Error ? error.message : "fehlgeschlagen");
    }
  }

  /** Takes the tmdb mapping off this thread again. */
  async function unassign() {
    setBusy("unassign");
    try {
      await catalogApi.unassign(release.threadId);
      setNote(null);
      await client.invalidateQueries({ queryKey: KEYS.catalog.all });
    } catch (error) {
      say(error instanceof Error ? error.message : "fehlgeschlagen");
    }
  }

  return (
    <Sheet title={displayTitle(release)} onClose={onClose}>
      <div className="space-y-4">
        {release.tmdb && (
          <div className="flex gap-3">
            <Poster path={release.tmdb.posterPath} height={150} />
            <div className="min-w-0 flex-1 space-y-1 text-[12px] text-muted-foreground">
              <div className="text-[15px] text-foreground">{release.tmdb.title}</div>
              <div className="font-mono tabular-nums">
                {release.tmdb.year ?? "—"} · {release.tmdb.kind === "tv" ? "Serie" : "Film"}
              </div>
              {release.tmdb.rating !== null && (
                <div className="text-ok">★ {release.tmdb.rating.toFixed(1)}</div>
              )}
              {release.tmdb.genres.length > 0 && <div>{release.tmdb.genres.join(", ")}</div>}
            </div>
          </div>
        )}

        {release.tmdb?.overview && (
          <p className="text-[13px] leading-5 text-muted-foreground">{release.tmdb.overview}</p>
        )}

        <div>
          <Field label="Bibliothek" value={holdText(release)} />
          <Field label="Kategorie" value={`${release.category} · ${release.subcategory}`} />
          <Field label="Gelistet" value={day(release.publishedAt)} />
          <Field label="Szenenname" value={<span className="break-all">{release.name}</span>} />
          <Field
            label="FTP"
            value={
              release.ftp ? (
                <span className="break-all">
                  {release.ftp.user}@{release.ftp.host}:{release.ftp.path}
                </span>
              ) : (
                "kein Datensatz"
              )
            }
          />
        </div>

        {release.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {release.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-glass-3 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {note && <p className="text-[12px] text-wrn">{note}</p>}

        <div className="space-y-2">
          <Action
            onClick={() => void download()}
            label="Herunterladen"
            busy={busy === "download"}
          />
          <Action
            onClick={() => void info()}
            label={release.ftp ? "Infodatei neu holen" : "Infodatei holen"}
            busy={busy === "info"}
          />
          {release.tmdb && (
            <Action
              onClick={() => void unassign()}
              label="Zuordnung entfernen"
              busy={busy === "unassign"}
              danger
            />
          )}
          <Action href={release.url} label="Thread im Board öffnen" />
        </div>
      </div>
    </Sheet>
  );
}

/** True when the needle turns up in title, scene name or one tag. */
function hits(release: Release, needle: string): boolean {
  const text = needle.trim().toLowerCase();
  if (!text) return true;
  return (
    displayTitle(release).toLowerCase().includes(text) ||
    release.name.toLowerCase().includes(text) ||
    release.tags.some((tag) => tag.toLowerCase().includes(text))
  );
}
