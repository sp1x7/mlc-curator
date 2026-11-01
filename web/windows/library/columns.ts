import type { LibraryFile, LibrarySeason } from "@shared/types/library";
import { audioText, dateText, QUALITY_LABEL, ratingText, sizeText } from "./format";
import {
  countEntries,
  countFiles,
  haveOf,
  type LibraryNode,
  lastModified,
  qualitiesOf,
  totalSize,
} from "./node";

/** One column: key, label, and whether the value sits right-aligned. */
export type Column = { key: string; label: string; num?: boolean };

// One column set per row shape.
const COLUMNS = {
  root: [
    { key: "name", label: "Ordner" },
    { key: "entries", label: "Einträge", num: true },
    { key: "files", label: "Dateien", num: true },
    { key: "size", label: "Größe", num: true },
    { key: "modified", label: "Geändert" },
  ],
  title: [
    { key: "rating", label: "Bewertung", num: true },
    { key: "name", label: "Ordner" },
    { key: "title", label: "Titel" },
    { key: "year", label: "Jahr", num: true },
    { key: "quality", label: "Qualität" },
    { key: "size", label: "Größe", num: true },
    { key: "modified", label: "Geändert" },
  ],
  season: [
    { key: "name", label: "Ordner" },
    { key: "seasonName", label: "Staffel" },
    { key: "year", label: "Jahr", num: true },
    { key: "quality", label: "Qualität" },
    { key: "episodes", label: "Folgen", num: true },
    { key: "size", label: "Größe", num: true },
    { key: "modified", label: "Geändert" },
  ],
  file: [
    { key: "name", label: "Datei" },
    { key: "episode", label: "Folge" },
    { key: "airDate", label: "Ausgestrahlt" },
    { key: "quality", label: "Qualität" },
    { key: "codec", label: "Codec" },
    { key: "audio", label: "Audio" },
    { key: "size", label: "Größe", num: true },
    { key: "modified", label: "Geändert" },
  ],
  mixed: [
    { key: "rating", label: "Bewertung", num: true },
    { key: "name", label: "Name" },
    { key: "title", label: "Titel" },
    { key: "year", label: "Jahr", num: true },
    { key: "quality", label: "Qualität" },
    { key: "codec", label: "Codec" },
    { key: "size", label: "Größe", num: true },
    { key: "modified", label: "Geändert" },
  ],
  plain: [
    { key: "name", label: "Ordner" },
    { key: "files", label: "Dateien", num: true },
    { key: "size", label: "Größe", num: true },
    { key: "modified", label: "Geändert" },
  ],
  plainFile: [
    { key: "name", label: "Datei" },
    { key: "size", label: "Größe", num: true },
    { key: "modified", label: "Geändert" },
  ],
} satisfies Record<string, Column[]>;

/** A media row: a flat film file, or a title folder that names a work. */
const isMedia = (node: LibraryNode): boolean =>
  node.type === "file" ? node.flat : node.type === "title" && node.kind !== "other";

// The columns follow the rows on screen: the set of child types decides the table.
export function columnsFor(children: LibraryNode[]): Column[] {
  const kinds = new Set(children.map((child) => child.type));

  if (kinds.has("root-folder")) return COLUMNS.root;

  if (kinds.has("title") && kinds.has("file")) {
    return children.some(isMedia) ? COLUMNS.mixed : COLUMNS.plain;
  }
  if (kinds.has("title")) return children.some(isMedia) ? COLUMNS.title : COLUMNS.plain;
  if (kinds.has("season")) return COLUMNS.season;

  if (kinds.has("file")) {
    const files = children as LibraryFile[];
    // A flat file is a title of its own, so the title columns fit it. The file
    // columns are for files inside a season folder: they carry Folge and
    // Ausgestrahlt and leave Titel, Jahr and Bewertung out, which in flat mode hid
    // the assignment of every film.
    if (files.some(isMedia)) return COLUMNS.mixed;

    const known = files.some(
      (file) =>
        file.video &&
        (file.episode !== null || file.nameInfo.quality !== null || file.probe !== null),
    );
    if (!known) return COLUMNS.plainFile;

    const anyEpisode = files.some(
      (file) => file.video && (file.episode !== null || file.nameInfo.episodeLabel !== null),
    );
    return COLUMNS.file.filter((column) => anyEpisode || column.key !== "episode");
  }

  return COLUMNS.title;
}

