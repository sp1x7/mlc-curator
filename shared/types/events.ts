/**
 * One push over `/api/events`.
 *
 * `type` names the area and what changed there (`downloads.changed`), `data` carries
 * the details for a window that needs them. The browser maps `type` onto the
 * query keys it invalidates, so a push travels board → server → queries.
 */
export type ServerEvent = {
  type: EventChannel;
  data: unknown;
  /** Server clock as ISO 8601, for logs and for ordering in the job list. */
  ts: string;
};

/** Every channel the server pushes; a window subscribes to the whole stream and
 *  filters by type. */
export const EVENT_CHANNELS = [
  "settings.changed",
  "catalog.changed",
  "catalog.sync",
  "library.changed",
  "library.scan",
  "wishlist.changed",
  "downloads.changed",
  "db.changed",
] as const;

export type EventChannel = (typeof EVENT_CHANNELS)[number];
