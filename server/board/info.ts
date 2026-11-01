// The ftp access of one release: one thanks unlocks the info block of the
// creator post, the sfdl file behind its link carries host, user, path and the
// file key. The parsed values land in the ftp columns of the release row, the
// row the download routes read.

import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { releases } from "../db/schema";
import { SFDL_PASSWORD_KEY } from "../settings/keys";
import { setting } from "../settings/store";
import { fetchBytes } from "../sfdl/fetch";
import { resolve as readInfoFile } from "../sfdl/parse";
import { cookieSet } from "./cookies";
import { readInfoBlock } from "./thanks";

export type ReleaseRow = typeof releases.$inferSelect;

/** What can go wrong on the way to the access, and what the window answers. */
export type InfoStatus = 400 | 401 | 404 | 409 | 422 | 502;

export type AccessAnswer =
  | { ok: true; thanks: boolean; row: ReleaseRow; problems: string[] }
  | { ok: false; error: string; status: InfoStatus; thanks?: boolean };

/**
 * Reads the info block of a thread and writes the ftp access it holds into the
 * ftp columns of the release. The settings row supplies the file key, the block
 * supplies link and access; every stopped step answers its own status code with
 * the text of that step.
 */
export async function fetchAccess(threadId: number): Promise<AccessAnswer> {
  const row = db.select().from(releases).where(eq(releases.threadId, threadId)).get();

  // Each guard stops at the step it reached: catalog row, board cookies, info
  // block, visibility, link, file key.
  if (!row) return { ok: false, error: "Thread nicht im Katalog", status: 404 };
  if (!cookieSet()) return { ok: false, error: "Kein Board-Zugang", status: 401 };

  try {
    const { block, thanksGiven } = await readInfoBlock(threadId);

    if (!block) return { ok: false, error: "Kein Info-Block im Thread", status: 404 };
    if (!block.visible) return { ok: false, error: "Info-Block bleibt versteckt", status: 409 };
    if (!block.link) return { ok: false, error: "Info-Block ohne Download-Link", status: 409 };

    const password = setting(SFDL_PASSWORD_KEY);
    if (!password) return { ok: false, error: "Kein Passwort in den Einstellungen", status: 409 };

    const bytes = await fetchBytes(block.link);
    const { sfdl, problems, invalid } = readInfoFile(bytes, password);

    if (invalid.length > 0)
      return { ok: false, error: invalid.join(", "), status: 422, thanks: thanksGiven };

    // Empty fields stay null, so a later read tells the columns apart.
    const values = {
      ftpHost: sfdl.host,
      ftpPort: sfdl.port > 0 ? sfdl.port : null,
      ftpUser: sfdl.username.length > 0 ? sfdl.username : null,
      ftpPass: sfdl.password.length > 0 ? sfdl.password : null,
      ftpPath: sfdl.bulkPath.length > 0 ? sfdl.bulkPath : null,
      ftpRaw: new TextDecoder().decode(bytes),
      ftpFetchedAt: Math.floor(Date.now() / 1000),
    };

    db.update(releases).set(values).where(eq(releases.threadId, threadId)).run();

    // The row is read back, so the answer carries the stored values.
    const fresh = db.select().from(releases).where(eq(releases.threadId, threadId)).get();

    return {
      ok: true,
      thanks: thanksGiven,
      row: fresh ?? { ...row, ...values },
      problems: Object.values(problems),
    };
    // A throw on the way, board or sfdl, ends as 502 with its message.
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { ok: false, error: message, status: 502 };
  }
}