/** The file of a node, null for a folder. */
function fileOf(node: LibraryNode): LibraryFile | null {
  return node.type === "file" ? node : null;
}

/** The season of a node, null for every other row. */
function seasonOf(node: LibraryNode): LibrarySeason | null {
  return node.type === "season" ? node : null;
}

/** The tmdb title behind a node: a flat file or a title folder. */
function tmdbOf(node: LibraryNode) {
  return node.type === "file" ? node.tmdb : node.type === "title" ? node.tmdb : null;
}

// The measured height decides; the word in the name steps in when the measurement
// stays absent. A folder shows the best of its files.
function qualityOf(node: LibraryNode): string | null {
  if (node.type === "file") {
    return node.probe?.height ? `${node.probe.height}p` : node.nameInfo.quality;
  }
  return qualitiesOf(node)[0] ?? null;
}

/** The lines of one cell: the first carries the value, the rest read quiet
    underneath. */
export function cellLines(node: LibraryNode, key: string): string[] {
  const file = fileOf(node);
  const season = seasonOf(node);

  switch (key) {
    case "name":
      return [node.name];
    case "entries":
      return [String(countEntries(node))];
    case "files":
      return [String(countFiles(node))];
    case "size":
      return [sizeText(totalSize(node))];
    case "modified":
      return [dateText(lastModified(node))];
    case "rating":
      return [ratingText(tmdbOf(node)?.rating ?? null)];
    case "title": {
      const tmdb = tmdbOf(node);
      if (!tmdb) return [];
      return tmdb.originalTitle && tmdb.originalTitle !== tmdb.title
        ? [tmdb.title, tmdb.originalTitle]
        : [tmdb.title];
    }
    case "year": {
      const year = tmdbOf(node)?.year ?? season?.year ?? null;
      return [year === null ? "" : String(year)];
    }
    case "seasonName":
      return [season?.tmdbName ?? (season ? `Staffel ${season.number}` : "")];
    case "quality": {
      if (file) {
        if (!file.video) return [];
        const quality = qualityOf(file);
        return [quality ? (QUALITY_LABEL[quality] ?? quality) : ""];
      }
      return qualitiesOf(node).map((quality) => QUALITY_LABEL[quality] ?? quality);
    }
    case "codec":
      return [file?.video ? (file.probe?.videoCodec ?? file.nameInfo.codec ?? "") : ""];
    case "audio":
      return [file?.video ? audioText(file.probe) || file.nameInfo.audio || "" : ""];
    case "episode": {
      if (!file?.video) return [];
      const lines: string[] = [];
      if (file.episode?.name) lines.push(file.episode.name);
      if (file.nameInfo.episodeLabel) lines.push(file.nameInfo.episodeLabel);
      return lines;
    }
    case "airDate":
      return [file?.episode?.airDate ?? ""];
    case "episodes":
      return [season ? `${haveOf(season)}/${season.expected}` : ""];
    default:
      return [];
  }
}

/** The value a column sorts by; a key off the list sorts by its first cell line. */
export function sortValue(node: LibraryNode, key: string): string | number {
  switch (key) {
    case "size":
      return totalSize(node);
    case "files":
      return countFiles(node);
    case "entries":
      return countEntries(node);
    case "modified":
      return lastModified(node);
    case "rating":
      return tmdbOf(node)?.rating ?? 0;
    case "year": {
      const season = seasonOf(node);
      return tmdbOf(node)?.year ?? season?.year ?? 0;
    }
    case "quality":
      return qualityOf(node) ?? "";
    case "episodes": {
      const season = seasonOf(node);
      return season ? `${haveOf(season)}/${season.expected}` : "";
    }
    default: {
      const [first] = cellLines(node, key);
      return first ?? "";
    }
  }
}
