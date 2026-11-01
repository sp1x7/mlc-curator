import { resRank } from "@shared/types/band";
import type {
  LibraryFile,
  LibraryRoot,
  LibrarySeason,
  LibraryStand,
  LibraryTitle,
} from "@shared/types/library";
import { qualityOfProbe } from "./format";

// The configured folder itself as a node above the groups. The browser builds
// it; the scan sends the groups directly.
export type LibraryGroup = {
  type: "root-folder";
  name: string;
  path: string;
  children: LibraryNode[];
};

export type LibraryNode = LibraryGroup | LibraryRoot | LibraryTitle | LibrarySeason | LibraryFile;
export type Tone = "ok" | "warn" | "bad" | "";

/** The children of a folder; a file has zero. */
export function childrenOf(node: LibraryNode): LibraryNode[] {
  if (node.type === "file") return [];
  return node.children as LibraryNode[];
}

/** Every file below a node, the node itself when it is one. */
export function filesOf(node: LibraryNode): LibraryFile[] {
  if (node.type === "file") return [node];
  return childrenOf(node).flatMap(filesOf);
}

/** How many files hang below a node. */
export function countFiles(node: LibraryNode): number {
  if (node.type === "file") return 1;
  return childrenOf(node).reduce((total, child) => total + countFiles(child), 0);
}

/** The bytes of every file below a node. */
export function totalSize(node: LibraryNode): number {
  if (node.type === "file") return node.size;
  return childrenOf(node).reduce((total, child) => total + totalSize(child), 0);
}

/** The newest modification time below a node; an empty folder answers "". */
export function lastModified(node: LibraryNode): string {
  if (node.type === "file") return node.modifiedAt;
  return childrenOf(node).map(lastModified).sort().at(-1) ?? "";
}

// A file holds itself; a folder holds what is somewhere below it.
export function hasContents(node: LibraryNode): boolean {
  return node.type === "file" || childrenOf(node).some((child) => hasContents(child));
}

// Titles and loose files: what a folder holds of its own. Groups under the
// configured folder count as entries too; a folder with zero files falls out.
export function countEntries(node: LibraryNode): number {
  return childrenOf(node).filter((child) => {
    if (child.type === "file") return child.flat;
    if (child.type === "season") return false;
    return hasContents(child);
  }).length;
}

/** The video files below a node, samples left out. */
export function videosOf(node: LibraryNode): LibraryFile[] {
  return filesOf(node).filter((file) => file.video && !file.sample);
}

/** The qualities found below a node, best band first. */
export function qualitiesOf(node: LibraryNode): string[] {
  const found = new Set<string>();

  for (const file of videosOf(node)) {
    const quality = qualityOfProbe(file.probe, file.nameInfo);
    if (quality) found.add(quality);
  }

  return [...found].sort((a, b) => resRank(b) - resRank(a));
}

// A season folder counts the files of its own level; nested folders stay out.
export function haveOf(season: LibrarySeason): number {
  return season.children.filter((file) => file.video && !file.sample).length;
}

/** The completeness line of a row: text and tone. */
export function statusOf(node: LibraryNode): { text: string; tone: Tone } {
  if (node.type === "file" && node.flat) {
    return node.tmdb ? { text: "vollzählig", tone: "ok" } : { text: "ohne Titel", tone: "bad" };
  }

  if (node.type === "season") {
    const missing = node.expected - haveOf(node);
    return missing > 0
      ? { text: `${missing} ${missing === 1 ? "Folge" : "Folgen"} fehlen`, tone: "warn" }
      : { text: "vollzählig", tone: "ok" };
  }

  if (node.type !== "title") return { text: "", tone: "" };
  if (node.kind === "other") return { text: "", tone: "" };
  if (!node.tmdb) return { text: "ohne Titel", tone: "bad" };

  if (node.kind === "series") {
    const seasons = node.children.filter(
      (child): child is LibrarySeason => child.type === "season",
    );
    const missingSeasons = Math.max(0, (node.tmdb.seasonsExpected ?? 0) - seasons.length);
    const missingEpisodes = seasons.reduce(
      (total, season) => total + Math.max(0, season.expected - haveOf(season)),
      0,
    );

    if (missingSeasons > 0) {
      return {
        text: `${missingSeasons} ${missingSeasons === 1 ? "Staffel" : "Staffeln"} fehlen`,
        tone: "warn",
      };
    }
    if (missingEpisodes > 0) {
      return {
        text: `${missingEpisodes} ${missingEpisodes === 1 ? "Folge" : "Folgen"} fehlen`,
        tone: "warn",
      };
    }
    return { text: "vollzählig", tone: "ok" };
  }

  const files = videosOf(node).length;
  if (files === 0) return { text: "leer", tone: "bad" };
  if (files > 1) return { text: `${files} Dateien`, tone: "warn" };
  return { text: "vollzählig", tone: "ok" };
}

/** Every node by path, with the node above it. */
export type NodeIndex = {
  byPath: Map<string, LibraryNode>;
  parent: Map<string, LibraryNode | null>;
};

/** Walks the tree once and fills both maps. */
export function indexNodes(nodes: LibraryNode[]): NodeIndex {
  const byPath = new Map<string, LibraryNode>();
  const parent = new Map<string, LibraryNode | null>();

  const walk = (node: LibraryNode, above: LibraryNode | null): void => {
    byPath.set(node.path, node);
    parent.set(node.path, above);
    for (const child of childrenOf(node)) walk(child, node);
  };

  for (const node of nodes) walk(node, null);
  return { byPath, parent };
}

/** The index of the groups of a stand. */
export function indexStand(stand: LibraryStand): NodeIndex {
  return indexNodes(stand.roots);
}

/** The chain from the top of the tree down to a node. */
export function trailOf(node: LibraryNode, index: NodeIndex): LibraryNode[] {
  const parts: LibraryNode[] = [node];
  let current: LibraryNode | null | undefined = index.parent.get(node.path);

  while (current) {
    parts.unshift(current);
    current = index.parent.get(current.path);
  }

  return parts;
}

/** The title folder above a node; a chain of zero titles answers null. */
export function titleAbove(node: LibraryNode, index: NodeIndex): LibraryTitle | null {
  return trailOf(node, index).find((part) => part.type === "title") as LibraryTitle | null;
}
