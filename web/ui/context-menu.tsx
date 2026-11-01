// The right-click menu. It hangs off document.body: a window blurs its
// backdrop, and a blurred backdrop turns that window into the frame of any
// fixed child, so the menu would sit inside the window and move with it.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem = {
  label: string;
  run: () => void;
  /** Colour of the label, e.g. `text-err`. */
  tone?: string;
};

/** Where the menu opens, what it offers and how it closes. */
type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

// A menu of short labels still fills this width.
const MIN_WIDTH = 224;

export function ContextMenu({ x, y, items, onClose }: Props): React.JSX.Element {
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // A click anywhere on the page closes the menu, and so does Escape.
    const close = (): void => onClose();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Measured after the first paint: the position below needs the real size to keep
  // the menu on screen.
  useEffect(() => {
    const node = document.getElementById("context-menu");
    if (!node) return;

    const rect = node.getBoundingClientRect();
    setBox({ width: rect.width, height: rect.height });
  }, []);

  // The box is pushed back into the viewport and keeps 4 px from its edge.
  const left = Math.max(4, Math.min(x, window.innerWidth - box.width - 6));
  const top = Math.max(4, Math.min(y, window.innerHeight - box.height - 6));

  // The portal target is body, which keeps the fixed position on the viewport.
  return createPortal(
    <div
      id="context-menu"
      role="menu"
      className="fixed z-[9600] rounded-xl border border-hair-12 bg-window px-1 py-1 text-[12px] text-foreground shadow-[0_18px_44px_rgba(0,0,0,.55)] backdrop-blur-[14px]"
      style={{ left, top, minWidth: MIN_WIDTH }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left transition hover:bg-acc1/16 ${item.tone ?? ""}`}
          onClick={item.run}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
