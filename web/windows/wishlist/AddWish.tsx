import { posterUrl } from "@shared/types/tmdb";
import type {
  AudioMode,
  HdrMode,
  MinRes,
  ResolveCandidate,
  ResolvedWish,
  WishEntry,
} from "@shared/types/wishlist";
import { useEffect, useRef, useState } from "react";
import { type ResolveReply, wishlistApi } from "./api";

/** A title from the resolver: a full hit or a candidate to pick. */
type Picked = ResolvedWish | ResolveCandidate;

// The look of a plain button.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";
// The button of the main action.
const primary = `${button} border-acc1/30 bg-acc1/16 text-acc1 hover:bg-acc1/24`;
// The search field.
const field =
  "min-w-0 flex-1 rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] outline-none focus:border-acc1/50";
// The field for the note.
const noteField =
  "w-full rounded-lg border border-hair-8 bg-glass-2 px-2 py-1 text-[11px] outline-none focus:border-acc1/50";
// The look of an external link chip.
const link =
  "rounded border border-hair-12 bg-white/5 px-2 py-px text-[9px] uppercase tracking-[0.5px] hover:bg-white/12";

/** One chip, active or idle. */
const pick = (active: boolean): string =>
  `cursor-pointer rounded-md border px-2 py-[3px] text-[10px] transition ${
    active
      ? "border-acc1/45 bg-acc1/14 text-white"
      : "border-hair-10 text-white/55 hover:text-white"
  }`;

// The steps of the resolution target.
const RES: MinRes[] = ["720p", "1080p", "2160p", "none"];
// The hdr choices.
const HDR: HdrMode[] = ["any", "only", "never"];
// The audio choices.
const AUDIO: AudioMode[] = ["any", "ger", "orig"];

