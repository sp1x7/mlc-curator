import { bandLabel, bandOf, probeRes, tagRes, wantedRes } from "@shared/types/band";
import type { Probe } from "@shared/types/library";
import type { AudioMode, HdrMode, MinRes, WishTarget } from "@shared/types/wishlist";

// One target, two measurement sources: the tags of a scene name on the board and
// the probe of a file on disk. Both go through the same three rules. The height
// ladder comes from `@shared/types/band`.

export type Check = { ok: boolean; why: string | null };

const GERMAN = ["de", "deu", "ger", "deutsch", "german"];
const ENGLISH = ["en", "eng", "english"];

/** Trims and lowercases a word. */
function norm(value: string): string {
  return value.trim().toLowerCase();
}

/** True for a language word that names German. */
function isGerman(value: string): boolean {
  const word = norm(value);
  return GERMAN.some((language) => word === language || word.startsWith(language));
}

// tmdb writes "en", the probe writes "eng"; short codes match each other both ways.
function sameLanguage(value: string, wanted: string): boolean {
  const a = norm(value);
  const b = norm(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length <= 3 && b.length <= 3 && (a.startsWith(b) || b.startsWith(a));
}

/** True when the tag list holds hdr or dv. */
export function tagHdr(tags: string[]): boolean {
  return tags.includes("hdr") || tags.includes("dv");
}

/** True when the probe names an hdr format. */
export function probeHdr(probe: Probe): boolean {
  return probe.hdr !== null && probe.hdr.trim() !== "";
}

/** The band rule: the found height has to reach the wanted band, and an absent
    measurement answers the missing text. */
export function resCheck(min: MinRes, found: number | null, missingText: string): Check {
  const wanted = wantedRes(min);
  if (wanted === 0) return { ok: true, why: null };
  if (found === null) return { ok: false, why: missingText };

  const band = bandOf(found);
  if (band !== null && band < wanted) {
    return { ok: false, why: `below target: ${bandLabel(found)} < ${min}` };
  }

  return { ok: true, why: null };
}

/** The colour rule: mode `only` refuses an sdr file, mode `never` refuses an hdr
    file. */
export function hdrCheck(mode: HdrMode, isHdr: boolean): Check {
  if (mode === "only" && !isHdr) return { ok: false, why: "file is sdr" };
  if (mode === "never" && isHdr) return { ok: false, why: "hdr, obwohl never gewünscht" };
  return { ok: true, why: null };
}

/** The language rule: ger wants a German track, orig wants the language of the
    original title. */
export function audioCheck(mode: AudioMode, languages: string[], original: string | null): Check {
  if (mode === "any") return { ok: true, why: null };

  const known = languages.filter((language) => language.trim() !== "");
  const wanted = mode === "ger" ? GERMAN[0] : (original ?? ENGLISH[0]);
  if (!wanted) return { ok: true, why: null };

  const hit = known.some((language) =>
    mode === "ger" ? isGerman(language) : sameLanguage(language, wanted),
  );
  if (hit) return { ok: true, why: null };

  return {
    ok: false,
    why: mode === "ger" ? "keine deutsche Spur im Namen" : "keine Originalspur im Namen",
  };
}

/** Scene name of the board: tags carry resolution, colour and language. */
export function tagFits(
  target: WishTarget,
  tags: string[],
  original: string | null,
  res?: number | null,
): Check {
  const check = resCheck(
    target.minRes,
    res === undefined ? tagRes(tags) : res,
    "kein Auflösungs-Tag im Szenennamen",
  );
  if (!check.ok) return check;

  const hdr = hdrCheck(target.hdr, tagHdr(tags));
  if (!hdr.ok) return hdr;

  const languages = tags
    .filter((tag) => tag === "de" || tag === "en")
    .concat(tags.includes("dual") ? ["de", "en"] : []);

  return audioCheck(target.audio, languages, original);
}

/** File on disk: the probe measured what the file really carries. */
export function probeFits(target: WishTarget, probe: Probe, original: string | null): Check {
  const res = resCheck(target.minRes, probeRes(probe), "keine Auflösung gemessen");
  if (!res.ok) return res;

  const hdr = hdrCheck(target.hdr, probeHdr(probe));
  if (!hdr.ok) return hdr;

  return audioCheck(
    target.audio,
    probe.audio.map((track) => track.language ?? ""),
    original,
  );
}
