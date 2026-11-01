import type { AssignCandidate, Release } from "@shared/types/catalog";
import { posterUrl } from "@shared/types/tmdb";
import { useEffect, useState } from "react";
import { catalogApi } from "./api";
import { listDate } from "./columns";

/** What the column shows and the three actions its buttons call. */
type Props = {
  release: Release | null;
  // The thread id that opens the assign form; null keeps the form closed.
  assignFor: number | null;
  onClose: () => void;
  onInfo: (release: Release) => void;
  onDownload: (release: Release) => void;
};

// The look of the small buttons in this column.
const button =
  "cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";
// The button that carries the main action.
const primary = `${button} border-acc1/30 bg-acc1/16 text-acc1 hover:bg-acc1/24`;
// A bare glyph button of the header row.
const icon =
  "shrink-0 cursor-pointer rounded p-1 text-muted-foreground transition hover:bg-white/8 hover:text-acc1 disabled:cursor-default disabled:opacity-40";
// Heading above a block of the column.
const section = "mt-4 mb-1.5 text-[10px] uppercase tracking-[1px] text-muted-foreground";
// One tag chip.
const chip = "rounded-sm border border-acc1/45 bg-acc1/12 px-1.5 py-px font-mono text-[9px]";
// A small external link chip.
const link =
  "rounded border border-hair-12 bg-white/5 px-2 py-px text-[9px] uppercase tracking-[0.5px] hover:bg-white/12";

/** Label and value on one line; `muted` dims the value. */
function Zeile({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className="flex gap-2 py-[2px] text-[11px]">
      <span className="w-[84px] shrink-0 text-muted-foreground">{k}</span>
      <span className={`min-w-0 break-words ${muted ? "text-muted-foreground" : ""}`}>{v}</span>
    </div>
  );
}

// The board chip stands in both states: mapped release and unmapped release.
function BoardLink({ url }: { url: string }) {
  return (
    <a
      href={url.startsWith("http") ? url : `https://mlcboard.com/forum/${url}`}
      target="_blank"
      rel="noreferrer"
      title={url}
      className={link}
    >
      Board
    </a>
  );
}

/** The tag chips; the year, group and genre tags are left out. */
function Tags({ tags }: { tags: string[] }) {
  const shown = tags.filter((tag) => !/^(year|group|genre):/.test(tag));
  if (shown.length === 0)
    return <p className="text-[11px] text-muted-foreground">Keine Tags erkannt</p>;

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <span key={tag} className={chip}>
          {tag}
        </span>
      ))}
    </div>
  );
}

