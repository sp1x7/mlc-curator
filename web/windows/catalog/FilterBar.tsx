import type { AxisKey, ReleaseFilter } from "@shared/types/catalog";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AXES, activeCount } from "./filters";

/** The filter to show, the values the loaded page offers per axis, and the writer. */
type Props = {
  filter: ReleaseFilter;
  values: Record<AxisKey, string[]>;
  onChange: (filter: ReleaseFilter) => void;
};

// A value chip; the values already set stand out.
const chip = (active: boolean): string =>
  `cursor-pointer rounded-md border px-2 py-[3px] text-[10px] transition ${
    active
      ? "border-acc1/45 bg-acc1/14 text-white"
      : "border-hair-10 text-white/55 hover:text-white"
  }`;

// The line that clears every axis.
const reset = "cursor-pointer text-[10px] text-acc1 transition hover:text-white";

// One button, one popup: an axis appears once the loaded page carries values for it.
export function FilterBar({ filter, values, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState({ x: 0, y: 0 });
  const zone = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const active = activeCount(filter);

  // The popup hangs on document.body, where its backdrop blur finds a live surface
  // to sample. Clicks outside and Escape close it.
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

  /** Adds or drops one value on one axis; an axis left with zero values goes out of
      the filter. */
  const toggle = (key: AxisKey, value: string): void => {
    const chosen = filter[key] ?? [];
    const next = chosen.includes(value)
      ? chosen.filter((entry) => entry !== value)
      : [...chosen, value];
    const updated: ReleaseFilter = { ...filter };
    if (next.length === 0) delete updated[key];
    else updated[key] = next;
    onChange(updated);
  };

  // The axes this page carries values for.
  const shown = AXES.filter((axis) => values[axis.key].length > 0);

  return (
    <div ref={zone} className="relative">
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
          setOpen((value) => !value);
        }}
      >
        Filter{active > 0 ? ` · ${active}` : ""}
      </button>

      {open &&
        createPortal(
          <div
            ref={menu}
            className="fixed z-[60] w-[300px] rounded-2xl border border-hair-12 bg-[rgba(18,20,27,.7)] p-3 shadow-[0_18px_44px_rgba(0,0,0,.55)] backdrop-blur-[40px]"
            style={{ left: spot.x, top: spot.y }}
          >
            {/* The panel hangs fixed just below the button. */}
            {shown.length === 0 && (
              <div className="text-[10px] text-muted-foreground">
                Keine Filter in diesem Bereich.
              </div>
            )}

            {shown.map((axis) => (
              <div key={axis.key} className="mb-1.5 flex items-baseline gap-2 last:mb-0">
                <span className="w-[70px] shrink-0 text-[10px] tracking-[1px] text-white/30 uppercase">
                  {axis.label}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {values[axis.key].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={chip((filter[axis.key] ?? []).includes(value))}
                      onClick={() => toggle(axis.key, value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {active > 0 && (
              <div className="pt-1">
                <button type="button" className={reset} onClick={() => onChange({})}>
                  zurücksetzen
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
