import { cn } from "@web/lib/utils";
import type { ComponentType } from "react";
import { memo, Suspense, useRef } from "react";
import { STAGE_BOTTOM, TITLEBAR_H, WINDOW_MIN_H, WINDOW_MIN_W } from "./constants";
import type { Rect } from "./use-frame-move";
import { type Edge, useFrameMove } from "./use-frame-move";
import { ParamsCtx } from "./window-context";

export type WindowProps = {
  title: string;
  rect: Rect;
  z: number;
  maximized: boolean;
  onFocus(): void;
  onClose(): void;
  onMinimize(): void;
  onMaximize(): void;
  /** Final position after a drag or a resize. */
  onPlace(rect: Rect): void;
  /**
   * Body component plus its payload. The component is created once, so `memo`
   * on this frame holds and a drag leaves the body standing.
   */
  Content: ComponentType;
  /** Payload of this window; read in the body with `useParams()`. */
  params: unknown;
};

// The eight grab areas: the edges as bars, the corners as squares.
const EDGES: Array<{ dir: Edge; classes: string }> = [
  { dir: "n", classes: "top-0 left-2 right-2 h-1.5 cursor-n-resize" },
  { dir: "s", classes: "bottom-0 left-2 right-2 h-1.5 cursor-s-resize" },
  { dir: "w", classes: "left-0 top-2 bottom-2 w-1.5 cursor-w-resize" },
  { dir: "e", classes: "right-0 top-2 bottom-2 w-1.5 cursor-e-resize" },
  { dir: "nw", classes: "top-0 left-0 size-2.5 cursor-nw-resize" },
  { dir: "ne", classes: "top-0 right-0 size-2.5 cursor-ne-resize" },
  { dir: "sw", classes: "bottom-0 left-0 size-2.5 cursor-sw-resize" },
  { dir: "se", classes: "bottom-0 right-0 size-2.5 cursor-se-resize" },
];

/**
 * The frame: titlebar with the three dots, drag, resize handles and the body slot.
 * Position and size arrive as props, and every finished change goes out through
 * `onPlace`.
 */
function WindowInner({
  title,
  rect,
  z,
  maximized,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onPlace,
  Content,
  params,
}: WindowProps) {
  const boxRef = useRef<HTMLElement | null>(null);

  const frame = useFrameMove(
    boxRef,
    {
      width: window.innerWidth,
      height: window.innerHeight - STAGE_BOTTOM,
      minW: WINDOW_MIN_W,
      minH: WINDOW_MIN_H,
    },
    !maximized,
    onPlace,
  );

  return (
    <section
      ref={boxRef}
      data-slot="window"
      className="fixed flex flex-col overflow-hidden rounded-3xl border border-hair-12 bg-window shadow-[0_28px_70px_rgba(0,0,0,.5)] backdrop-blur-[24px]"
      style={
        maximized
          ? { inset: `0 0 ${STAGE_BOTTOM}px 0`, zIndex: z }
          : { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }
      }
      onPointerDown={onFocus}
    >
      <header
        role="toolbar"
        aria-label="Titelleiste"
        tabIndex={0}
        className={cn(
          "relative flex shrink-0 select-none items-center border-b border-hair-8 bg-glass-3 focus-visible:outline-none",
          maximized ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{ height: TITLEBAR_H }}
        onPointerDown={frame.startMove}
        onPointerMove={frame.onPointerMove}
        onPointerUp={frame.onPointerUp}
        onPointerCancel={frame.onPointerCancel}
        onDoubleClick={onMaximize}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onMaximize();
          }
        }}
      >
        {/* The title sits in the middle of the row, the dots at its right end. */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center truncate px-16 text-xs font-semibold text-white/75">
          {title}
        </span>
        <div className="ml-auto flex items-center gap-2 pr-3">
          <TitleDot
            color="border-[#e0443e] bg-[#ff5f57]"
            title="Close"
            glyph="×"
            onClick={onClose}
          />
          <TitleDot
            color="border-[#d89e24] bg-[#febc2e]"
            title="Minimize"
            glyph="–"
            onClick={onMinimize}
          />
          <TitleDot
            color="border-[#1e9e31] bg-[#28c840]"
            title="Maximize"
            glyph="+"
            onClick={onMaximize}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {/* A lazy area holds an empty box of the same height. */}
        <Suspense fallback={<div className="h-full" />}>
          <ParamsCtx.Provider value={params}>
            <Content />
          </ParamsCtx.Provider>
        </Suspense>
      </div>

      {/* A maximized frame takes pointer input on none of its handles. */}
      {EDGES.map(({ dir, classes }) => (
        <span
          key={dir}
          aria-hidden
          className={cn("absolute z-10", classes, maximized && "pointer-events-none")}
          onPointerDown={frame.startResize(dir)}
          onPointerMove={frame.onPointerMove}
          onPointerUp={frame.onPointerUp}
          onPointerCancel={frame.onPointerCancel}
        />
      ))}
    </section>
  );
}

const Window = memo(WindowInner);
export default Window;

/** macOS-style dot; the glyph appears on hover. */
function TitleDot({
  color,
  title,
  glyph,
  onClick,
}: {
  color: string;
  title: string;
  glyph: string;
  onClick(): void;
}) {
  // A press on a dot is stopped there, so the titlebar starts no drag.
  return (
    <button
      type="button"
      title={title}
      className={cn(
        "group/dot flex size-3 cursor-pointer items-center justify-center rounded-full border-[0.5px] transition",
        color,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      <span className="pointer-events-none text-[8px] leading-none font-bold text-black/50 opacity-0 transition group-hover/dot:opacity-100">
        {glyph}
      </span>
    </button>
  );
}
