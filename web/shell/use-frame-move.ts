import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useRef } from "react";

/** Position and size of one window frame, in px. */
export type Rect = { x: number; y: number; w: number; h: number };

/** The edges and corners a frame can be dragged in from. */
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Usable desktop area and the smallest frame that is still usable. */
export type Stage = { width: number; height: number; minW: number; minH: number };

/** How much of a frame must stay on screen while dragging. */
const REACHABLE_PX = 80;

/**
 * Move and resize one frame.
 *
 * During a drag the frame moves by writing `style` on the element itself, so the
 * pointer path stays out of React and the window body keeps its render. `commit`
 * runs once, on release: that is where the position enters state and the saved
 * layout.
 */
export function useFrameMove(
  boxRef: RefObject<HTMLElement | null>,
  stage: Stage,
  enabled: boolean,
  commit: (rect: Rect) => void,
) {
  const drag = useRef<{
    mode: "move" | "resize";
    edge?: Edge;
    sx: number;
    sy: number;
    rect: Rect;
  } | null>(null);

  /** Puts one rect on the element as inline style, rounded to whole px. */
  function write(rect: Rect) {
    const el = boxRef.current;
    if (!el) return;
    el.style.left = `${Math.round(rect.x)}px`;
    el.style.top = `${Math.round(rect.y)}px`;
    el.style.width = `${Math.round(rect.w)}px`;
    el.style.height = `${Math.round(rect.h)}px`;
  }

  /** The rect the element really has, so a clamp during the drag is kept. */
  function committed() {
    const el = boxRef.current;
    if (!el) return;
    drag.current = null;
    commit({
      x: Number.parseFloat(el.style.left),
      y: Number.parseFloat(el.style.top),
      w: Number.parseFloat(el.style.width),
      h: Number.parseFloat(el.style.height),
    });
  }

  const begin = (mode: "move" | "resize", edge?: Edge) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return;
    // The window buttons live in the titlebar: a press on one is left to the
    // button.
    if ((e.target as HTMLElement).closest("button")) return;
    const el = boxRef.current;
    if (!el) return;
    // Capture keeps the move events coming while the pointer leaves the frame.
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      edge,
      sx: e.clientX,
      sy: e.clientY,
      rect: {
        x: Number.parseFloat(el.style.left),
        y: Number.parseFloat(el.style.top),
        w: Number.parseFloat(el.style.width),
        h: Number.parseFloat(el.style.height),
      },
    };
  };

  /** One pointer move: the delta onto the start rect, clamped to the stage. */
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    const { minW, minH } = stage;

    if (d.mode === "move") {
      // A drag leaves REACHABLE_PX of the frame inside the stage on every side.
      write({
        x: Math.min(
          Math.max(d.rect.x + dx, -(d.rect.w - REACHABLE_PX)),
          stage.width - REACHABLE_PX,
        ),
        y: Math.min(Math.max(d.rect.y + dy, 0), stage.height - REACHABLE_PX),
        w: d.rect.w,
        h: d.rect.h,
      });
      return;
    }

    // Each edge moves one side of the frame and holds the opposite side still.
    const edge = d.edge ?? "se";
    let { x, y, w, h } = d.rect;
    if (edge.includes("e")) w = Math.max(minW, d.rect.w + dx);
    if (edge.includes("s")) h = Math.max(minH, d.rect.h + dy);
    if (edge.includes("w")) {
      w = Math.min(Math.max(d.rect.w - dx, minW), d.rect.x + d.rect.w);
      x = d.rect.x + (d.rect.w - w);
    }
    if (edge.includes("n")) {
      h = Math.min(Math.max(d.rect.h - dy, minH), d.rect.y + d.rect.h);
      y = d.rect.y + (d.rect.h - h);
    }
    write({ x, y, w, h });
  };

  /** Release: the capture goes away and the rect standing on the element is
      committed. */
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    committed();
  };

  // The handlers: one for the titlebar, one per resize edge.
  return {
    startMove: begin("move"),
    startResize: (edge: Edge) => begin("resize", edge),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  };
}
