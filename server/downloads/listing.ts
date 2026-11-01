// The ftp folder of one release: the list the download windows show their boxes
// from, with a mark on every file that already stands on disk.

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FtpEntry, FtpListing } from "@shared/types/downloads";
import { listRelease, releaseFolderOf } from "../ftp/client";
import { releasePathOf } from "./organize";
import { accessOf } from "./runner";
import { releaseOf } from "./store";

export type ListingAnswer =
  | { ok: true; listing: FtpListing }
  | { ok: false; error: string; status: 400 | 404 };

/**
 * The files of a release as the board offers them. A thread off the catalog
 * answers 404, a release whose info file stays unread answers 400; each case
 * carries its own error text in place of an empty list.
 */
export async function listingOf(threadId: number): Promise<ListingAnswer> {
  const release = releaseOf(threadId);
  if (!release) return { ok: false, error: "release not in the database", status: 404 };

  const access = accessOf(threadId);
  if (!access || !release.ftpPath) {
    return { ok: false, error: "no ftp access — fetch the info file first", status: 400 };
  }

  const folder = releaseFolderOf(release.ftpPath, release.title);
  const listed = await listRelease(access, release.ftpPath);

  // Each entry pairs the remote size with the state of the local copy under the
  // release folder.
  const entries: FtpEntry[] = listed.map((item) => {
    const local = join(releasePathOf(folder), item.path);

    return {
      path: item.path,
      size: item.size,
      directory: item.directory,
      onDisk: existsSync(local),
      bytesOnDisk: existsSync(local) ? statSync(local).size : 0,
    };
  });

  return { ok: true, listing: { host: access.host, folder, entries, listed: true } };
}

/** Paths of the plain files of a release; a failing listing answers an empty
    list. */
export async function ftpPaths(threadId: number): Promise<string[]> {
  const answer = await listingOf(threadId);
  if (!answer.ok) return [];

  return answer.listing.entries.filter((entry) => !entry.directory).map((entry) => entry.path);
}
