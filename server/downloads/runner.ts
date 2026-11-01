// The flow of one release: read the ftp folder, fetch the chosen files, unpack,
// measure, and leave the release ready for the plan. The state of a release
// stands in the downloads table; the byte counts of a transfer live in memory
// for the length of its run.

import { basename } from "node:path";
import type { DownloadState } from "@shared/types/downloads";
import { publish } from "../app/events";
import {
  abortTransfer,
  DownloadStopped,
  downloadFiles,
  type FtpAccess,
  listRelease,
  releaseFolderOf,
} from "../ftp/client";
import { probeFile } from "../library/probe";
import { on } from "../settings/store";
import { extractArchive, isArchiveEntry, removeArchive, UnpackError } from "../unpack/rar";
import { downloadLimits, resumeAtBoot } from "./config";
import { downloadRows, filesUnder, type LiveProgress } from "./fsview";
import { isVideo, releasePathOf } from "./organize";
import {
  filesOf,
  findDownload,
  interruptedDownloads,
  releaseOf,
  saveDownload,
  setState,
} from "./store";

// In-memory bookkeeping of a run: progress counters, stop flags, the promise of
// each live job.
const live = new Map<number, LiveProgress>();
const stops = new Set<number>();
const running = new Map<number, Promise<void>>();

/** True while a job of this release is in flight. */
export function isRunning(threadId: number): boolean {
  return running.has(threadId);
}

/** Releases that hold a job slot. */
let jobs = 0;
/** Releases waiting for a job slot; the one that ends hands its slot to the first.
 */
const waiting: Array<() => void> = [];

/** Takes a job slot; waits while every slot is taken. */
async function takeJob(): Promise<void> {
  for (;;) {
    if (jobs < downloadLimits().maxJobs) {
      jobs += 1;
      return;
    }

    await new Promise<void>((done) => waiting.push(done));
  }
}

/** Gives up a job slot and wakes the release waiting for one. */
function freeJob(): void {
  jobs -= 1;
  waiting.shift()?.();
}

/** Writes the state to the table and publishes the change in one step. */
function mark(threadId: number, state: DownloadState, note: string | null = null): void {
  setState(threadId, state, note);
  publish("downloads.changed", { threadId, state });
}

/** Ftp access of a release; null while the info file has yet to be read. */
export function accessOf(threadId: number): FtpAccess | null {
  const release = releaseOf(threadId);
  if (!release?.ftpHost || !release.ftpUser || !release.ftpPass || !release.ftpPath) return null;

  return {
    host: release.ftpHost,
    port: release.ftpPort ?? 21,
    user: release.ftpUser,
    pass: release.ftpPass,
  };
}

/** Unpacks every archive of the release folder and measures the videos. */
async function unpackAndMeasure(threadId: number, folder: string): Promise<void> {
  if (on("rar_auto_extract")) {
    mark(threadId, "extracting");

    for (const file of filesUnder(releasePathOf(folder))) {
      if (!isArchiveEntry(basename(file))) continue;

      try {
        await extractArchive(file);
        if (on("rar_delete_extracted")) removeArchive(file);
      } catch (cause) {
        if (cause instanceof UnpackError) {
          mark(threadId, "error", `${basename(file)}: ${cause.message}`);
          return;
        }
        throw cause;
      }
    }
  }

  mark(threadId, "measuring");

  for (const file of filesUnder(releasePathOf(folder))) {
    if (!isVideo(basename(file))) continue;
    try {
      await probeFile(file);
    } catch {
      // A file whose probe fails shows in the plan with empty numbers.
    }
  }
}

