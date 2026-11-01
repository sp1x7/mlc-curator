import { statSync } from "node:fs";
import type { AudioTrack, Probe } from "@shared/types/library";
import { PROBE_BINARY_KEY } from "../settings/keys";
import { setting } from "../settings/store";

/** Probe program; empty takes the one from PATH. */
function probeBinary(): string {
  return setting(PROBE_BINARY_KEY) || "ffprobe";
}

type Stream = {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  channels?: number;
  color_transfer?: string;
  color_primaries?: string;
  side_data_list?: Array<{ side_data_type?: string }>;
  tags?: { language?: string; title?: string };
};

type Answer = {
  format?: { duration?: string; format_name?: string };
  streams?: Stream[];
};

// ISO 639-1 and ISO 639-2 codes to display language.
const LANGUAGES: Record<string, string> = {
  de: "Deutsch",
  deu: "Deutsch",
  ger: "Deutsch",
  en: "Englisch",
  eng: "Englisch",
  fr: "Französisch",
  fra: "Französisch",
  fre: "Französisch",
  es: "Spanisch",
  spa: "Spanisch",
  it: "Italienisch",
  ita: "Italienisch",
  pt: "Portugiesisch",
  por: "Portugiesisch",
  nl: "Niederländisch",
  nld: "Niederländisch",
  dut: "Niederländisch",
  pl: "Polnisch",
  pol: "Polnisch",
  ru: "Russisch",
  rus: "Russisch",
  ja: "Japanisch",
  jpn: "Japanisch",
  ko: "Koreanisch",
  kor: "Koreanisch",
  zh: "Chinesisch",
  chi: "Chinesisch",
  zho: "Chinesisch",
  multi: "Mehrere",
  mul: "Mehrere",
  und: "Keine",
};

export function languageOf(code: string | undefined): string | null {
  if (!code) return null;
  return LANGUAGES[code.trim().toLowerCase()] ?? code.trim().toLowerCase();
}

// The container name ffprobe answers with, shortened to the one that matters.
function containerOf(name: string | undefined): string | null {
  if (!name) return null;
  const first = name.split(",")[0]?.trim() ?? "";
  return first || null;
}

/** The hdr label of a video stream: side data first, then the transfer
    function. */
function hdrOf(stream: Stream): string | null {
  for (const entry of stream.side_data_list ?? []) {
    const type = (entry.side_data_type ?? "").toUpperCase();
    if (type.includes("DOVI")) return "Dolby Vision";
    if (type.includes("HDR10PLUS")) return "HDR10+";
    if (type.includes("MASTERING")) continue;
  }

  if (stream.color_transfer === "smpte2084") return "HDR10";
  if (stream.color_transfer === "arib-std-b67") return "HLG";
  return null;
}

/** One entry per audio stream, with language, codec and channel count. */
function audioTracks(streams: Stream[]): AudioTrack[] {
  return streams
    .filter((stream) => stream.codec_type === "audio")
    .map((stream) => ({
      language: languageOf(stream.tags?.language),
      codec: (stream.codec_name ?? "").toUpperCase(),
      channels: stream.channels ?? null,
      title: stream.tags?.title?.trim() || null,
    }));
}

/** One line per subtitle stream, each line held once. */
function subtitleTracks(streams: Stream[]): string[] {
  const found: string[] = [];

  for (const stream of streams) {
    if (stream.codec_type !== "subtitle") continue;
    const language = languageOf(stream.tags?.language);
    const label = stream.tags?.title?.trim();
    const line = [language, label, (stream.codec_name ?? "").toUpperCase().replace("TEXT", "")]
      .filter(Boolean)
      .join(" ");
    if (line && !found.includes(line)) found.push(line);
  }

  return found;
}

/** The biggest video stream of the answer, the one the picture numbers come
    from. */
function videoStream(streams: Stream[]): Stream | null {
  const videos = streams.filter(
    (stream) => stream.codec_type === "video" && (stream.width ?? 0) > 0,
  );
  videos.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  return videos[0] ?? null;
}

/** Runs the probe program once and reshapes its json answer into Probe. */
export async function probeFile(file: string): Promise<Probe> {
  const child = Bun.spawn(
    [probeBinary(), "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file],
    { stdout: "pipe", stderr: "pipe" },
  );

  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  const code = await child.exited;

  if (code !== 0 || !stdout.trim()) {
    throw new Error(stderr.trim() || `${probeBinary()} antwortete mit ${code}`);
  }

  const answer = JSON.parse(stdout) as Answer;
  const streams = answer.streams ?? [];
  const video = videoStream(streams);
  const duration = Number(answer.format?.duration ?? "");

  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    videoCodec: video?.codec_name?.toUpperCase() ?? null,
    container: containerOf(answer.format?.format_name),
    hdr: video ? hdrOf(video) : null,
    runtimeMinutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration / 60) : null,
    audio: audioTracks(streams),
    subtitles: subtitleTracks(streams),
  };
}

// One measurement per file, kept in memory: ffprobe runs again once the file
// changes its size or its time. The plan of a release folder and the detail of
// the same folder share this cache, so one click measures each file once.
type Measured = { bytes: number; mtime: number; probe: Probe | null; note: string | null };

const measured = new Map<string, Measured>();

/**
 * What ffprobe says about one file, or the reason the probe failed. `bytes`
 * reports the size of the file at this moment.
 */
export async function probeMeasured(
  file: string,
): Promise<{ bytes: number; probe: Probe | null; note: string | null }> {
  const known = measured.get(file);
  let stamp = { bytes: 0, mtime: 0 };

  try {
    const found = statSync(file);
    stamp = { bytes: found.size, mtime: found.mtimeMs };
  } catch (cause) {
    return { bytes: 0, probe: null, note: cause instanceof Error ? cause.message : String(cause) };
  }

  // A cache hit needs size and modification time both equal.
  if (known !== undefined && known.bytes === stamp.bytes && known.mtime === stamp.mtime)
    return { bytes: stamp.bytes, probe: known.probe, note: known.note };

  let probe: Probe | null = null;
  let note: string | null = null;

  try {
    probe = await probeFile(file);
  } catch (cause) {
    note = cause instanceof Error ? cause.message : String(cause);
  }

  measured.set(file, { bytes: stamp.bytes, mtime: stamp.mtime, probe, note });

  return { bytes: stamp.bytes, probe, note };
}

// The configured program is looked up again after the setting changed; a program
// off the PATH fails every probe.
let probedWith = "";
let probeUsable: boolean | null = null;

/** True when the configured probe answers `-version` with exit code 0; the answer
    is held per program name. */
export async function ffprobeExists(): Promise<boolean> {
  const binary = probeBinary();

  if (probeUsable !== null && probedWith === binary) return probeUsable;

  probedWith = binary;

  try {
    const child = Bun.spawn([binary, "-version"], { stdout: "ignore", stderr: "ignore" });
    probeUsable = (await child.exited) === 0;
  } catch {
    probeUsable = false;
  }

  return probeUsable;
}
