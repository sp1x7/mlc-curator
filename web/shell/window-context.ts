import { createContext, useContext } from "react";
import type { Rect } from "./use-frame-move";
import type { WindowId, WindowParams } from "./window-registry";

/** What a window body receives. `params` is typed per window in the registry. */
export type WindowContentProps = { params?: unknown };

/**
 * Window control surface for window bodies and the dock.
 *
 * `open` is generic over the window id, so the payload of
 * `open("download", { threadId })` is checked against `WindowParams["download"]`.
 */
export type WindowControls = {
  /** Topmost open, non-minimized window. */
  activeId: WindowId | null;
  minimizedIds: ReadonlySet<WindowId>;
  open<K extends WindowId>(id: K, params?: WindowParams[K]): void;
  focus(id: WindowId): void;
  close(id: WindowId): void;
  minimize(id: WindowId): void;
  restore(id: WindowId): void;
  toggleMaximize(id: WindowId): void;
  place(id: WindowId, rect: Rect): void;
};

export const WindowCtx = createContext<WindowControls | null>(null);

/** The controls of the surrounding manager; a body rendered outside one throws. */
export function useWindows(): WindowControls {
  const ctx = useContext(WindowCtx);
  if (!ctx) throw new Error("useWindows() must be used inside <WindowManager>");
  return ctx;
}

/** Params of the window this body is rendered in. */
export function useParams<T>(): T | undefined {
  return useContext(ParamsCtx) as T | undefined;
}

// Carries the params of one window body down to its `useParams` call.
export const ParamsCtx = createContext<unknown>(undefined);
