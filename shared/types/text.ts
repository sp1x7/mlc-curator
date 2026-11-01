// How a title reads as text that is compared by hand: one folding for every
// comparison, so the same name always lands on the same string.

/** Roman number words of a title, mapped to the digits they stand for. */
const ROMAN: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
  xvi: 16,
  xvii: 17,
  xviii: 18,
  xix: 19,
  xx: 20,
};

/** Rewrites applied before a comparison: umlauts spelled out, apostrophes
 *  dropped, accented letters written plain, "&" and contractions written out. */
const FOLDINGS: [RegExp, string][] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
  [/&/g, " and "],
  [/i'd/g, "i would"],
  [/you'd/g, "you would"],
  [/he'd/g, "he would"],
  [/she'd/g, "she would"],
  [/we'd/g, "we would"],
  [/they'd/g, "they would"],
  [/'/g, ""],
  [/[’‘]/g, ""],
  [/é|è|ê|ë/g, "e"],
  [/à|â|ã/g, "a"],
  [/í|ì|î|ï/g, "i"],
  [/ó|ò|ô|õ/g, "o"],
  [/ú|ù|û/g, "u"],
  [/ñ/g, "n"],
  [/ç/g, "c"],
  [/ø/g, "o"],
  [/å/g, "a"],
  [/æ/g, "ae"],
  [/đ/g, "d"],
  [/ł/g, "l"],
];

/**
 * Lowercase and folded, with the letters of another alphabet written in ours.
 * Words and word borders stay where they are: a filter that only wants to fold
 * a name keeps its own idea of a word.
 */
export function fold(text: string | null | undefined): string {
  let value = (text ?? "").toLowerCase();
  for (const [pattern, to] of FOLDINGS) value = value.replace(pattern, to);

  return value;
}

/**
 * The comparison form of a title: folded, punctuation dropped, "&" spelled out,
 * contractions opened, "und" == "and", roman numbers arabic and a letter run
 * split from a digit run ("SG1" reads as "sg 1", "Stier 11" as "stier 11").
 * A roman word is looked up as a whole word, so digits only replace a word of
 * its own.
 */
export function norm(text: string | null | undefined): string {
  let value = fold(text).replace(/[^a-z0-9]+/g, " ");
  value = value.replace(/([a-z])(\d)/g, "$1 $2");

  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word === "und" || word === "and") return "und";

      return ROMAN[word] !== undefined ? String(ROMAN[word]) : word;
    })
    .join(" ");
}

/** The words of a title in its comparison form, in order. */
export function tokensOf(text: string | null | undefined): string[] {
  return norm(text).split(" ").filter(Boolean);
}
