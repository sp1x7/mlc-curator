// Tag reader for the flat info file: the document is a root plus plain text
// children, so a tag scan covers it. Values of descriptions and paths carry
// entities from time to time, so every value goes through decodeEntities.

import { decodeEntities } from "../board/thanks";

/** Every value of a tag, namespace prefix accepted, inner tags cut, entities
    decoded. */
export function tagValues(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "gi");

  for (;;) {
    const match = re.exec(xml);
    if (!match) break;
    out.push(decodeEntities(stripInnerTags(match[1] ?? "")));
  }

  return out;
}

/** The first value of a tag, empty text for a tag that stays absent. */
export function tagValue(xml: string, tag: string): string {
  return tagValues(xml, tag)[0] ?? "";
}

/** Name of the root tag in lower case, empty text for a document that opens with
    other characters. */
export function rootName(xml: string): string {
  const match = /<(?:[\w-]+:)?([\w-]+)[\s>]/.exec(stripComments(xml));
  return match?.[1]?.toLowerCase() ?? "";
}

/** True for text that opens with an xml declaration or a tag. */
export function looksLikeXml(text: string): boolean {
  return /^\s*<\?xml/i.test(text) || /^\s*<(?:[\w-]+:)?[A-Za-z_]/.test(text);
}

/** Cuts comment blocks. */
function stripComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, "");
}

/** Cuts nested tags inside a value and trims the text. */
function stripInnerTags(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}
