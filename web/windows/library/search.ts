// Loose name search: every word of the query has to fit into ONE word of the
// name, letters in order with gaps inside that word, gaps across a word
// boundary left out. "intstl" finds "Interstellar", "tk" leaves
// "The Dark Knight" out.

import { fold } from "@shared/types/text";

// The split between words: anything outside letters and numbers.
const WORD = /[^\p{L}\p{N}]+/u;

/** True when every word of the query fits one word of the name. */
export function fuzzyHit(name: string, query: string): boolean {
  // Folded, but the words stay as the title writes them: an umlaut is written
  // in our alphabet, a cyrillic title keeps its letters.
  const words = fold(name).split(WORD).filter(Boolean);
  const parts = fold(query).split(WORD).filter(Boolean);

  return parts.every((part) => words.some((word) => fits(word, part)));
}

// A doubled letter comes from typing, so it collapses before comparing.
function runs(text: string): string {
  return text.replace(/(.)\1+/gu, "$1");
}

function fits(word: string, part: string): boolean {
  const nameWord = runs(word);
  const wanted = runs(part);

  // A longer word may carry one wrong letter ("Austn", "Austen").
  return inOrder(nameWord, wanted) || (wanted.length >= 5 && distance(nameWord, wanted) <= 1);
}

// Letters of "wanted" in order inside "word", with gaps in between.
function inOrder(word: string, wanted: string): boolean {
  let at = 0;

  for (const letter of wanted) {
    const found = word.indexOf(letter, at);
    if (found === -1) return false;
    at = found + 1;
  }

  return true;
}

/** Edit distance between two words. */
function distance(word: string, wanted: string): number {
  let previous = Array.from({ length: wanted.length + 1 }, (_, index) => index);

  for (let row = 0; row < word.length; row += 1) {
    const current = [row + 1];

    for (let column = 0; column < wanted.length; column += 1) {
      const same = (word[row] ?? "") === (wanted[column] ?? "") ? 0 : 1;
      const changed = (previous[column] ?? 0) + same;
      const shorter = (previous[column + 1] ?? 0) + 1;
      const longer = (current[column] ?? 0) + 1;
      current.push(Math.min(changed, shorter, longer));
    }

    previous = current;
  }

  return previous[wanted.length] ?? 0;
}
