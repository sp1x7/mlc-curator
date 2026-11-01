// FTP access of one release: read the folder, fetch the chosen files. A file
// whose size matches the one the server names is left alone, a partial one
// continues at its last byte. Speed is held by fetching the file in slices and
// waiting for the byte budget of each slice.

import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { Client } from "basic-ftp";
import { numberSetting } from "../settings/store";

export type FtpAccess = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

export type FtpFile = {
  /** Path below the release folder, `/` as separator. */
  path: string;
  size: number;
  directory: boolean;
};

/** Deepest folder the listing follows. */
const MAX_DEPTH = 6;

/** A file the server lists with size 0 is fetched in passes of this size. */
const ONE_PASS = 2 * 1024 * 1024;

/**
 * Connections of a transfer. `close` is the only break basic-ftp offers: it
 * destroys the sockets, the transfer in flight fails, and the workers turn that
 * into a stop.
 */
const pooled = new Map<string, Set<Client>>();

/** Breaks every connection of a transfer; the workers report it as a stop. */
export function abortTransfer(key: string): void {
  for (const client of pooled.get(key) ?? []) {
    try {
      client.close();
    } catch {
      // A socket that is already dead ends the close on its own.
    }
  }
}

/** Last folder of an ftp path: `.../Dark.S01.Foo/` -> `Dark.S01.Foo`. */
export function releaseFolder(ftpPath: string): string {
  const parts = ftpPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Folder of one release below the download folder: the folder the board names,
 *  the release title when the info path ends empty or names a file.
 */
export function releaseFolderOf(ftpPath: string, title: string): string {
  const folder = releaseFolder(ftpPath);
  if (folder === "" || /\.[a-z0-9]{1,4}$/.test(folder)) return releaseFolder(title);
  return folder;
}

/** Connections one ftp host holds at the same time. */
const hostOpen = new Map<string, number>();
/** Callers waiting for a connection slot of a host. */
const hostWaiting = new Map<string, Array<() => void>>();

/** Connections one ftp host may hold at the same time. */
export function hostSlots(): number {
  const slots = numberSetting("download_max_per_host", 4);

  return slots > 0 ? slots : 4;
}

/** Takes a connection slot of one host; waits while every slot is taken. */
async function takeHost(host: string): Promise<void> {
  for (;;) {
    const open = hostOpen.get(host) ?? 0;

    if (open < hostSlots()) {
      hostOpen.set(host, open + 1);
      return;
    }

    await new Promise<void>((done) => {
      hostWaiting.set(host, [...(hostWaiting.get(host) ?? []), done]);
    });
  }
}

/** Hands a connection slot of one host to the caller waiting for one. */
function freeHost(host: string): void {
  hostOpen.set(host, (hostOpen.get(host) ?? 1) - 1);

  const next = hostWaiting.get(host)?.shift();
  if (next) next();
}

/** One connection, and the call that hands its slot back. */
async function open(access: FtpAccess): Promise<{ client: Client; release: () => void }> {
  await takeHost(access.host);

  const client = new Client(60_000);

  try {
    await client.access({
      host: access.host,
      port: access.port,
      user: access.user,
      password: access.pass,
    });
  } catch (cause) {
    freeHost(access.host);
    throw cause;
  }

  let back = false;

  return {
    client,
    release: () => {
      if (back) return;
      back = true;
      freeHost(access.host);
    },
  };
}

async function walk(
  client: Client,
  folder: string,
  prefix: string,
  depth: number,
  out: FtpFile[],
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  for (const item of await client.list(folder)) {
    if (item.name === "." || item.name === "..") continue;

    const path = prefix ? `${prefix}/${item.name}` : item.name;
    out.push({ path, size: item.isDirectory ? 0 : item.size, directory: item.isDirectory });
    if (item.isDirectory) await walk(client, `${folder}/${item.name}`, path, depth + 1, out);
  }
}

/** Every file the release folder holds, below the release folder. */
export async function listRelease(access: FtpAccess, ftpPath: string): Promise<FtpFile[]> {
  const { client, release } = await open(access);

  try {
    const out: FtpFile[] = [];
    await walk(client, ftpPath.replace(/\/+$/, ""), "", 0, out);
    return out;
  } finally {
    client.close();
    release();
  }
}

/** Size of a file on disk, 0 for a file that is absent. */
function sizeOnDisk(file: string): number {
  return existsSync(file) ? statSync(file).size : 0;
}

export class DownloadStopped extends Error {}

/** Byte budget of a second; the whole download stays under it. */
class Meter {
  private allowed = 0;
  private last = Date.now();

  constructor(private readonly perSecond: number) {}

  /** Sleeps until the running budget covers the requested amount. */
  async reserve(amount: number): Promise<void> {
    if (this.perSecond <= 0) return;

    for (;;) {
      const now = Date.now();
      const gained = ((now - this.last) / 1000) * this.perSecond;
      this.allowed = Math.min(this.perSecond, this.allowed + gained);
      this.last = now;

      if (this.allowed >= amount) {
        this.allowed -= amount;
        return;
      }

      await Bun.sleep(Math.max(20, Math.ceil(((amount - this.allowed) / this.perSecond) * 1000)));
    }
  }
}

export type TransferProgress = {
  /** Bytes of the release that are on the disk. */
  bytes: number;
  /** Bytes per second over all files of this release. */
  speed: number;
};

export type DownloadOptions = {
  /** Names the transfer for `abortTransfer`. */
  key: string;
  access: FtpAccess;
  ftpPath: string;
  /** Target folder on disk; the release folder. */
  into: string;
  /** Paths below the release folder. */
  files: string[];
  sizes: Map<string, number>;
  parallel: number;
  perFileKb: number;
  totalKb: number;
  retries: number;
  retryDelaySeconds: number;
  onProgress?: (progress: TransferProgress) => void;
  /** Checked before every slice; true stops the transfer. */
  stopped?: () => boolean;
};

/** Fetches one file in slices and stops at the size the server named. */
async function fetchOne(
  client: Client,
  remoteFolder: string,
  target: string,
  path: string,
  wanted: number,
  sliceBytes: number,
  meter: Meter,
  stopped?: () => boolean,
): Promise<void> {
  // A local file bigger than the size the server names starts over from byte 0.
  let startAt = sizeOnDisk(target);

  if (wanted > 0 && startAt > wanted) {
    unlinkSync(target);
    startAt = 0;
  }

  for (;;) {
    if (stopped?.()) throw new DownloadStopped("abgebrochen");
    if (wanted > 0 && startAt >= wanted) return;

    const step = wanted > 0 ? Math.min(sliceBytes, wanted - startAt) : sliceBytes;
    await meter.reserve(step);

    try {
      await client.downloadTo(target, `${remoteFolder}/${path}`, startAt);
    } catch (cause) {
      if (stopped?.()) throw new DownloadStopped("abgebrochen");
      throw cause;
    }

    const size = sizeOnDisk(target);
    if (wanted === 0 || size === startAt) return;
    startAt = size;
  }
}

/** One connection, fed file by file by the pool in `downloadFiles`. */
async function worker(
  options: DownloadOptions,
  queue: string[],
  remoteFolder: string,
  shares: number[],
  index: number,
  base: number,
  startedAt: number,
  meter: Meter,
): Promise<void> {
  const { access, into, sizes, perFileKb, retries, retryDelaySeconds, stopped } = options;
  const sliceBytes = perFileKb > 0 ? perFileKb * 1024 : ONE_PASS;
  const clients = pooled.get(options.key) ?? new Set<Client>();
  pooled.set(options.key, clients);

  const { client, release } = await open(access);
  clients.add(client);

  const report = (): void => {
    const moved = shares.reduce((total, value) => total + value, 0);
    const seconds = (Date.now() - startedAt) / 1000;
    options.onProgress?.({
      bytes: base + moved,
      speed: seconds > 0 ? moved / seconds : 0,
    });
  };

  client.trackProgress((info) => {
    shares[index] = info.bytesOverall;
    report();
  });

  try {
    for (;;) {
      const path = queue.shift();
      if (!path) return;
      if (stopped?.()) throw new DownloadStopped("abgebrochen");

      const target = join(into, path);
      mkdirSync(dirname(target), { recursive: true });

      let attempt = 0;
      for (;;) {
        try {
          await fetchOne(
            client,
            remoteFolder,
            target,
            path,
            sizes.get(path) ?? 0,
            sliceBytes,
            meter,
            stopped,
          );
          break;
        } catch (cause) {
          attempt += 1;
          if (stopped?.()) throw new DownloadStopped("abgebrochen");
          if (attempt > retries) throw cause;
          await Bun.sleep(retryDelaySeconds * 1000);
        }
      }

      const wanted = sizes.get(path) ?? 0;
      if (wanted > 0 && sizeOnDisk(target) !== wanted) {
        throw new Error(`${path}: ${sizeOnDisk(target)} von ${wanted} Byte`);
      }
    }
  } finally {
    clients.delete(client);
    if (clients.size === 0) pooled.delete(options.key);
    client.close();
    release();
  }
}

/** Fetches `files` into `into`. Files already complete are skipped. */
export async function downloadFiles(options: DownloadOptions): Promise<void> {
  const { into, files, sizes, parallel, totalKb, ftpPath } = options;
  const remoteFolder = ftpPath.replace(/\/+$/, "");

  mkdirSync(into, { recursive: true });

  // Files that already carry the remote size drop out of the queue here.
  const queue = files.filter((path) => {
    const wanted = sizes.get(path) ?? 0;
    return wanted === 0 || sizeOnDisk(join(into, path)) !== wanted;
  });

  // Bytes already on disk count into base, so the progress line starts at the
  // state of the folder.
  const base = files.reduce((total, path) => total + sizeOnDisk(join(into, path)), 0);
  const meter = new Meter(totalKb > 0 ? totalKb * 1024 : 0);
  const shares: number[] = [];
  const startedAt = Date.now();

  const workers = Array.from({ length: Math.max(1, parallel) }, (_, index) => {
    shares.push(0);
    return worker(options, queue, remoteFolder, shares, index, base, startedAt, meter);
  });

  const failures = await Promise.allSettled(workers);
  const failed = failures.find((entry) => entry.status === "rejected");

  if (failed && failed.status === "rejected") throw failed.reason;
}