/** One release from the ftp folder to a plan waiting for the click. */
async function run(threadId: number, files: string[]): Promise<void> {
  const access = accessOf(threadId);
  const release = releaseOf(threadId);

  if (!access || !release?.ftpPath) {
    mark(threadId, "error", "Zugangsdaten fehlen — zuerst die Info-Datei holen");
    return;
  }

  const folder = releaseFolderOf(release.ftpPath, release.title);
  const limits = downloadLimits();

  // `stopDownload` puts the id in `stops`; only a `run()` in flight removes it.
  stops.delete(threadId);

  saveDownload(threadId, folder, files);
  mark(threadId, "queued");

  await takeJob();

  // A stop that arrived while the release waited for a slot ends the run at this
  // point.
  if (stops.has(threadId)) {
    freeJob();
    mark(threadId, "stopped", "abgebrochen");
    return;
  }

  mark(threadId, "listing");

  try {
    const listed = await listRelease(access, release.ftpPath);
    const sizes = new Map(listed.map((entry) => [entry.path, entry.size]));
    const wanted = listed
      .filter((entry) => files.includes(entry.path))
      .reduce((total, entry) => total + entry.size, 0);

    live.set(threadId, { bytes: 0, speed: 0, wanted });
    setState(threadId, "downloading", null, { startedAt: Date.now() / 1000 });
    publish("downloads.changed", { threadId, state: "downloading" });

    let lastPublish = Date.now();

    // `download_retries_total` counts passes over the whole release; a pass that
    // broke continues at the files already on disk.
    for (let round = 0; ; round += 1) {
      try {
        await downloadFiles({
          key: String(threadId),
          access,
          ftpPath: release.ftpPath,
          into: releasePathOf(folder),
          files,
          sizes,
          parallel: limits.parallel,
          perFileKb: limits.perFileKb,
          totalKb: limits.totalKb,
          retries: limits.retriesFile,
          retryDelaySeconds: limits.delayFileSeconds,
          stopped: () => stops.has(threadId),
          onProgress: (progress) => {
            live.set(threadId, { bytes: progress.bytes, speed: progress.speed, wanted });

            if (Date.now() - lastPublish > 1000) {
              lastPublish = Date.now();
              publish("downloads.changed", { threadId, state: "downloading" });
            }
          },
        });

        break;
      } catch (cause) {
        if (cause instanceof DownloadStopped || round >= limits.retriesTotal) throw cause;
        await Bun.sleep(limits.delayTotalSeconds * 1000);
      }
    }

    if (stops.has(threadId)) {
      mark(threadId, "stopped", "abgebrochen");
      return;
    }

    await unpackAndMeasure(threadId, folder);
    setState(threadId, "planned", null, { finishedAt: Date.now() / 1000 });
    publish("downloads.changed", { threadId, state: "planned" });
  } catch (cause) {
    if (cause instanceof DownloadStopped) mark(threadId, "stopped", "abgebrochen");
    else mark(threadId, "error", cause instanceof Error ? cause.message : String(cause));
  } finally {
    live.delete(threadId);
    stops.delete(threadId);
    running.delete(threadId);
    freeJob();
  }
}

/** Starts a release; `files` are the paths chosen below the release folder. */
export function startDownload(threadId: number, files: string[]): boolean {
  if (running.has(threadId)) return false;

  running.set(
    threadId,
    run(threadId, files).catch((cause: unknown) => {
      console.error("download", threadId, cause instanceof Error ? cause.message : cause);
    }),
  );

  return true;
}

export function stopDownload(threadId: number): void {
  stops.add(threadId);
  abortTransfer(String(threadId));
  mark(threadId, "stopped", "abgebrochen");
}

/** Continues a release: files that are complete on disk are skipped. */
export function resumeDownload(threadId: number): boolean {
  const record = findDownload(threadId);
  if (!record) return false;

  return startDownload(threadId, filesOf(record));
}

/** A state that means work was cut off before the plan was built. */
const CUT_OFF: DownloadState[] = ["queued", "listing", "downloading", "extracting", "measuring"];

/** Rows as the table and the disk show them, running transfers included. */
export function rows() {
  return downloadRows(live).map((row) =>
    CUT_OFF.includes(row.state) && !running.has(row.threadId)
      ? { ...row, state: "stopped" as const }
      : row,
  );
}

/** `download_resume`: releases that were cut off start again by themselves. */
export function resumeAtStartup(): void {
  if (!resumeAtBoot()) return;

  for (const record of interruptedDownloads()) {
    if (CUT_OFF.includes(record.state)) resumeDownload(record.threadId);
  }
}
