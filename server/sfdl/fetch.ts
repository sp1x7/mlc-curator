// Board link to the raw info bytes: the board link redirects to sfdl.net,
// which answers a confirmation page first. The bytes arrive only when that
// same url gets its own form back with download=true.

import type { Page } from "../board/http";
import { getPage, postPage } from "../board/http";
import { SfdlError } from "./aes";

// Anything smaller is the confirmation page or a truncated answer.
const MIN_BYTES = 200;
const OK_STATUS = new Set([200, 301, 302, 303, 307, 308]);

/** True when the body opens with a doctype or an html tag. */
function isHtml(body: string): boolean {
  const head = body.slice(0, 300).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
}

/** Throws with status and transport error for an answer outside OK_STATUS. */
function check(page: Page, what: string): void {
  if (!OK_STATUS.has(page.status))
    throw new SfdlError(`${what}: HTTP ${page.status}${page.error ? ` — ${page.error}` : ""}`);
}

/**
 * Follows the board link. An answer that opens as text is the file itself; an
 * html answer is the confirmation page, and its url gets the form with
 * download=true posted back once.
 */
export async function fetchBytes(boardLink: string): Promise<Uint8Array> {
  const first = await getPage(boardLink, 2);
  check(first, "Info-Datei laden");

  // A body that opens as text is the file, as long as it carries the minimum
  // size.
  if (!isHtml(first.body)) {
    if (first.body.length < MIN_BYTES)
      throw new SfdlError(`Info-Datei verdächtig klein (${first.body.length} Byte)`);
    return new TextEncoder().encode(first.body);
  }

  const second = await postPage(first.finalUrl, { download: "true" });
  check(second, "Info-Datei (Bestätigung)");

  if (isHtml(second.body))
    throw new SfdlError("Info-Datei liefert nach Bestätigung weiterhin HTML");
  if (second.body.length < MIN_BYTES)
    throw new SfdlError(`Info-Datei verdächtig klein (${second.body.length} Byte)`);

  return new TextEncoder().encode(second.body);
}
