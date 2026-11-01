// The pieces every phone screen shares: a full-screen sheet for detail, rows and
// targets sized for a finger, and text helpers for sizes and dates.

import { type PosterSize, posterUrl } from "@shared/types/tmdb";
import { cn } from "@web/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Full screen above the tab bar; the cross in the header closes it. The header and
    the body add the safe-area insets of the device. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex shrink-0 items-center gap-1 border-b border-hair-8 pr-3 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Zurück"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-glass-8"
        >
          <X size={20} />
        </button>
        <h2 className="min-w-0 truncate pb-3 text-[15px] leading-6 font-medium">{title}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        {children}
      </div>
    </div>
  );
}

/** The whole row is the button: 56 px high, with a pressed background. */
export function Row({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[56px] w-full items-center gap-3 border-b border-hair-6 px-3 text-left active:bg-glass-3"
    >
      {children}
    </button>
  );
}

/** Poster of a title; an absent path leaves an empty box of the same height, so
    rows keep their line. */
export function Poster({
  path,
  size = "w185",
  height = 76,
}: {
  path: string | null;
  size?: PosterSize;
  height?: number;
}) {
  const url = posterUrl(path, size);
  // Posters stand 2:3, so the width follows the height.
  const width = Math.round(height * 0.67);
  const box = `shrink-0 rounded-[3px] object-cover`;

  if (!url) return <span style={{ width: height, height }} className="bg-glass-8 rounded-[3px]" />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      style={{ width, height }}
      className={cn("bg-glass-8", box)}
    />
  );
}

/** Marker dot; its text sits in `title` and `aria-label`, a finger has no hover. */
export function Dot({ on, title, ok }: { on: boolean; title: string; ok?: boolean }) {
  return (
    <span
      role="img"
      title={title}
      aria-label={title}
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        on ? (ok ? "bg-ok" : "bg-acc1") : "bg-glass-8",
      )}
    />
  );
}

/** One-line search field, 44 px high. */
export function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-md border border-hair-12 bg-glass-3 px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-acc1"
    />
  );
}

/** Chips in a row that scrolls sideways: categories, groups, filters. A count is
    optional and prints behind the label. */
export function Chips({
  items,
  active,
  onPick,
}: {
  items: { id: string; label: string; count?: number }[];
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] whitespace-nowrap",
            item.id === active
              ? "border-acc1 text-acc1"
              : "border-hair-12 text-muted-foreground active:bg-glass-3",
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="font-mono tabular-nums opacity-70">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** One line of the detail sheet: label left, value right; an empty value renders
    zero lines. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-baseline gap-3 border-b border-hair-6 py-2.5">
      <span className="shrink-0 text-[11px] uppercase text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-right text-[13px] break-words">{value}</span>
    </div>
  );
}

/** A 48 px button: `href` renders a link, `busy` shows an ellipsis and blocks the
    press, `danger` paints the error palette. */
export function Action({
  onClick,
  label,
  busy,
  danger,
  href,
}: {
  onClick?: () => void;
  label: string;
  busy?: boolean;
  danger?: boolean;
  href?: string;
}) {
  const classes = cn(
    "flex h-12 w-full items-center justify-center rounded-md border text-[13px] disabled:opacity-50",
    danger ? "border-err/40 text-err" : "border-hair-12 bg-glass-3 active:bg-glass-8",
  );
  const body = busy ? "…" : label;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={classes}
        aria-disabled={busy || undefined}
      >
        {body}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className={classes}>
      {body}
    </button>
  );
}

/** The standing place for a message in the middle of a screen. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">{children}</p>;
}

/** Bytes as GiB from one gibibyte up, MiB below. */
export function bytes(size: number): string {
  const gib = size / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  return `${Math.round(size / 1024 ** 2)} MiB`;
}

/** A date as dd/MM/yyyy in German locale; a number counts epoch seconds, an absent
    or unparseable value answers "". */
export function day(value: string | number | null): string {
  if (value === null) return "";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
