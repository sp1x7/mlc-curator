// Client of the download area: the rows of the window, the ftp folder of a
// release, its detail, its plan and the move into the library.

import type {
  DownloadPlan,
  DownloadRow,
  FtpListing,
  OrganizeResult,
  ReleaseDetail,
} from "@shared/types/downloads";
import { clientOf } from "@web/lib/api";

// The area prefix of every path.
const downloads = clientOf("downloads");

/** The download endpoints, one function each. */
export const downloadsApi = {
  /** One row per release in the flow, plus the download folder. */
  rows: () => downloads.get<{ rows: DownloadRow[]; root: string }>("/"),

  // The ftp folder of a release, for the file selection.
  listing: (threadId: number) => downloads.get<FtpListing>(`/files/${threadId}`),

  /** Starts the chosen files of one release. */
  start: (threadId: number, files: string[]) =>
    downloads.post<{ ok: boolean }>("/start", { threadId, files }),

  /** Stops a release in flight. */
  stop: (threadId: number) => downloads.post<{ ok: boolean }>(`/stop/${threadId}`),

  /** Picks a stopped release up again. */
  resume: (threadId: number) => downloads.post<{ ok: boolean }>(`/resume/${threadId}`),

  /** The move plan of one release. */
  plan: (threadId: number) => downloads.get<DownloadPlan>(`/plan/${threadId}`),

  /** Title, episodes and measured videos of one release. */
  detail: (threadId: number) => downloads.get<ReleaseDetail>(`/detail/${threadId}`),

  /** Moves the given paths of a release into the library. */
  organize: (threadId: number, paths: string[]) =>
    downloads.post<OrganizeResult>("/organize", { threadId, paths }),

  /** Drops the row of one release. */
  remove: (threadId: number) => downloads.del<{ ok: boolean }>(`/${threadId}`),
};
