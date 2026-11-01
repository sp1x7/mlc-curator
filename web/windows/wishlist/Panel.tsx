import { posterUrl } from "@shared/types/tmdb";
import type { WishEntry, WishTarget } from "@shared/types/wishlist";
import { cn } from "@web/lib/utils";
import { useWindows } from "@web/shell/window-context";
import { useState } from "react";
import { ageText, humanBytes, pad, probeLine } from "./columns";

// The look of a plain button.
const button =
  "cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";
// The button of the main action.
const primary = `${button} border-acc1/30 bg-acc1/16 text-acc1 hover:bg-acc1/24`;
// The head above a block of the panel.
const section = "mt-4 mb-1.5 text-[10px] uppercase tracking-[1px] text-muted-foreground";
// The head inside a block.
const caption = "mb-1 text-[10px] uppercase tracking-[1px] text-muted-foreground";
// The note field.
const field =
  "w-full rounded-lg border border-hair-8 bg-glass-2 px-2 py-1 text-[11px] outline-none focus:border-acc1/50";
// The look of an external link chip.
const link =
  "rounded border border-hair-12 bg-white/5 px-2 py-px text-[9px] uppercase tracking-[0.5px] hover:bg-white/12";

/** One target chip, active or idle. */
const pick = (active: boolean): string =>
  `cursor-pointer rounded-md border px-2 py-[3px] text-[10px] transition ${
    active
      ? "border-acc1/45 bg-acc1/14 text-white"
      : "border-hair-10 text-white/55 hover:text-white"
  }`;

/** One episode chip, owned or wanted. */
const episodeChip = (have: boolean): string =>
  `inline-block rounded-sm border px-1.5 py-px font-mono text-[9px] tabular-nums ${
    have ? "border-ok/45 bg-ok/12 text-ok" : "border-hair-12 bg-glass-3 text-muted-foreground"
  }`;

/** Label and value on one line. */
function Zeile({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className="flex gap-2 py-[2px] text-[11px]">
      <span className="w-[84px] shrink-0 text-muted-foreground">{k}</span>
      <span className={cn("min-w-0 break-words", muted && "text-muted-foreground")}>{v}</span>
    </div>
  );
}

/** The target axes: key, label and the words to pick. */
const TARGETS: Array<[keyof WishTarget, string, string[]]> = [
  ["minRes", "min res", ["720p", "1080p", "2160p", "none"]],
  ["hdr", "hdr", ["any", "only", "never"]],
  ["audio", "audio", ["any", "ger", "orig"]],
];

