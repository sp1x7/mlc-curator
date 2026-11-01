// The query keys of every area: reads, invalidations and the event bridge all
// address the same tuples, so a push reaches the cache slot that shows it.

/**
 * The areas are the prefixes the event bridge invalidates wholesale; a call
 * inside an area names one answer. A key that ends in a function takes what the
 * answer is about, so two releases keep two cache slots.
 */
export const KEYS = {
  settings: {
    /** Prefix of every settings answer. */
    all: ["settings"] as const,
    /** The stored value of every settings key. */
    values: ["settings"] as const,
    /** Board user, cookie flag and password flag. */
    session: ["settings", "session"] as const,
    /** Progress of the board snapshot run. */
    sync: ["settings", "sync"] as const,
    /** Progress of the library pass. */
    scan: ["settings", "scan"] as const,
    /** One folder level of the path picker. */
    fs: (path: string) => ["settings", "fs", path] as const,
  },
  library: {
    /** Prefix of every library answer. */
    all: ["library"] as const,
    /** The stand of the last pass. */
    stand: ["library", "stand"] as const,
  },
  wishlist: {
    /** The computed list and everything derived from it. */
    all: ["wishlist"] as const,
    /** The measured wish rows. */
    list: ["wishlist", "list"] as const,
  },
  catalog: {
    /** The snapshot list and its run. */
    all: ["catalog"] as const,
    /** Categories with their forums and counts. */
    categories: ["catalog", "categories"] as const,
    /** One category page of releases. */
    releases: (category: string) => ["catalog", "releases", category] as const,
    /** Progress of the running snapshot. */
    sync: ["catalog", "sync"] as const,
    /** Board session of the snapshot. */
    session: ["catalog", "session"] as const,
  },
  downloads: {
    /** Rows, plan and detail of the releases that were taken. */
    all: ["downloads"] as const,
    /** One row per release in the flow. */
    rows: ["downloads", "rows"] as const,
    /** The move plan of one release. */
    plan: (threadId: number) => ["downloads", "plan", threadId] as const,
    /** Title, episodes and measured videos of one release. */
    detail: (threadId: number) => ["downloads", "detail", threadId] as const,
    /** The ftp listing of one release. */
    listing: (threadId: number) => ["downloads", "listing", threadId] as const,
  },
  db: {
    /** Prefix of every db answer. */
    all: ["db"] as const,
    /** Table names with their column lists and row counts. */
    tables: ["db", "tables"] as const,
    /** One page of rows of one table, narrowed by one search word. */
    rows: (table: string | null, search: string | null) => ["db", "rows", table, search] as const,
  },
};
