import type { Release } from "@shared/types/catalog";

/** The columns of the list: key, label, alignment and default width in px. */
export type Column = { key: string; label: string; num?: boolean; width: number };

// Fixed widths: the header and the body are two tables and only explicit
// widths keep their columns aligned.
export const COLUMNS: Column[] = [
  { key: "threadId", label: "Nummer", num: true, width: 84 },
  { key: "rating", label: "★", num: true, width: 52 },
  { key: "title", label: "Titel", width: 520 },
  { key: "year", label: "Jahr", num: true, width: 64 },
  { key: "date", label: "Datum", width: 128 },
  { key: "have", label: "Bib", num: true, width: 48 },
  { key: "ftp", label: "FTP", num: true, width: 48 },
];

// The storage slot of the dragged column widths.
const STORE_KEY = "catalog.spalten";

/** The saved widths; an absent, unparseable or wrong-shaped entry answers an empty
    map. */

export function loadWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  } catch {
    return {};
  }
}

export function saveWidths(widths: Record<string, number>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(widths));
  } catch {
    // A full or blocked storage only costs the saved widths.
  }
}

/** Day and month as two digits. */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Board time as dd.mm.yy, hh:mm; an absent or unparseable stamp answers "".
export function listDate(release: Release): string {
  if (!release.publishedAt) return "";
  const date = new Date(release.publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(2)}, ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

// A linked release shows its tmdb title, the scene name stands behind it.
export function displayTitle(release: Release): string {
  return release.tmdb?.title ?? release.title;
}

// Fuzzy search over the fields a release is known by: the tmdb title the row shows,
// the scene name people type from memory, the tags and the year, so "1080p" and
// "1998" find a row.
//
// Every term of the query has to hit at least one field, and a hit always belongs
// to one field alone; two fields carrying half a term each turn a fuzzy search into
// "matches everything". A term hits as substring, as the start of a word, as the
// initials of a name, or as letters in order inside one word ("blrch" finds
// "bleach").
const WORD_SPLIT = /[^a-z0-9]+/;

/** True when the letters of the term appear in the text in order. */
function inOrder(term: string, text: string): boolean {
  let at = 0;
  for (const char of text) {
    if (char !== term[at]) continue;
    at += 1;
    if (at === term.length) return true;
  }
  return at === term.length;
}

/** One term against one field: substring, word start, name initials, or in-word
    letter gaps. */
function termHit(term: string, field: string): boolean {
  if (field.includes(term)) return true;
  if (term.length < 2) return false;

  const words = field.split(WORD_SPLIT);
  for (const word of words) {
    if (word.startsWith(term)) return true;
  }

  // "tybw" finds "thousand year blood war": the letters of the word starts.
  const initials = words.map((word) => word[0] ?? "").join("");
  if (initials.includes(term)) return true;

  // Gaps only pay off from three letters up; shorter terms would hit nearly
  // every scene name.
  return term.length >= 3 && words.some((word) => inOrder(term, word));
}

/** True when every term of the query hits at least one field of the release. */
export function searchHit(release: Release, query: string): boolean {
  const terms = query.trim().toLowerCase().split(WORD_SPLIT).filter(Boolean);
  if (terms.length === 0) return true;

  const fields = [
    displayTitle(release),
    release.title,
    release.name,
    release.tmdb?.originalTitle ?? "",
    release.tags.join(" "),
    releaseYear(release) ?? "",
  ].map((field) => field.toLowerCase());

  return terms.every((term) => fields.some((field) => termHit(term, field)));
}

/** The tmdb rating as one decimal; an absent rating answers "". */
export function ratingText(release: Release): string {
  const rating = release.tmdb?.rating;
  return rating ? rating.toFixed(1) : "";
}

// The text behind the library dot: an unlinked title, a title off the library, or
// the counts of the last scan.
export function holdText(release: Release): string {
  if (!release.tmdb) return "ohne Titel, nicht aufzufinden";
  if (!release.have) return "nicht in der Bibliothek";

  const { files, seasons } = release.have;
  if (release.tmdb.kind === "tv") {
    if (seasons === 0) return "in der Bibliothek: Titelordner ohne Staffel";
    return `in der Bibliothek: ${seasons} ${seasons === 1 ? "Staffel" : "Staffeln"}, ${files} ${files === 1 ? "Datei" : "Dateien"}`;
  }

  return `in der Bibliothek: ${files} ${files === 1 ? "Datei" : "Dateien"}`;
}

// The year of a release: the year tag first, the tmdb year second, null for
// neither.
export function releaseYear(release: Release): string | null {
  const tag = release.tags.find((entry) => entry.startsWith("year:"));
  if (tag) return tag.slice(5);
  return release.tmdb?.year ? String(release.tmdb.year) : null;
}

// Season and episode marks as the board writes them into tags.
const SE_TAG = /^S(\d{1,3})(?:E(\d{1,3}))?$/i;

// Tags hold "S04E11", a merged pair, or a bare season; the first mark found wins.
export function episodeMark(release: Release): string | null {
  for (const tag of release.tags) {
    const mark = SE_TAG.exec(tag);
    if (!mark) continue;

    const season = `S${pad(Number(mark[1]))}`;
    return mark[2] ? `${season}E${pad(Number(mark[2]))}` : season;
  }

  return null;
}

/** The value a column sorts by; a key off the list sorts by 0. */
export function sortValue(release: Release, key: string): string | number {
  switch (key) {
    case "threadId":
      return release.threadId;
    case "rating":
      return release.tmdb?.rating ?? 0;
    case "date":
      return release.publishedAt ? Date.parse(release.publishedAt) : 0;
    case "year":
      return Number(releaseYear(release) ?? 0);
    case "title":
      return displayTitle(release).toLowerCase();
    default:
      return 0;
  }
}