/** The detail panel of one wish: identity, target, library state and catalog hits. */
export default function Panel({
  wish,
  onTarget,
  onRemove,
}: {
  /** The selected wish. */
  wish: WishEntry;
  /** Sends an edited target with its note. */
  onTarget: (target: WishTarget, note: string | null) => void;
  /** Takes the wish off the list. */
  onRemove: () => void;
}) {
  const windows = useWindows();
  // The edit state of the target block, and the seasons whose episode chips stand open.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WishTarget>(wish.target);
  const [note, setNote] = useState(wish.note ?? "");
  const [open, setOpen] = useState<number[]>([]);

  // The poster, and the year line: one year for a film, the span of a series.
  const poster = posterUrl(wish.identity.posterPath, "w185");
  const years =
    wish.kind === "movie"
      ? wish.identity.year
      : wish.identity.firstAirYear &&
          wish.identity.lastAirYear &&
          wish.identity.firstAirYear !== wish.identity.lastAirYear
        ? `${wish.identity.firstAirYear} – ${wish.identity.lastAirYear}`
        : wish.identity.firstAirYear;

  /** Opens or closes the episode chips of one season. */
  const toggle = (number: number): void => {
    setOpen((current) =>
      current.includes(number) ? current.filter((n) => n !== number) : [...current, number],
    );
  };

  return (
    <>
      {/* Kind, title and year line. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-muted-foreground">
            wish · {wish.kind === "tv" ? "Serie" : "Film"}
          </div>
          <h2 className="text-[20px] leading-tight font-bold break-words">{wish.identity.title}</h2>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">
            {[years, wish.identity.originalTitle].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      {/* Poster, external links and the tmdb identity. */}
      <div className="mt-3 rounded-xl border border-hair-12 bg-glass-3 p-3">
        <div className="flex items-start gap-2.5">
          {poster ? (
            <img
              src={poster}
              alt=""
              className="h-[62px] w-11 shrink-0 rounded-md border border-hair-12 object-cover"
            />
          ) : (
            <div className="h-[62px] w-11 shrink-0 rounded-md border border-hair-12 bg-glass-8" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">
              {wish.kind === "tv" ? "Serie" : "Film"}
              {years ? ` · ${years}` : ""}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <a
                href={`https://www.themoviedb.org/${wish.kind}/${wish.tmdbId}`}
                target="_blank"
                rel="noreferrer"
                className={cn(link, "border-acc1/45 bg-acc1/12 text-acc1")}
              >
                TMDB
              </a>
              {wish.identity.imdbId && (
                <a
                  href={`https://www.imdb.com/title/${wish.identity.imdbId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={link}
                >
                  IMDb
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2">
          <Zeile k="TMDB" v={String(wish.tmdbId)} />
          {wish.identity.imdbId && <Zeile k="IMDb" v={wish.identity.imdbId} />}
          {wish.identity.genres.length > 0 && (
            <Zeile k="Genres" v={wish.identity.genres.join(", ")} />
          )}
          {wish.identity.certification && <Zeile k="FSK" v={wish.identity.certification} />}
          {typeof wish.identity.rating === "number" && (
            <Zeile
              k="Bewertung"
              v={`${wish.identity.rating.toFixed(1)}/10`}
              muted={!wish.identity.voteCount}
            />
          )}
          {wish.identity.originalLanguage && (
            <Zeile k="Sprache" v={wish.identity.originalLanguage} />
          )}
          {wish.identity.productionCountry && (
            <Zeile k="Land" v={wish.identity.productionCountry} />
          )}
        </div>

        {wish.identity.overview && (
          <div className="mt-2 border-t border-hair-6 pt-2">
            <div className={caption}>Beschreibung</div>
            <p className="max-h-32 overflow-y-auto text-[11px] leading-[1.5] scroll-thin">
              {wish.identity.overview}
            </p>
          </div>
        )}
      </div>

      {/* The target, shown read-only or with its chips. */}
      <div className="mt-4 mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground">Ziel</div>
        {editing ? (
          <span className="flex gap-1.5">
            <button
              type="button"
              className={primary}
              onClick={() => {
                onTarget(draft, note.trim() ? note.trim() : null);
                setEditing(false);
              }}
            >
              Übernehmen
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                setEditing(false);
                setDraft(wish.target);
                setNote(wish.note ?? "");
              }}
            >
              Abbrechen
            </button>
          </span>
        ) : (
          <button
            type="button"
            className={button}
            onClick={() => {
              setEditing(true);
              setDraft(wish.target);
              setNote(wish.note ?? "");
            }}
          >
            edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="rounded-xl border border-hair-8 bg-glass-3 p-2.5">
          {TARGETS.map(([key, text, values]) => (
            <div key={key} className="mb-1.5 flex items-baseline gap-2 last:mb-0">
              <span className="w-[70px] shrink-0 text-[10px] tracking-[1px] text-white/30 uppercase">
                {text}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {values.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={pick(draft[key] === value)}
                    onClick={() => setDraft({ ...draft, [key]: value } as WishTarget)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-1.5">
            <input
              className={field}
              placeholder="Notiz"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div>
          <Zeile k="min res" v={wish.target.minRes} />
          <Zeile k="hdr" v={wish.target.hdr} />
          <Zeile k="audio" v={wish.target.audio} />
          {wish.note && <Zeile k="Notiz" v={wish.note} />}
        </div>
      )}

      {/* The files and seasons the library holds for the wish. */}
      <div className="mt-4 mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
          In der Bibliothek
        </div>
        <button type="button" className={button} onClick={() => windows.open("library")}>
          open in Library
        </button>
      </div>

      {wish.files.map((file) => (
        <div key={file.path} className="border-t border-hair-6 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[11px]">{file.name}</span>
            <span className="shrink-0 font-mono tabular-nums text-[10px] text-muted-foreground">
              {humanBytes(file.size)}
            </span>
          </div>
          {file.probe && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {probeLine(file.probe)}
            </div>
          )}
          <div className="mt-0.5 text-[10px]">
            {file.verdict === "ok" ? (
              <span className="text-ok">entspricht dem Ziel</span>
            ) : (
              <span className="text-err">{file.why ?? "entspricht nicht dem Ziel"}</span>
            )}
          </div>
        </div>
      ))}

      {wish.seasons.map((season) => (
        <div key={season.number} className="border-t border-hair-6 py-2">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 text-left"
            onClick={() => toggle(season.number)}
          >
            <span className="font-mono text-[11px]">S{pad(season.number)}</span>
            <span className="font-mono tabular-nums text-[11px]">
              {season.have}/{season.expected || "?"}
            </span>
          </button>

          {season.path && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {season.path}
            </div>
          )}

          {open.includes(season.number) && season.episodes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {season.episodes.map((episode) => (
                <span
                  key={episode.number}
                  title={episode.file ?? undefined}
                  className={episodeChip(episode.have)}
                >
                  E{pad(episode.number)}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {wish.files.length === 0 && wish.seasons.length === 0 && (
        <p className="text-[11px] text-muted-foreground">nichts in der Bibliothek</p>
      )}

      {/* The board releases that fit the target. */}
      <div className={section}>Im Catalog</div>

      {wish.matches.length === 0 && (
        <p className="text-[11px] text-muted-foreground">keine Treffer</p>
      )}
      {wish.matches.map((match) => (
        <button
          key={match.threadId}
          type="button"
          title={match.why ?? undefined}
          className="mb-1 flex w-full cursor-pointer items-center gap-2 rounded px-1 py-1 text-left transition hover:bg-white/8"
          onClick={() => windows.open("catalog")}
        >
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            #{match.threadId}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px]">{match.title}</span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {ageText(match.publishedAt ?? 0)}
          </span>
        </button>
      ))}

      {/* The way off the list. */}
      <div className="mt-4 flex gap-1.5">
        <button
          type="button"
          className={cn(button, "border-err/25 bg-err/10 text-err hover:bg-err/16")}
          onClick={onRemove}
        >
          remove wish
        </button>
      </div>
    </>
  );
}
