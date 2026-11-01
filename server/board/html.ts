// Board pages: readable text out of the html, plus the board's own error line.

// Named html entities the board writes in titles and posts.
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
  "&bdquo;": "‚",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&sbquo;": ",",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&uuml;": "ü",
  "&Uuml;": "Ü",
  "&auml;": "ä",
  "&Auml;": "Ä",
  "&ouml;": "ö",
  "&Ouml;": "Ö",
  "&szlig;": "ß",
  "&copy;": "©",
  "&reg;": "®",
  "&deg;": "°",
  "&middot;": "·",
};

/** Cuts every tag, keeps the text between them. */
export function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

export function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(ENTITIES)) out = out.split(entity).join(char);
  // Numeric entities (&#8222; and friends) resolve through fromCodePoint.
  return out.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/** Tags off, entities decoded, whitespace collapsed to single spaces. */
export function textOf(html: string): string {
  return decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();
}

/** The text of the error box the board prints on a failed login, null when the
    page carries an empty box. */
export function errorText(html: string): string | null {
  const box = /<div[^>]*class="error"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (!box) return null;
  const message = textOf(box[1] ?? "");
  return message || null;
}
