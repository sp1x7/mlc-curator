import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { STAGE_BOTTOM, WINDOW_CASCADE } from "./constants";
import type { Rect } from "./use-frame-move";
import Window from "./Window";
import type { WindowControls } from "./window-context";
import { WindowCtx } from "./window-context";
import type { WindowId, WindowParams } from "./window-registry";
import { ALL_WINDOWS, windowDef } from "./window-registry";
import { EMPTY_LAYOUT, loadLayout, reduce, saveLayout } from "./window-store";

/**
 * Owns the desktop: which windows are open, where they are, which one is on top.
 * The state starts from the saved layout, and every change is written back, so a
 * reload brings the desktop as it was.
 */
export default function WindowManager({ children }: { children: ReactNode }) {
  const [layout, dispatch] = useReducer(reduce, EMPTY_LAYOUT, loadLayout);

  // Every change of the layout goes to localStorage.
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  /** Layout of the current render, for callbacks that stay stable. */
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  /** Payload per window, written by `open`, read by the window body. */
  const [params, setParams] = useState<Partial<Record<WindowId, unknown>>>({});

  /** Centred, then shifted by `WINDOW_CASCADE` per already open window. */
  const open = useCallback(<K extends WindowId>(id: K, args?: WindowParams[K]) => {
    const def = windowDef(id);
    const openCount = Object.values(layoutRef.current.windows).filter((w) => w?.open).length;
    const stageW = window.innerWidth;
    const stageH = window.innerHeight - STAGE_BOTTOM;
    const offset = openCount * WINDOW_CASCADE;
    if (args !== undefined) setParams((current) => ({ ...current, [id]: args }));
    dispatch({
      type: "open",
      id,
      x: clampNum((stageW - def.w) / 2 + offset, 0, stageW - def.w),
      y: clampNum((stageH - def.h) / 2 + offset, 0, stageH - def.h),
      w: def.w,
      h: def.h,
    });
  }, []);

  const focus = useCallback((id: WindowId) => dispatch({ type: "focus", id }), []);
  const close = useCallback((id: WindowId) => dispatch({ type: "close", id }), []);
  const minimize = useCallback((id: WindowId) => dispatch({ type: "minimize", id }), []);
  const restore = useCallback((id: WindowId) => dispatch({ type: "restore", id }), []);
  const toggleMaximize = useCallback(
    (id: WindowId) => dispatch({ type: "toggleMaximize", id }),
    [],
  );
  const place = useCallback(
    (id: WindowId, rect: Rect) =>
      dispatch({ type: "place", id, x: rect.x, y: rect.y, w: rect.w, h: rect.h }),
    [],
  );

  // The front window is the open one with the highest z; a minimized frame joins
  // the set instead.
  const { activeId, minimizedIds } = useMemo(() => {
    let active: WindowId | null = null;
    let topZ = -1;
    const minimized = new Set<WindowId>();
    for (const [id, state] of Object.entries(layout.windows)) {
      if (!state?.open) continue;
      if (state.minimized) {
        minimized.add(id as WindowId);
        continue;
      }
      if (state.z > topZ) {
        topZ = state.z;
        active = id as WindowId;
      }
    }
    return { activeId: active, minimizedIds: minimized as ReadonlySet<WindowId> };
  }, [layout]);

  // One controls object for the whole tree; it changes with the layout.
  const controls = useMemo<WindowControls>(
    () => ({
      activeId,
      minimizedIds,
      open,
      focus,
      close,
      minimize,
      restore,
      toggleMaximize,
      place,
    }),
    [activeId, minimizedIds, open, focus, close, minimize, restore, toggleMaximize, place],
  );

  return (
    <WindowCtx.Provider value={controls}>
      {/* The stage ends above the status bar row. */}
      <div
        data-slot="window-layer"
        className="fixed inset-0 z-10 overflow-hidden"
        style={{ bottom: STAGE_BOTTOM }}
      >
        {ALL_WINDOWS.map((def) => {
          const state = layout.windows[def.id];
          // A minimized frame stays in state and is left out of the render.
          if (!state?.open || state.minimized) return null;
          return (
            <Window
              key={def.id}
              title={def.title}
              params={params[def.id]}
              rect={{ x: state.x, y: state.y, w: state.w, h: state.h }}
              z={state.z}
              maximized={state.maximized}
              Content={def.Content}
              onFocus={() => focus(def.id)}
              onClose={() => close(def.id)}
              onMinimize={() => minimize(def.id)}
              onMaximize={() => toggleMaximize(def.id)}
              onPlace={(rect) => place(def.id, rect)}
            />
          );
        })}
      </div>
      {children}
    </WindowCtx.Provider>
  );
}

/** Rounds and pulls the value into the range; an inverted range still answers min. */
function clampNum(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), Math.max(min, max));
}
