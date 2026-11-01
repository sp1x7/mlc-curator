import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** The three axes of the filter; an empty value lets every wish through. */
export type WishFilter = { status: string; kind: string; minRes: string };

/** The filter and the write of a new one. */
type Props = {
  value: WishFilter;
  onChange: (next: WishFilter) => void;
};

/** The axes of the popup: key, label and the words to pick. */
const CHIP: Array<[keyof WishFilter, string, Array<[string, string]>]> = [
  [
    "status",
    "status",
    [
      ["open", "open"],
      ["part", "partial"],
      ["done", "done"],
    ],
  ],
  [
    "kind",
    "type",
    [
      ["tv", "series"],
      ["movie", "movie"],
    ],
  ],
  [
    "minRes",
    "min res",
    [
      ["720p", "720p"],
      ["1080p", "1080p"],
      ["2160p", "2160p"],
    ],
  ],
];

/** One chip, active or idle. */
const chip = (active: boolean): string =>
  `cursor-pointer rounded-md border px-2 py-[3px] text-[10px] transition ${
    active
      ? "border-acc1/45 bg-acc1/14 text-white"
      : "border-hair-10 text-white/55 hover:text-white"
  }`;

// The line that clears every axis.
const reset = "cursor-pointer text-[10px] text-acc1 transition hover:text-white";

// The filter with every axis cleared.
const EMPTY: WishFilter = { status: "", kind: "", minRes: "" };

/** How many axes carry a value. */
export function activeCount(value: WishFilter): number {
  return [value.status, value.kind, value.minRes].filter(Boolean).length;
}

// One button, one popup: the axes carry the value words of a wish, and a second pick
// on the same axis clears it.
export function FilterBar({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState({ x: 0, y: 0 });
  const zone = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const active = activeCount(value);

  // The popup hangs on document.body: inside a window frame the backdrop blur has no
  // picture left to sample. A click outside and Escape close it.
  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent): void => {
      const at = event.target as Node;
      if (zone.current?.contains(at) || menu.current?.contains(at)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Sets one axis; a pick of the value it already carries clears it. */
  const toggle = (key: keyof WishFilter, picked: string): void => {
    onChange({ ...value, [key]: value[key] === picked ? "" : picked });
  };

  return (
    <div ref={zone} className="relative">
      {/* The button, coloured while the popup stands open or an axis carries a value. */}
      <button
        type="button"
        className={`cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition ${
          open || active > 0
            ? "border-acc1/50 bg-acc1/16 text-acc1"
            : "border-hair-8 bg-glass-3 hover:bg-white/8"
        }`}
        onClick={() => {
          const box = zone.current?.getBoundingClientRect();
          if (box) setSpot({ x: box.left, y: box.bottom + 4 });
          setOpen((state) => !state);
        }}
      >
        Filter{active > 0 ? ` · ${active}` : ""}
      </button>

      {/* The popup, hung under the button on document.body. */}
      {open &&
        createPortal(
          <div
            ref={menu}
            className="fixed z-[60] w-[300px] rounded-2xl border border-hair-12 bg-[rgba(18,20,27,.7)] p-3 shadow-[0_18px_44px_rgba(0,0,0,.55)] backdrop-blur-[40px]"
            style={{ left: spot.x, top: spot.y }}
          >
            {CHIP.map(([key, axis, values]) => (
              <div key={key} className="mb-1.5 flex items-baseline gap-2 last:mb-0">
                <span className="w-[70px] shrink-0 text-[10px] tracking-[1px] text-white/30 uppercase">
                  {axis}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {values.map(([stored, word]) => (
                    <button
                      key={stored}
                      type="button"
                      className={chip(value[key] === stored)}
                      onClick={() => toggle(key, stored)}
                    >
                      {word}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {active > 0 && (
              <div className="pt-1">
                <button type="button" className={reset} onClick={() => onChange(EMPTY)}>
                  reset
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
