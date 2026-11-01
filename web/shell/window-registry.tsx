import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  BookOpenText,
  Database,
  Download,
  LayoutDashboard,
  LibraryBig,
  Settings,
} from "lucide-react";
import type { ComponentType } from "react";
import { lazy } from "react";

/**
 * The dock areas plus the windows that appear on demand.
 *
 * `Content` is lazy: the module of an area is loaded the first time its window
 * opens, so a window that stays closed leaves its code unloaded.
 */

/** Window identifiers. Opening an unknown id is a type error. */
export type WindowId =
  | "dashboard"
  | "catalog"
  | "library"
  | "wishlist"
  | "downloads"
  | "settings"
  | "db-editor"
  | "download"
  | "organize";

/**
 * Arguments per window. `undefined` means the window opens without arguments.
 * `open()` is checked against this map, so a wrong payload fails at compile
 * time instead of inside the window body.
 */
export type WindowParams = {
  dashboard: undefined;
  catalog: undefined;
  library: undefined;
  wishlist: undefined;
  downloads: undefined;
  settings: undefined;
  "db-editor": undefined;
  /** Opened from the catalog for one board thread, not from the dock. */
  download: { threadId: number; title: string };
  /** The plan of one release folder, opened from a download row. */
  organize: { threadId: number };
};

export type WindowDef = {
  id: WindowId;
  /** Shown in the titlebar and as the dock tooltip. */
  title: string;
  /** Lucide glyph in the dock; `title` carries the wording. */
  icon: LucideIcon;
  /** Whether the window holds a dock slot; a per-release window closes with the
   *  release. */
  inDock: boolean;
  /** Vertical separator before this icon. Separates areas from tools. */
  divider?: boolean;
  /** Default size in px. Overridden by a saved layout. */
  w: number;
  h: number;
  Content: ComponentType;
};

// Each module is loaded on the first open of its window.
const pending = lazy(() => import("@web/windows/pending-area"));
const library = lazy(() => import("@web/windows/library/Library"));
const catalog = lazy(() => import("@web/windows/catalog/Catalog"));
const db = lazy(() => import("@web/windows/db/Db"));
const settings = lazy(() => import("@web/windows/settings/Settings"));
const wishlist = lazy(() => import("@web/windows/wishlist/Wishlist"));
const downloads = lazy(() => import("@web/windows/downloads/Downloads"));
const download = lazy(() => import("@web/windows/download/Download"));
const organize = lazy(() => import("@web/windows/downloads/Organize"));

/** The windows in dock order, left to right. */
export const WINDOWS: WindowDef[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    inDock: true,
    w: 980,
    h: 620,
    Content: pending,
  },
  {
    id: "catalog",
    title: "Catalog",
    icon: BookOpenText,
    inDock: true,
    w: 1100,
    h: 700,
    Content: catalog,
  },
  {
    id: "library",
    title: "Library",
    icon: LibraryBig,
    inDock: true,
    w: 1200,
    h: 760,
    Content: library,
  },
  {
    id: "wishlist",
    title: "Wishlist",
    icon: Bookmark,
    inDock: true,
    w: 1680,
    h: 760,
    Content: wishlist,
  },
  {
    id: "downloads",
    title: "Downloads",
    icon: Download,
    inDock: true,
    w: 900,
    h: 600,
    Content: downloads,
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
    inDock: true,
    divider: true,
    w: 1080,
    h: 760,
    Content: settings,
  },
  {
    id: "db-editor",
    title: "DB-Editor",
    icon: Database,
    inDock: true,
    w: 1240,
    h: 680,
    Content: db,
  },
];

/** The windows that open per item and stay out of the dock. */
export const DIALOG_WINDOWS: WindowDef[] = [
  {
    id: "download",
    title: "Download",
    icon: Download,
    inDock: false,
    w: 860,
    h: 560,
    Content: download,
  },
  {
    id: "organize",
    title: "Organize",
    icon: Download,
    inDock: false,
    w: 1180,
    h: 720,
    Content: organize,
  },
];

// Both lists in one: the order `windowDef` looks in.
export const ALL_WINDOWS: WindowDef[] = [...WINDOWS, ...DIALOG_WINDOWS];

/** The definition of one id; an id off both lists throws. */
export function windowDef(id: WindowId): WindowDef {
  const def = ALL_WINDOWS.find((w) => w.id === id);
  if (!def) throw new Error(`unknown window: ${id}`);
  return def;
}
