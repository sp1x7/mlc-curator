import type { WindowId, WindowParams } from "./window-registry";

/**
 * Window geometry and lifecycle, as plain data.
 *
 * The store is a reducer over this state, and the same shape is what gets
 * saved to `localStorage` — so a reload brings the desktop back as it was,
 * including which windows were open.
 */

export type WindowState = {
  /** The frame stands on the stage. */
  open: boolean;
  /** Frame kept and hidden, reachable through its dock icon. */
  minimized: boolean;
  /** Frame stretched over the stage. */
  maximized: boolean;
  // Place and size in px, written straight onto the element.
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stack order. Higher is in front. */
  z: number;
};

export type Layout = {
  windows: Partial<Record<WindowId, WindowState>>;
  /** Next free z value. Kept so the stack order survives a reload. */
  nextZ: number;
};

/** One change to the layout, always about one window id. */
export type Action =
  | { type: "open"; id: WindowId; x: number; y: number; w: number; h: number }
  | { type: "close"; id: WindowId }
  | { type: "focus"; id: WindowId }
  | { type: "minimize"; id: WindowId }
  | { type: "restore"; id: WindowId }
  | { type: "toggleMaximize"; id: WindowId }
  | { type: "place"; id: WindowId; x: number; y: number; w: number; h: number };

// The layout of a first start: no window open, z counting from 10.
export const EMPTY_LAYOUT: Layout = { windows: {}, nextZ: 10 };

/** Raise to the front and clear `minimized`. Used by open and restore. */
function raise(state: WindowState, nextZ: number): WindowState {
  return { ...state, minimized: false, z: nextZ };
}

/** One action onto the layout; an action for an id the layout does not hold
    returns it unchanged. */
export function reduce(state: Layout, action: Action): Layout {
  const { nextZ } = state;
  const current = state.windows[action.id];

  switch (action.type) {
    case "open": {
      const { id, x, y, w, h } = action;
      if (!current?.open) {
        return {
          nextZ: nextZ + 1,
          windows: {
            ...state.windows,
            [id]: { open: true, minimized: false, maximized: false, x, y, w, h, z: nextZ + 1 },
          },
        };
      }
      // Already open: the same frame is raised. One frame per id, so a second
      // open leaves one copy on the stage.
      return {
        ...state,
        nextZ: nextZ + 1,
        windows: { ...state.windows, [id]: raise(current, nextZ + 1) },
      };
    }

    case "focus":
      if (!current?.open) return state;
      return {
        ...state,
        nextZ: nextZ + 1,
        windows: { ...state.windows, [action.id]: raise(current, nextZ + 1) },
      };

    // The frame goes off the stage; its place stays for the next open.
    case "close":
      if (!current) return state;
      return { ...state, windows: { ...state.windows, [action.id]: { ...current, open: false } } };

    // Kept open and taken out of the front; the dock dot marks it.
    case "minimize":
      if (!current) return state;
      return {
        ...state,
        windows: { ...state.windows, [action.id]: { ...current, minimized: true } },
      };

    // Back on screen and to the front, at the place it had.
    case "restore":
      if (!current) return state;
      return {
        ...state,
        nextZ: nextZ + 1,
        windows: { ...state.windows, [action.id]: raise(current, nextZ + 1) },
      };

    // Flips the stage-filling flag; x, y, w and h keep their values.
    case "toggleMaximize":
      if (!current) return state;
      return {
        ...state,
        windows: { ...state.windows, [action.id]: { ...current, maximized: !current.maximized } },
      };

    // The rect a finished drag committed.
    case "place":
      if (!current) return state;
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.id]: { ...current, x: action.x, y: action.y, w: action.w, h: action.h },
        },
      };
  }
}

// The localStorage slot the layout lives in.
const STORAGE_KEY = "mlc-curator:layout";

/** The saved layout; an absent entry, a shape mismatch or a parse failure answers
    the empty one. */
export function loadLayout(): Layout {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY_LAYOUT;
  try {
    const parsed = JSON.parse(raw) as Layout;
    if (typeof parsed.nextZ !== "number" || typeof parsed.windows !== "object") return EMPTY_LAYOUT;
    return parsed;
  } catch {
    return EMPTY_LAYOUT;
  }
}

/** Writes the whole layout as json. */
export function saveLayout(layout: Layout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

/** Params passed to `open`, keyed by window. */
export type OpenArgs<K extends WindowId> = WindowParams[K];
