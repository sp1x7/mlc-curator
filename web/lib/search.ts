// Fuzzy text match for the search fields.
//
// Every search word has to appear in the text, in order, and a word of five
// letters or more carries one edit of slack. Both sides are folded to tokens
// first, so every comparison runs over whole words.

import { tokensOf } from "@shared/types/text";

// Bounded Levenshtein; stops early when the distance passes `max`.
function edits(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous: number[] = [];
  for (let j = 0; j <= b.length; j += 1) previous.push(j);

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      current[j] = value;
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[b.length] ?? max + 1;
}

/** True when one token stands equal to, inside, or within `budget` edits of the
    other. */
function near(hay: string, needle: string, budget: number): boolean {
  if (hay === needle || hay.includes(needle)) return true;
  // A needle of two letters counts as a prefix alone.
  if (needle.length < 3) return hay.startsWith(needle);

  const shorter = needle.length <= hay.length ? needle : hay;
  const longer = needle.length <= hay.length ? hay : needle;
  if (edits(shorter, longer, budget) <= budget) return true;
  // Scene names run words together: "runner" against "runner2017".
  return edits(shorter, longer.slice(0, shorter.length), budget) <= budget;
}

/** True when every token of the query turns up in the text, in query order. */
export function fuzzyMatch(text: string, query: string): boolean {
  const words = tokensOf(query);
  if (words.length === 0) return true;

  const haystack = tokensOf(text);
  let at = 0;

  for (const word of words) {
    // A word of five letters and up carries one edit of slack.
    const budget = word.length >= 5 ? 1 : 0;
    let found = false;
    while (at < haystack.length && !found) {
      found = near(haystack[at] ?? "", word, budget);
      at += 1;
    }
    if (!found) return false;
  }

  return true;
}
