// Unpacking RAR archives inside a release folder. The tool is taken from PATH
// first and from bin/<platform>/ second.

import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";

type Platform = "linux-x64" | "linux-arm64" | "macos-arm" | "macos-x64" | "windows-x64";

function platform(): Platform | null {
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "linux-arm64" : "linux-x64";
  }
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "macos-arm" : "macos-x64";
  }
  if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
  return null;
}

let resolved: string | null = null;

/** Path of the unpack tool, bundled copy first then PATH; null when both places
    come up empty. */
export function rarTool(): string | null {
  if (resolved !== null) return resolved;

  const name = process.platform === "win32" ? "unrar.exe" : "unrar";
  const bundled = join(process.cwd(), "bin", platform() ?? "", name);

  if (existsSync(bundled)) {
    resolved = bundled;
    return resolved;
  }

  for (const dir of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
    if (dir && existsSync(join(dir, name))) {
      resolved = join(dir, name);
      return resolved;
    }
  }

  return null;
}

const ARCHIVE_RE = /\.(rar|zip|7z)$/i;
// part1 of a split archive; the other parts are named part2, part3 or r00, r01.
const FIRST_PART_RE = /\.part1\.rar$/i;
const TAIL_PART_RE = /\.(part\d+|r\d\d)\.rar$/i;

export function isArchive(name: string): boolean {
  return ARCHIVE_RE.test(name);
}

/** Only the archive that starts a set, so a split set is unpacked once. */
export function isArchiveEntry(name: string): boolean {
  if (!ARCHIVE_RE.test(name)) return false;
  return !TAIL_PART_RE.test(name);
}

/** True when the name is the first part of a split archive. */
export function isSplitArchive(name: string): boolean {
  return FIRST_PART_RE.test(name);
}

/** Escapes the letters that hold special meaning in a regular expression. */
function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The archive name with its part number and extension cut off. */
function stemOf(name: string): string {
  return name.replace(/\.(?:part\d+(?:\.rar)?|r\d\d|(?:rar|zip|7z))$/i, "");
}

/** Every file of one split set: the first part and its r00 or part2 siblings. */
export function partsOf(archive: string): string[] {
  const set = new RegExp(
    String.raw`^${literal(stemOf(basename(archive)))}\.(?:rar|r\d\d|part\d+(?:\.rar)?)$`,
    "i",
  );
  const folder = dirname(archive);

  try {
    return readdirSync(folder)
      .filter((name) => set.test(name))
      .map((name) => join(folder, name));
  } catch {
    return [];
  }
}

/** Removes an unpacked archive and the other parts of its set. */
export function removeArchive(archive: string): void {
  for (const part of [...partsOf(archive), archive]) {
    if (existsSync(part)) unlinkSync(part);
  }
}

export class UnpackError extends Error {}

/** Unpacks one archive into the folder it sits in, keeping stored paths. */
export async function extractArchive(archive: string): Promise<void> {
  const tool = rarTool();
  if (!tool) throw new UnpackError("kein unrar gefunden");

  const child = Bun.spawn(
    [tool, "x", "-y", "-o+", archive, `${archive.replace(/\/[^/]+$/, "")}/`],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stderr = await new Response(child.stderr).text();
  const code = await child.exited;

  if (code !== 0) throw new UnpackError(stderr.trim() || `unrar brach mit ${code}`);
}