/** One target setting as a row of chips. */
function Chips<T extends string>({
  label,
  value,
  values,
  onPick,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onPick(value: T): void;
}) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2 last:mb-0">
      <span className="w-[70px] shrink-0 text-[10px] uppercase tracking-[1px] text-white/30">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((option) => (
          <button
            type="button"
            key={option}
            className={pick(option === value)}
            onClick={() => onPick(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Label and value on one line. */
function Zeile({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className="flex gap-2 py-[2px] text-[11px]">
      <span className="w-[84px] shrink-0 text-muted-foreground">{k}</span>
      <span className={`min-w-0 break-words ${muted ? "text-muted-foreground" : ""}`}>{v}</span>
    </div>
  );
}

/** The dialog: search TMDB, pick a title, set its target and add it. */
export default function AddWish({
  known,
  onClose,
  onAdded,
}: {
  /** The list already standing, checked for the title. */
  known: WishEntry[];
  /** Closes the dialog. */
  onClose(): void;
  /** Hands the added title to the caller. */
  onAdded(picked: Picked): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<ResolveReply | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minRes, setMinRes] = useState<MinRes>("1080p");
  const [hdr, setHdr] = useState<HdrMode>("any");
  const [audio, setAudio] = useState<AudioMode>("any");
  const [note, setNote] = useState("");

  // The focus goes to the field, and Escape closes the dialog.
  useEffect(() => {
    input.current?.focus();

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Looks the text up on TMDB: one hit is picked at once, several wait for a click. */
  const resolve = async (): Promise<void> => {
    const text = query.trim();
    if (!text || busy) return;

    setBusy(true);
    setAnswer(null);
    setPicked(null);
    setError(null);

    try {
      const found = await wishlistApi.resolve(text);
      setAnswer(found);
      if ("hit" in found) setPicked(found.hit);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  // The title already stands on the list with the same tmdb id and kind.
  const chosen = picked;
  const wished =
    chosen !== null &&
    known.some((wish) => wish.tmdbId === chosen.tmdbId && wish.kind === chosen.kind);

  /** Sends the target of the picked title and hands it to the caller. */
  const add = async (): Promise<void> => {
    if (chosen === null || busy) return;

    setBusy(true);
    setError(null);

    try {
      await wishlistApi.add({
        tmdbId: chosen.tmdbId,
        kind: chosen.kind,
        minRes,
        hdr,
        audio,
        note: note.trim() ? note.trim() : null,
      });
      onAdded(chosen);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  // The poster of the picked title, and the hits to choose from.
  const poster = chosen ? posterUrl(chosen.posterPath, "w185") : null;
  const candidates = answer !== null && "candidates" in answer ? answer.candidates : [];

  return (
    <>
      {/* The backdrop; a click closes. */}
      <button
        type="button"
        title="Close"
        aria-label="Close"
        className="absolute inset-0 z-30 cursor-default bg-black/40"
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-6">
        <section className="pointer-events-auto flex w-full max-w-[560px] flex-col overflow-hidden rounded-3xl border border-hair-12 bg-window shadow-[0_28px_70px_rgba(0,0,0,.5)] backdrop-blur-[24px]">
          <header className="relative flex shrink-0 items-center border-b border-hair-8 bg-glass-3 px-3 py-2">
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center truncate px-12 text-xs font-semibold text-white/75">
              Add wish
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                title="Close"
                aria-label="Close"
                className="group/dot flex size-3 cursor-pointer items-center justify-center rounded-full border-[0.5px] border-[#e0443e] bg-[#ff5f57] transition"
                onClick={onClose}
              >
                <span className="pointer-events-none text-[8px] leading-none font-bold text-black/50 opacity-0 transition group-hover/dot:opacity-100">
                  ×
                </span>
              </button>
            </div>
          </header>

          <div className="p-3">
            {/* The search field and its button. */}
            <div className="flex items-center gap-2">
              <input
                ref={input}
                className={field}
                placeholder="title, tt1234567 or tmdb://1399"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void resolve();
                }}
              />
              <button
                type="button"
                className={primary}
                disabled={busy}
                onClick={() => void resolve()}
              >
                {busy ? "…" : "search"}
              </button>
            </div>

            {answer !== null && "none" in answer && (
              <div className="mt-2 text-[11px] text-wrn">nothing on TMDB</div>
            )}

            {/* The hits to choose from. */}
            {candidates.length > 0 && chosen === null && (
              <div className="scroll-thin mt-1.5 max-h-[220px] overflow-y-auto">
                {candidates.map((candidate) => (
                  <button
                    key={`${candidate.kind}-${candidate.tmdbId}`}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-1 text-left transition hover:bg-white/8"
                    onClick={() => setPicked(candidate)}
                  >
                    {candidate.posterPath ? (
                      <img
                        src={posterUrl(candidate.posterPath, "w185") ?? ""}
                        alt=""
                        loading="lazy"
                        className="h-12 w-8 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-8 shrink-0 rounded bg-glass-8" />
                    )}

                    <span className="min-w-0 flex-1 truncate text-[12px]">{candidate.title}</span>

                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {candidate.kind === "tv" ? "series" : "movie"}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {candidate.year ?? "—"} · {candidate.tmdbId}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {candidate.voteCount}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* The picked title, its target chips and the add button. */}
            {chosen !== null && (
              <div className="mt-2 rounded-xl border border-hair-12 bg-glass-3 p-3">
                <div className="flex items-start gap-2.5">
                  {poster !== null ? (
                    <img
                      src={poster}
                      alt=""
                      loading="lazy"
                      className="h-[62px] w-11 shrink-0 rounded-md border border-hair-12 object-cover"
                    />
                  ) : (
                    <div className="h-[62px] w-11 shrink-0 rounded-md border border-hair-12 bg-glass-8" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-muted-foreground">
                      {chosen.kind === "tv" ? "series" : "movie"}
                      {chosen.year !== null && ` (${chosen.year})`}
                    </div>

                    <div className="mt-1 text-[13px] leading-tight break-words">{chosen.title}</div>

                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <a
                        href={`https://www.themoviedb.org/${chosen.kind === "tv" ? "tv" : "movie"}/${chosen.tmdbId}`}
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
                  {chosen.originalTitle !== null && chosen.originalTitle !== chosen.title && (
                    <Zeile k="Original" v={chosen.originalTitle} />
                  )}

                  {"genres" in chosen && chosen.genres.length > 0 && (
                    <Zeile k="Genres" v={chosen.genres.join(", ")} />
                  )}

                  {chosen.voteCount !== null && (
                    <Zeile k="Votes" v={String(chosen.voteCount)} muted />
                  )}

                  <Zeile k="TMDB" v={String(chosen.tmdbId)} muted />

                  {wished && (
                    <div className="mt-1.5 text-[11px] text-wrn">
                      already on the list — its target stands
                    </div>
                  )}
                </div>

                <div className="mt-2 border-t border-hair-6 pt-2">
                  <Chips<MinRes> label="min res" value={minRes} values={RES} onPick={setMinRes} />
                  <Chips<HdrMode> label="hdr" value={hdr} values={HDR} onPick={setHdr} />
                  <Chips<AudioMode> label="audio" value={audio} values={AUDIO} onPick={setAudio} />
                  <input
                    className={noteField}
                    placeholder="note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  {error !== null && (
                    <span className="min-w-0 truncate text-[11px] text-err">{error}</span>
                  )}

                  <button type="button" className={`${button} ml-auto`} onClick={onClose}>
                    cancel
                  </button>
                  <button
                    type="button"
                    className={primary}
                    disabled={busy}
                    onClick={() => void add()}
                  >
                    {wished ? "keep open" : "+ add wish"}
                  </button>
                </div>
              </div>
            )}

            {chosen === null && error !== null && (
              <div className="mt-2 text-[11px] text-err">{error}</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
