import type {
  LibraryFile,
  LibraryRoot,
  LibraryStand,
  LibraryTitle,
  ScanState,
} from "@shared/types/library";
import { publish } from "../app/events";
import { passOf } from "../app/pass";
import { libraryRoot, storedRoot } from "./root";
import { type ScanHooks, scanFlatFile, scanLibrary, scanTitle } from "./scan";

// The counters of one pass; the frame around them — running, start, end, the
// reason of a break-off — is the shared one of `server/app/pass.ts`.
function emptyScan(): ScanState {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    folders: 0,
    files: 0,
    probed: 0,
    probeFailures: 0,
    titles: 0,
    resolved: 0,
    error: null,
  };
}

// The last pass, kept in memory only. A restart starts an empty stand again.
function emptyStand(): LibraryStand {
  return { root: null, scannedAt: null, scan: emptyScan(), roots: [] };
}

let stand: LibraryStand = emptyStand();

/** The pass of the library: once at a time, its counters in the frame. */
const pass = passOf<ScanState>(emptyScan);

/** Puts stand and pass back to their empty shape, the state of a fresh process. */
export function resetStand(): void {
  stand = emptyStand();
  pass.reset();
}

/**
 * The current stand in the shape every surface reads. The stored root is read at
 * call time, so each answer names the same folder.
 */
export function currentStand(): LibraryStand {
  return { ...stand, root: storedRoot(), scan: pass.state() };
}

/** True while a scan pass is in flight. */
export function scanRunning(): boolean {
  return pass.state().running;
}

// Progress messages are only useful a few per second.
const PROGRESS_MS = 400;

/** Hooks that count zero and publish zero. */
const quiet: ScanHooks = {
  onFolder: () => {},
  onFile: () => {},
  onProbed: () => {},
  onTmdb: () => {},
  onTree: () => {},
};

/** The part of the last pass one library path belongs to. */
export type Placed = { path: string; title: boolean };

/** The part of the last pass that holds one library path: the title folder, or
 *  the file itself when it lies in the group folder. */
export function placedKey(target: string): Placed | null {
  const root = libraryRoot();
  if (!root) return null;

  const parts = target
    .slice(root.length + 1)
    .split(/[\\/]/)
    .filter(Boolean);
  if (parts.length < 2) return null;

  if (parts.length === 2) return { path: parts.join("/"), title: false };
  return { path: `${parts[0]}/${parts[1]}`, title: true };
}

/** Replaces one title folder or one flat file of the last pass with the disk. */
export async function refreshPlaced(placed: Placed): Promise<void> {
  const root = libraryRoot();
  if (!root) return;

  const [group, name] = placed.path.split("/");
  const node = stand.roots.find((entry) => entry.name === group);
  if (!node) return;

  let found: LibraryTitle | LibraryFile;
  try {
    found = placed.title
      ? await scanTitle(root, placed.path, quiet)
      : await scanFlatFile(root, placed.path, quiet);
  } catch {
    // A pass that broke leaves the node of the last pass standing.
    return;
  }

  const at = node.children.findIndex((child) => child.name === name);
  if (at === -1) node.children.push(found);
  else node.children[at] = found;

  publish("library.changed", pass.state());
}

/** Starts a scan pass; the tree lands in the stand as soon as the walk is
    through. */
export function startScan(): void {
  pass.start(
    (scan) => {
      stand = { root: null, scannedAt: stand.scannedAt, scan, roots: [] };

      let publishedAt = 0;
      const progress = (): void => {
        const now = Date.now();
        if (now - publishedAt < PROGRESS_MS) return;
        publishedAt = now;
        publish("library.scan", scan);
      };

      return scanLibrary({
        onFolder: () => {
          scan.folders += 1;
        },
        onFile: () => {
          scan.files += 1;
        },
        onProbed: (ok) => {
          scan.probed += 1;
          if (!ok) scan.probeFailures += 1;
          progress();
        },
        onTmdb: (found) => {
          scan.titles += 1;
          if (found) scan.resolved += 1;
          progress();
        },
        onTree: (roots: LibraryRoot[]) => {
          stand = { ...stand, roots };
          progress();
        },
      }).then((roots) => {
        // Only a pass that reached its end stamps the library as scanned.
        stand = { root: null, scannedAt: new Date().toISOString(), scan, roots };
      });
    },
    // The frame is closed by then: the end event carries the finished counters.
    (scan) => publish("library.changed", scan),
  );
}
