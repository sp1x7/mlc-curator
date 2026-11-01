// Shared pieces of the download windows: a titled block, one label line, the board
// link chip and the tmdb card.

import type { ReleaseDetail } from "@shared/types/downloads";
import { posterUrl } from "@shared/types/tmdb";
import { seasonLabel } from "./format";

// The look of a small external link chip.
export const link =
  "rounded border border-hair-12 bg-white/5 px-2 py-px text-[9px] uppercase tracking-[0.5px] hover:bg-white/12";

/** A titled block of a detail column; a block whose children fall away renders zero
 *  output. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const parts = Array.isArray(children) ? children.filter(Boolean) : [children];
  if (parts.filter(Boolean).length === 0) return null;

  return (
    <section className="mt-4">
      <div className="mb-1.5 text-[10px] tracking-[1px] text-muted-foreground uppercase">
        {title}
      </div>
      {parts}
    </section>
  );
}

/** Label and value on one line; `muted` dims the value. */
export function Zeile({
  k,
  v,
  muted,
}: {
  k: string;
  v: string;
  muted?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex gap-2 py-[2px] text-[11px]">
      <span className="w-[84px] shrink-0 text-muted-foreground">{k}</span>
      <span className={`min-w-0 break-words ${muted ? "text-muted-foreground" : ""}`}>{v}</span>
    </div>
  );
}

/** The board link chip: a full url stays as it is, a bare path gets the board host in
    front. */
export function BoardLink({ url }: { url: string }): React.JSX.Element {
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

/** Poster, links and the tmdb words of the title the release is linked to. */
export function TmdbCard({
  info,
  description,
}: {
  info: ReleaseDetail["info"];
  description: { label: string; text: string } | null;
}): React.JSX.Element {
  return (
    <div className="mt-3 rounded-xl border border-hair-12 bg-glass-3 p-3">
      <div className="flex items-start gap-2.5">
        {info.posterPath !== null ? (
          <img
            src={posterUrl(info.posterPath, "w185") ?? ""}
            alt=""
            loading="lazy"
            className="h-[62px] w-11 shrink-0 rounded-md border border-hair-12 object-cover"
          />
        ) : (
          <div className="h-[62px] w-11 shrink-0 rounded-md border border-hair-12 bg-glass-8" />
        )}

        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground">
            {info.kind === "tv" ? "Series" : "Movie"}
            {info.year !== null && ` (${info.year})`}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1">
            {info.boardUrl !== null && <BoardLink url={info.boardUrl} />}

            {info.tmdbId !== null && (
              <a
                href={`https://www.themoviedb.org/${info.kind === "movie" ? "movie" : "tv"}/${info.tmdbId}`}
                target="_blank"
                rel="noreferrer"
                className={`${link} border-acc1/45 bg-acc1/12 text-acc1`}
              >
                TMDB
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2">
        {info.originalName !== null && info.originalName !== info.title && (
          <Zeile k="Original" v={info.originalName} />
        )}

        {info.rating !== null && <Zeile k="Rating" v={`${info.rating.toFixed(1)}/10`} />}

        {info.certification !== null && <Zeile k="Age" v={info.certification} />}

        {info.genres.length > 0 && <Zeile k="Genres" v={info.genres.join(", ")} />}

        {info.season !== null && (
          <Zeile
            k="Season"
            v={`${seasonLabel(info.season)}${
              info.seasonEpisodes !== null ? ` · ${info.seasonEpisodes} episodes` : ""
            }`}
          />
        )}

        {info.tmdbId !== null && <Zeile k="TMDB" v={String(info.tmdbId)} muted />}
      </div>

      {description !== null && (
        <div className="mt-2 border-t border-hair-6 pt-2">
          <div className="mb-1 text-[10px] tracking-[1px] text-muted-foreground uppercase">
            {description.label}
          </div>
          <p className="scroll-thin max-h-32 overflow-y-auto text-[11px] leading-[1.5]">
            {description.text}
          </p>
        </div>
      )}
    </div>
  );
}
