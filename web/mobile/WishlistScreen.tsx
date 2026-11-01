// The wish list on a phone: one row per wish with its progress, a filter chip per
// status, and a sheet with target, seasons and board offers.

import type { WishEntry, WishStatus } from "@shared/types/wishlist";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { settingsApi } from "@web/windows/settings/api";
import { wishlistApi } from "@web/windows/wishlist/api";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import AddWish from "./AddWish";
import { Action, Chips, day, Field, Note, Poster, Row, Sheet } from "./parts";

// The colour of a status, used on counts and progress bars.
const TONE: Record<WishStatus, string> = {
  open: "text-muted-foreground",
  part: "text-wrn",
  done: "text-ok",
};

// The word a status reads as.
const LABEL: Record<WishStatus, string> = {
  open: "offen",
  part: "teilweise",
  done: "voll",
};

// The filter chips; `all` lets every row through.
const FILTERS = [
  { id: "open", label: "offen" },
  { id: "part", label: "teilweise" },
  { id: "done", label: "voll" },
  { id: "all", label: "alle" },
];

/** The rows of one status chip, the counts of every chip and the check button. */
export default function WishlistScreen() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: KEYS.wishlist.list, queryFn: wishlistApi.list });
  const [filter, setFilter] = useState("open");
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");

  // One chip decides the status on screen; `all` keeps every row.
  const rows = (list.data?.rows ?? []).filter((wish) => filter === "all" || wish.status === filter);
  // The tapped wish, looked up in the unfiltered rows.
  const open = openId === null ? null : (list.data?.rows.find((w) => w.id === openId) ?? null);
  const counts = list.data?.rows ?? [];

  // One upgrade check; its results land in the wish queries, refreshed here on
  // success.
  async function check() {
    setNotice("check läuft");
    try {
      await settingsApi.startCheck();
      setNotice("");
      await client.invalidateQueries({ queryKey: KEYS.wishlist.all });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "check fehlgeschlagen");
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 space-y-2 border-b border-hair-6 bg-background px-3 pt-3 pb-2">
        <Chips
          items={FILTERS.map((entry) => ({
            ...entry,
            count:
              entry.id === "all"
                ? counts.length
                : counts.filter((wish) => wish.status === entry.id).length,
          }))}
          active={filter}
          onPick={setFilter}
        />
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            {list.data?.scannedAt
              ? `Bibliothekstand ${day(list.data.scannedAt)}`
              : "kein Bibliotheksstand"}
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-hair-12 px-3 text-[12px] text-muted-foreground"
          >
            <Plus size={14} /> Wunsch
          </button>
          <button
            type="button"
            onClick={() => void check()}
            className="h-8 shrink-0 rounded-md border border-hair-12 px-3 text-[12px] text-muted-foreground"
          >
            check
          </button>
        </div>

        {notice && <p className="text-[12px] text-wrn">{notice}</p>}
      </div>

      {adding && <AddWish onClose={() => setAdding(false)} />}

      {rows.length === 0 ? (
        <Note>{list.isLoading ? "lädt …" : "nichts auf der Wunschliste"}</Note>
      ) : (
        <div className="pb-2">
          {rows.map((wish) => (
            <Row key={wish.id} onClick={() => setOpenId(wish.id)}>
              <Poster path={wish.identity.posterPath} height={68} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px]">{wish.identity.title}</div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[11px] tabular-nums">
                  <span className="text-muted-foreground">
                    {wish.identity.year ?? "—"} · {LABEL[wish.status]}
                  </span>
                  <span className={TONE[wish.status]}>
                    {wish.progress.have}/{wish.progress.expected || "—"}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-[2px] bg-glass-8">
                  <span
                    className={`block h-1 rounded-[2px] ${wish.status === "done" ? "bg-ok" : "bg-wrn"}`}
                    style={{
                      width: `${Math.min(100, ratio(wish) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </Row>
          ))}
        </div>
      )}

      {open && (
        <Detail
          wish={open}
          onClose={() => setOpenId(null)}
          onRemove={async () => {
            await wishlistApi.remove(open.id);
            setOpenId(null);
            await client.invalidateQueries({ queryKey: KEYS.wishlist.all });
          }}
        />
      )}
    </div>
  );
}

/** One wish as a sheet: identity, target, seasons and the board offers that were
    measured against it. */
function Detail({
  wish,
  onClose,
  onRemove,
}: {
  wish: WishEntry;
  onClose: () => void;
  onRemove: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const identity = wish.identity;

  return (
    <Sheet title={identity.title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <Poster path={identity.posterPath} height={150} />
          <div className="min-w-0 flex-1 space-y-1 text-[12px] text-muted-foreground">
            <div className="text-[14px] text-foreground">{identity.year ?? "—"}</div>
            {identity.rating !== null && (
              <div className="text-ok">★ {identity.rating.toFixed(1)}</div>
            )}
            <div>
              {wish.kind === "tv" ? "Serie" : "Film"} · {LABEL[wish.status]}
            </div>
            <div>
              {wish.progress.have}/{wish.progress.expected || "—"} · {wish.missing}
            </div>
            {identity.genres.length > 0 && <div>{identity.genres.join(", ")}</div>}
          </div>
        </div>

        {identity.overview && (
          <p className="text-[13px] leading-5 text-muted-foreground">{identity.overview}</p>
        )}

        <div>
          <Field
            label="Ziel"
            value={`${wish.target.minRes === "none" ? "egal" : wish.target.minRes} · HDR ${wish.target.hdr} · Ton ${wish.target.audio}`}
          />
          <Field label="Notiz" value={wish.note} />
          <Field label="In der Bibliothek" value={wish.inLibrary ? "ja" : "nein"} />
          <Field label="Gewünscht seit" value={day(wish.createdAt)} />
        </div>

        {wish.seasons.length > 0 && (
          <Section title="Staffeln">
            {wish.seasons.map((season) => (
              <Row key={season.number} onClick={onClose}>
                <div className="flex w-full items-baseline gap-2 font-mono text-[12px] tabular-nums">
                  <span>S{String(season.number).padStart(2, "0")}</span>
                  <span className={TONE[season.status]}>
                    {season.have}/{season.expected || "—"}
                  </span>
                  {season.res && (
                    <span className="ml-auto text-muted-foreground">{season.res}</span>
                  )}
                </div>
              </Row>
            ))}
          </Section>
        )}

        {wish.matches.length > 0 && (
          <Section title="Was das Board bietet">
            {wish.matches.slice(0, 8).map((match) => (
              <div
                key={match.threadId}
                className="flex items-start gap-2 border-b border-hair-6 py-2.5"
              >
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${match.verdict === "ok" ? "bg-ok" : "bg-glass-8"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] break-words">{match.title}</div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {day(match.publishedAt)}
                    {match.why ? ` · ${match.why}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </Section>
        )}

        <Action
          label="Von der Wunschliste"
          danger
          busy={busy}
          onClick={() => {
            setBusy(true);
            void onRemove().finally(() => setBusy(false));
          }}
        />
      </div>
    </Sheet>
  );
}

/** A titled block inside the sheet. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] uppercase text-muted-foreground">{title}</h3>
      <div className="border-t border-hair-6">{children}</div>
    </div>
  );
}

/** Fraction of the progress bar: an empty expectation answers 1 for a done wish and
    0 for every other status. */
function ratio(wish: WishEntry): number {
  if (wish.progress.expected <= 0) return wish.status === "done" ? 1 : 0;
  return wish.progress.have / wish.progress.expected;
}
