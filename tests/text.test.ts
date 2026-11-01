// The folding of names: what a folded text looks like, the comparison form of a
// title, and the words a title is split into.

import { describe, expect, test } from "bun:test";
import { fold, norm, tokensOf } from "@shared/types/text";

describe("folding that keeps the words", () => {
  test("umlauts and sharp s are written in our alphabet", () => {
    expect(fold("Übergröße")).toBe("uebergroesse");
  });

  test("accents lose their marks", () => {
    expect(fold("Éclair À Vélo")).toBe("eclair a velo");
  });

  test("word borders stay where the title has them", () => {
    expect(fold("Die  Ärmel")).toBe("die  aermel");
  });

  test("nothing in is nothing out", () => {
    expect(fold(null)).toBe("");
    expect(fold(undefined)).toBe("");
  });
});

describe("the comparison form of a title", () => {
  test("punctuation is gone and the words stand alone", () => {
    expect(norm("John Wick: Chapter 2 (2017)")).toBe("john wick chapter 2 2017");
  });

  test("the two spellings of a joiner are one word", () => {
    expect(norm("War & Peace")).toBe("war und peace");
    expect(norm("Krieg und Frieden")).toBe("krieg und frieden");
  });

  test("a roman number reads as a plain one", () => {
    expect(norm("Star Trek Vi")).toBe("star trek 6");
    expect(norm("Star Trek 6")).toBe("star trek 6");
  });

  test("a letter run is split from a digit run", () => {
    expect(norm("SG-1")).toBe("sg 1");
  });

  test("an apostrophe opens a word instead of cutting it", () => {
    // The single "i" that is left reads as the number it stands for in a title.
    expect(norm("I'd Like to Fly")).toBe("1 would like to fly");
  });

  test("nothing in is nothing out", () => {
    expect(norm(null)).toBe("");
  });
});

describe("the words of a title", () => {
  test("they are the comparison form, split and without gaps", () => {
    expect(tokensOf("  Das   Boot II  ")).toEqual(["das", "boot", "2"]);
  });

  test("a title with nothing in it has no words", () => {
    expect(tokensOf("!!!")).toEqual([]);
  });
});