export function DetailColumn({ release, assignFor, onClose, onInfo, onDownload }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AssignCandidate[] | null>(null);

  // The list opens the form for one thread: prefill it with the title the row shows.
  useEffect(() => {
    if (assignFor === null || !release || release.threadId !== assignFor) return;
    setOpen(true);
    setQuery(release.tmdb?.title ?? release.title);
  }, [assignFor, release]);

  // An empty selection leaves the column standing with its hint.
  if (!release)
    return (
      <aside className="w-[340px] shrink-0 border-l border-hair-8 bg-glass-2 p-4 text-[12px]">
        <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-muted-foreground">
          Details
        </div>
        <p className="text-[11px] leading-[1.5] text-muted-foreground">
          Kein Release gewählt. Wähle einen Eintrag, um Titel, Tags und den Weg zur Info-Datei zu
          sehen.
        </p>
      </aside>
    );

  // The mapped title; an absent one keeps the board-only block below.
  const title = release.tmdb;

  /** Runs one assign call: ok closes the form, candidates fill the list, an error
   *  text goes on the column. */
  const apply = async (
    run: () => Promise<{ ok?: boolean; error?: string; candidates?: AssignCandidate[] }>,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const answer = await run();
      if (answer.ok) {
        setOpen(false);
        setCandidates(null);
        return;
      }
      if (answer.candidates) setCandidates(answer.candidates);
      else setError(answer.error ?? "Keine Zuweisung");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="w-[340px] shrink-0 overflow-auto border-l border-hair-8 bg-glass-2 p-4 text-[12px] scroll-thin">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-muted-foreground">
            {release.category || "Release"}
            {release.subcategory ? ` · ${release.subcategory}` : ""}
          </div>
          <h2 className="text-[20px] leading-tight font-bold break-words">
            {title?.title ?? release.title}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Zuordnung bearbeiten (TMDB-ID, IMDb-ID oder Titel)"
            aria-label="Zuordnung bearbeiten"
            className={icon}
            onClick={() => {
              setOpen((value) => !value);
              setQuery(title?.title ?? release.title);
            }}
          >
            ✎
          </button>
          {title && (
            <button
              type="button"
              title="Zuordnung entfernen"
              aria-label="Zuordnung entfernen"
              className={icon}
              disabled={busy}
              onClick={() => void apply(() => catalogApi.unassign(release.threadId))}
            >
              ✕
            </button>
          )}
          <button
            type="button"
            title="Details schließen"
            aria-label="Details schließen"
            className={icon}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-hair-8 bg-glass-3 p-2.5">
          <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-muted-foreground">
            Zuordnung
          </div>
          <input
            className="mb-2 w-full rounded-lg border border-hair-8 bg-glass-2 px-2 py-1 text-[11px] outline-none focus:border-acc1/50"
            value={query}
            placeholder="TMDB-ID, tt… oder Titel"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter")
                void apply(() => catalogApi.assign(release.threadId, query.trim()));
              if (event.key === "Escape") {
                setOpen(false);
                setCandidates(null);
              }
            }}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              className={primary}
              disabled={busy || !query.trim()}
              onClick={() => void apply(() => catalogApi.assign(release.threadId, query.trim()))}
            >
              {busy ? "…" : "Übernehmen"}
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                setOpen(false);
                setCandidates(null);
                setError(null);
              }}
            >
              Abbrechen
            </button>
          </div>

          {candidates && candidates.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {candidates.map((candidate) => (
                <button
                  key={`${candidate.kind}-${candidate.tmdbId}`}
                  type="button"
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-left transition hover:bg-white/8"
                  onClick={() =>
                    void apply(() =>
                      catalogApi.assignId(release.threadId, candidate.tmdbId, candidate.kind),
                    )
                  }
                >
                  {candidate.posterPath && (
                    <img
                      src={posterUrl(candidate.posterPath, "w185") ?? ""}
                      alt=""
                      className="h-12 w-8 rounded object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.title}
                    {candidate.year ? ` (${candidate.year})` : ""}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{candidate.voteCount}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-hair-8 bg-glass-3 px-2.5 py-1.5 text-[11px] leading-[1.5] text-err">
          {error}
        </p>
      )}

      {title ? (
        <div className="mt-3 rounded-xl border border-hair-12 bg-glass-3 p-3">
          <div className="flex items-start gap-2.5">
            {title.posterPath ? (
              <img
                src={posterUrl(title.posterPath, "w185") ?? ""}
                alt=""
                className="h-[62px] w-11 shrink-0 rounded-md border border-hair-12 object-cover"
              />
            ) : (
              <div className="h-[62px] w-11 shrink-0 rounded-md border border-hair-12 bg-glass-8" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground">
                {title.kind === "tv" ? "Serie" : "Film"}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <BoardLink url={release.url} />
                <a
                  href={`https://www.themoviedb.org/${title.kind}/${title.tmdbId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${link} border-acc1/45 bg-acc1/12 text-acc1`}
                >
                  TMDB
                </a>
              </div>
            </div>
          </div>

          <div className="mt-2">
            {title.originalTitle && title.originalTitle !== title.title && (
              <Zeile k="Original" v={title.originalTitle} />
            )}
            {typeof title.rating === "number" && (
              <Zeile k="Bewertung" v={`${title.rating.toFixed(1)}/10`} />
            )}
            {title.genres.length > 0 && <Zeile k="Genres" v={title.genres.join(", ")} />}
            <Zeile k="TMDB" v={String(title.tmdbId)} muted />
          </div>

          {title.overview && (
            <div className="mt-2 border-t border-hair-6 pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-[1px] text-muted-foreground">
                Beschreibung
              </div>
              <p className="max-h-32 overflow-y-auto text-[11px] leading-[1.5] scroll-thin">
                {title.overview}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-hair-12 bg-glass-3 p-3">
          <div className="text-[11px] text-muted-foreground">Kein Titel</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <BoardLink url={release.url} />
          </div>
          <p className="mt-2 text-[11px] leading-[1.5] text-muted-foreground">
            Über <span className="text-white/75">✎</span> lässt sich die Zuordnung von Hand setzen —
            TMDB-ID, IMDb-ID oder Titel genügt.
          </p>
        </div>
      )}

      <div className={section}>Board</div>
      <Zeile k="Thread" v={String(release.threadId)} />
      <Zeile k="Titel" v={release.title} muted />
      <Zeile k="Datum" v={listDate(release)} />

      <div className={section}>Tags</div>
      <Tags tags={release.tags} />

      {/* The thanks button fetches and decrypts the info file, the other opens the
          file picker. */}
      <div className={section}>Download</div>
      <div className="flex gap-1.5">
        <button
          type="button"
          className={`${button} flex-1`}
          disabled={busy}
          title="Info-Datei holen und entschlüsseln"
          onClick={() => onInfo(release)}
        >
          Danke
        </button>
        <button
          type="button"
          className={`${primary} flex-1`}
          title="Dateien auflisten und auswählen"
          onClick={() => onDownload(release)}
        >
          Download
        </button>
      </div>

      {/* The access the info file delivered; an empty field reads as a dash. */}
      {release.ftp && (
        <div className="mt-3 rounded-2xl border border-hair-8 bg-glass-3 p-2.5">
          <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-muted-foreground">
            FTP-Zugang
          </div>
          <Zeile k="Host" v={release.ftp.host} />
          <Zeile
            k="Port"
            v={typeof release.ftp.port === "number" ? String(release.ftp.port) : "—"}
          />
          <Zeile k="User" v={release.ftp.user || "—"} />
          <Zeile k="Pfad" v={release.ftp.path || "/"} />
          <Zeile
            k="Passwort"
            v={release.ftp.passwordSet ? "liegt vor" : "keines"}
            muted={!release.ftp.passwordSet}
          />
          <Zeile k="Geholt" v={new Date(release.ftp.fetchedAt).toLocaleString("de-DE")} muted />
        </div>
      )}
    </aside>
  );
}
