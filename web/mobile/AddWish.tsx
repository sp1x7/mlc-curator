// Adding a wish on a phone: one sheet with three steps — search, pick a title,
// set the target.

import type { AudioMode, HdrMode, MinRes, WishKind } from "@shared/types/wishlist";
import { type ResolveReply, wishlistApi } from "@web/windows/wishlist/api";
import { useState } from "react";
import { Action, Chips, Note, Poster, Row, Search, Sheet } from "./parts";

// The band picker; the word for `none` is "egal".
const RES: { id: MinRes; label: string }[] = [
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
  { id: "2160p", label: "4K" },
  { id: "none", label: "egal" },
];

// The colour picker in the three words of a wish target.
const HDR: { id: HdrMode; label: string }[] = [
  { id: "any", label: "egal" },
  { id: "only", label: "nur HDR" },
  { id: "never", label: "ohne HDR" },
];

// The language picker.
const AUDIO: { id: AudioMode; label: string }[] = [
  { id: "any", label: "Ton egal" },
  { id: "ger", label: "deutsch" },
  { id: "orig", label: "Original" },
];

/** The title the search returned and a tap picked. */
type Picked = {
  tmdbId: number;
  kind: WishKind;
  title: string;
  year: number | null;
  posterPath: string | null;
};

/** Search, pick and add on one screen; a stored wish closes the sheet. */
export default function AddWish({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<ResolveReply | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [minRes, setMinRes] = useState<MinRes>("1080p");
  const [hdr, setHdr] = useState<HdrMode>("any");
  const [audio, setAudio] = useState<AudioMode>("any");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<string | null>(null);

  /** Asks the resolve endpoint and turns every answer shape into a note or a list. */
  async function search() {
    if (!query.trim()) return;
    setBusy("suchen");
    setNote(null);
    try {
      // error, none and an empty candidate list all read as "nichts gefunden".
      const reply = await wishlistApi.resolve(query.trim());
      setAnswer(reply);
      if ("error" in reply) setNote(reply.error);
      else if ("none" in reply) setNote("nichts gefunden");
      else if ("candidates" in reply && reply.candidates.length === 0) setNote("nichts gefunden");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Suche fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  /** Stores the wish with the picked target, then closes the sheet. */
  async function add() {
    if (!picked) return;
    setBusy("add");
    try {
      await wishlistApi.add({
        tmdbId: picked.tmdbId,
        kind: picked.kind,
        note: null,
        minRes,
        hdr,
        audio,
      });
      onClose();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "fehler beim Speichern");
      setBusy("");
    }
  }

  // A single hit is put into a one-item list, so both answer shapes render the
  // same way.
  const candidates =
    answer && "candidates" in answer
      ? answer.candidates
      : answer && "hit" in answer
        ? [answer.hit]
        : [];

  return (
    <Sheet title="Wunsch hinzufügen" onClose={onClose}>
      {/* The three steps take turns: open search, candidate list, picked title with
          its target. */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <Search value={query} onChange={setQuery} placeholder="Titel, tt-Id oder tmdb-Id" />
          <button
            type="button"
            onClick={() => void search()}
            disabled={busy === "suchen" || !query.trim()}
            className="h-11 shrink-0 rounded-md border border-hair-12 bg-glass-3 px-4 text-[13px] disabled:opacity-50"
          >
            {busy === "suchen" ? "…" : "suchen"}
          </button>
        </div>

        {!picked && candidates.length === 0 && !note && (
          <Note>Titel suchen und das richtige antippen</Note>
        )}

        {!picked && candidates.length > 0 && (
          <div className="border-t border-hair-6">
            {candidates.map((candidate) => (
              <Row
                key={`${candidate.kind}:${candidate.tmdbId}`}
                onClick={() =>
                  setPicked({
                    tmdbId: candidate.tmdbId,
                    kind: candidate.kind,
                    title: candidate.title,
                    year: candidate.year,
                    posterPath: candidate.posterPath,
                  })
                }
              >
                <Poster path={candidate.posterPath} height={68} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px]">{candidate.title}</div>
                  <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {candidate.year ?? "—"} · {candidate.kind === "tv" ? "Serie" : "Film"}
                    {(candidate.voteCount ?? 0) > 0 && (
                      <span> · {candidate.voteCount} Stimmen</span>
                    )}
                  </div>
                </div>
              </Row>
            ))}
          </div>
        )}

        {picked && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Poster path={picked.posterPath} height={132} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] leading-6 font-medium">{picked.title}</div>
                <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {picked.year ?? "—"} · {picked.kind === "tv" ? "Serie" : "Film"}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Chips items={RES} active={minRes} onPick={(id) => setMinRes(id as MinRes)} />
              <Chips items={HDR} active={hdr} onPick={(id) => setHdr(id as HdrMode)} />
              <Chips items={AUDIO} active={audio} onPick={(id) => setAudio(id as AudioMode)} />
            </div>

            <Action label="Auf die Wunschliste" onClick={() => void add()} busy={busy === "add"} />
            <Action label="Anderen Titel suchen" onClick={() => setPicked(null)} />
          </div>
        )}

        {note && <p className="text-[12px] text-wrn">{note}</p>}
      </div>
    </Sheet>
  );
}
