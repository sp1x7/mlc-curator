// Info file of a thread: the creator post carries it in a block the board's
// thanks plugin hides (`dis_hhr_hide_thanks::<postid>_1`) up to the first thanks;
// the visible form is `enb_…`. A thanks is a plain GET with its parameters in
// the url, and the plugin allows exactly one per post and user.

import { getPage } from "./http";

export class ThanksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThanksError";
  }
}

// One hide-block per post. The tail group stops at the closing table cells, so
// each match stays inside its own block.
const BLOCK_RE =
  /id="(enb|dis)_hhr_hide_thanks::(\d+)_\d+"[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>\s*<\/td>|$)/g;

const LINK_RE = /href="(https?:\/\/mlcboard\.com\/forum\/sfdl-protect\/[^"]+)"/;
const POST_RE = /id="post_(\d+)"/;

export type InfoBlock = {
  visible: boolean;
  link: string | null;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

// The password is usually the board domain; an entity would otherwise sit
// inside the value that unlocks the file.
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Id of the first post on the page, the post the plugin hides the file in. */
export function firstPostId(html: string): string | null {
  return POST_RE.exec(html)?.[1] ?? null;
}

// A page whose posts carry hide-blocks answers one of them; a page with none
// answers null, the mark of a thread off the sfdl path.
/**
 * Reads the hide-block of the creator post: visible flag plus the sfdl link,
 * with entities decoded so the download path keeps its real characters.
 */
export function parseInfoBlock(html: string): InfoBlock | null {
  const postId = firstPostId(html);
  if (!postId) return null;

  BLOCK_RE.lastIndex = 0;
  for (;;) {
    const match = BLOCK_RE.exec(html);
    if (!match) break;

    // Only the creator post holds the file; later posts hide quotes.
    if (match[2] !== postId) continue;
    if (match[1] !== "enb") return { visible: false, link: null };

    const link = LINK_RE.exec(match[3] ?? "");

    return { visible: true, link: link?.[1] ? decodeEntities(link[1]) : null };
  }

  return null;
}

// Thanks plus one re-read: the board re-renders the post after the thanks, so
// the block shows on a fresh page.

/**
 * Reads the thread, gives a thanks when the block stands hidden, then reads the
 * thread again and reports the block, the post id and whether a thanks went
 * out.
 */
export async function readInfoBlock(
  threadId: number,
): Promise<{ block: InfoBlock | null; postId: string | null; thanksGiven: boolean }> {
  const first = await getPage(`showthread.php?t=${threadId}`);
  if (!first.ok) throw new ThanksError(first.error ?? `Thread-Seite: HTTP ${first.status}`);

  let block = parseInfoBlock(first.body);
  const postId = firstPostId(first.body);
  let thanksGiven = false;

  // A hidden block of a known post triggers the thanks request.
  if (!block?.visible && postId) {
    const gave = await getPage(`showthread.php?thanks_mode=add&postid=${postId}`);
    if (!gave.ok)
      throw new ThanksError(gave.error ?? `Danke-Request fehlgeschlagen: HTTP ${gave.status}`);

    thanksGiven = true;
    const next = parseInfoBlock((await getPage(`showthread.php?t=${threadId}`)).body);
    if (next) block = next;
  }

  return { block, postId, thanksGiven };
}
