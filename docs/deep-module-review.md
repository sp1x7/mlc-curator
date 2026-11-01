# Module-depth review — mlc-curator

Reviewed: `main` @ `19d86cd` (v0.2.5). Method: static read of all 24.3k lines of
`server/`, `web/`, `shared/`, `tests/` (excl. `node_modules`), plus
`tsc -b` (clean) and `bun test` (195 pass / 0 fail, 2.1s).

The lens is the deep-module principle: a module is *deep* when its public
interface is much simpler than its implementation and hides real decisions; it
is *shallow* when the caller has to know roughly as much as the body does.
"Leak" below always means: a decision that belongs inside the module shows up
in caller code.

---

## 1. Overall verdict

Depth is **uneven rather than missing**. The codebase contains several modules
of the shape the principle asks for, and the problems are mostly *placement*
(concept has no owner) and *surface width* (interface exposes more than the
body needs), not a general lack of abstraction.

Genuinely deep modules (interface ≪ implementation):

| module | interface | hides |
|---|---|---|
| `server/tmdb/resolve.ts` | `resolveText(text, kindHint) → Found \| null` (608 lines) | tokenising, nfo merging, kind inference, stored-vs-remote search, gate scoring, duplicate collapse, episode existence |
| `shared/types/settings.ts` | `SETTINGS_AREAS` / `SETTING_FIELDS` (256 lines) | which keys exist, their kind, area/group placement, defaults; server write-filter and the form both derive from it |
| `server/db/raw.ts` | 5 functions (134 lines) | identifier validation, PK discovery, dynamic SQL, binding, change events |
| `web/shell/window-store.ts` | `reduce(Layout, Action)` + `loadLayout`/`saveLayout` (136 lines) | z-order, single-instance rule, minimise/restore, `localStorage` persistence |
| `web/data/event-client.ts` | `useEventBridge()` (75 lines) | refcounted single `EventSource`, StrictMode double-mount, channel→cache invalidation |
| `server/app/events.ts` | `publish(type, data)` + one route (45 lines) | SSE fan-out, heartbeat, abort cleanup |

Shallow or leaky, in order of impact: the `api/` route layer, the `res`/quality-band
concept, background-job lifecycle, the tmdb row type as app currency, the
`db`/`schema` singleton fan-out, five copies of the browser fetch wrapper,
and the persisted-table-layout helper.

Area sizes for reference: `tmdb` 2236, `web/windows` 8276, `board` 1443,
`downloads` 1525, `library` 1043, `wishlist` 735, `api` 909, `upgrades` 678,
`shared/types` 863, `web/mobile` 1217.

---

## 2. Modules that leak complexity outward

### 2.1 The route layer is where the policy lives (highest impact)

`server/api/` is 909 lines, and the largest handlers are workflows, not
adapters:

- `api/catalog.ts:98-167` — `GET /releases` runs four queries (`releases`,
  `mappings`, `tmdbMovies`, `tmdbSeries`), builds three side maps, joins in the
  in-memory library stand, and hand-projects rows to `Release`. The route
  knows the join order of five tables.
- `api/catalog.ts:228-280` — `POST /info/:threadId` is the whole
  thanks → info-block → fetch → decrypt → persist workflow, with a seven-branch
  status ladder (401/404/409/409/409/422/502).
- `api/wishlist.ts:22-32, 81-128` — the route owns the `RES`/`HDR`/`AUDIO`
  whitelists, the defaults, and the `select`/`insert`/`update`/`delete` on
  `wishes`. The `wishlist/` module never sees a write.
- `api/settings.ts` re-implements `stored(key)`/`write(key)`, which
  `downloads/config.ts` already provides as `setting(key)`.

Consequence: the "domain" modules are read-mostly helpers and the routes carry
the decisions, so the decisions are not reusable by the second in-process
caller (`upgrades/run.ts`) and are only testable through HTTP.

### 2.2 "Quality band" has no owner — and the copies disagree

One concept, six partial implementations:

| site | rule |
|---|---|
| `server/wishlist/target.ts` `bandOfRes` | `≥1920 → 2160`, `>720 → 1080`, `≥480 → 720`, else 480 |
| `server/wishlist/target.ts` `resLabel` | same ladder, so a 480-high file labels as **"720p"** |
| `server/upgrades/pick.ts` `bandOf` | re-maps bands to `MinRes`; 1440 collapses to `1080p` |
| `web/windows/downloads/Organize.tsx:73-93` | `≥2160 → 2160p`, `≥1080 → 1080p`, `≥720 → 720p` |
| `web/windows/wishlist/columns.ts:52` | `RES_NUM` with its own numeric scale |
| `web/windows/library/format.ts` `QUALITY_RANK` | ranks `1440p` as its own tier |

A 1440p file is *shown* as `1440p`/own rank and *decided on* as `1080p`
(`tests/upgrades-place.test.ts` asserts the qhd-under-2160-claim stop, so the
behaviour is intentional; the vocabulary drift is not). `MinRes` has no
`1440p` member at all. This is the clearest example of a missing module: the
band is a domain fact, currently computed independently per surface.

### 2.3 Background jobs: four lifecycles, four contracts

`library/stand.ts:31,98` (`startScan(): void`, `scanRunning()`, throttle 400 ms),
`board/sync.ts:202,449` (`startSync(): boolean`, `snapshotOpen`, `reportPage`),
`upgrades/run.ts:250` (`startUpgradeCheck(): boolean`),
`downloads/runner.ts:32-62,156-181` (`running` map, `live` map, job semaphore,
throttle 1000 ms).

`api/settings.ts:112-133` then has to know which idiom each one speaks:
`if (!startSync()) → 409`, `if (scanRunning()) → 409`,
`startUpgradeCheck() ? ok : 409`. The same "already running" answer is spelled
three ways, and the throttle policy is a magic number in each body.

### 2.4 `upgrades/run.ts` talks to the app over its own HTTP surface

`run.ts:31-42` imports `catalogRoute` and `downloadsRoute` and calls
`route.request(path, init)`, decoding `{status, body}`; `run.ts:54-61` then
polls `findDownload()` every 2 s in an unbounded `for(;;)` waiting for the
`planned` state that `downloads/runner.ts` writes to a column.

The internal caller therefore pays for the transport-shaped interface (status
codes, JSON round-trips, DB polling) instead of a function call, and the two
modules are coupled through a shared column with no timeout and no error
channel. This is a deliberate choice — the file comment says the runs reuse
"the same endpoints the browser uses" — and it buys real reuse, but the cost
lands on the caller rather than inside a module.

### 2.5 The DB schema is the interior currency

`db/schema.ts` is imported by 25 files and `db/db.ts` by 22. `tmdb/title.ts`
re-exports drizzle row types (`MovieRow`, `SeriesRow`, `SeasonRow`,
`EpisodeRow` = `$inferSelect`) and they are passed as the working type in 7
modules. Meanwhile `TmdbTitle` — the purpose-built shared type in
`shared/types/library.ts` — is referenced in only 2 files.

Consequences visible in the tree: `api/catalog.ts:53-83` hand-maps
`MovieRow → ReleaseTitle` and `SeriesRow → ReleaseTitle` in two near-identical
blocks; `title.ts` mixes stored reads (`storedMovie`) and remote fetch+save
(`movie`, `series`, `refresh`) in one file while the writers live in a second
(`tmdb/store.ts`) — split by direction, not by responsibility; and a column
rename touches most of the server.

Note `title.ts` also exports both `storedMovie` and `movie` with a `refresh`
boolean — two names for one operation plus a flag, which is an interface
surface that a caller has to reason about.

### 2.6 `resolveText` erases the failure modes its own client defines

`tmdb/client.ts:18-20` declares `TmdbKeyMissing`, `TmdbKeyRejected`,
`TmdbUnreachable`; nothing catches them, and `resolve.ts:585-590` is
`catch { return null }`. So "no API key", "key rejected", "TMDB down", and
"no such title" all arrive as `null`, and `api/catalog.ts:312` reports all of
them as `Kein Titel gefunden`. The interface is *simpler than the
implementation supports* — the other failure direction, and the more expensive
one to fix later because the UI can never distinguish them.

Related: `api/catalog.ts:313` encodes "ambiguous" as HTTP 409 with the
candidates in the body, and `web/windows/catalog/api.ts` needs a second helper
(`send`) whose comment reads "409 carries the candidates and is an answer, not
a failure". A status code doing double duty leaks into the client's structure.

### 2.7 `planOf` is a read that writes, re-probes, and re-walks

`downloads/organize.ts:261-385` (`planOf`) in one pass: walks the release
folder, runs `ffprobe` on every video (`:291`), calls `adoptNfoIds` (`:278`)
which **writes** to `mappings` and `tmdbMovies`, reads the in-memory library
stand, computes target names, compares against the library, and builds the
metadata plan. `api/downloads.ts` calls it on `GET /plan/:id` (`:114`) *and*
again on `POST /organize` (`:129`), so one click probes every video twice and
may write the mapping twice.

`downloads/store.ts` also carries three responsibilities in one file: table
access (`:15-62`), filesystem walking (`bytesUnder`/`diskFiles`/`filesUnder`,
`:69-108`) and view assembly (`downloadRows`, `:140-166`). `downloadRows` does
a synchronous recursive disk walk per row on every `GET /api/downloads`, which
is also the query the SSE bridge invalidates on `downloads.changed` — so the
cost is paid on every progress tick. `bytesUnder` (`:69`) has no callers.

There are three directory walkers: `store.ts filesUnder`, `scan.ts filesUnder`
(async, with hooks and skip set) and `organize.ts releaseFilesOf`.

### 2.8 In-memory stand maintenance sits in a route

`api/downloads.ts:140-148` — after a move, the route calls `placedKey()` per
entry, de-dupes into a map, and loops `await refreshPlaced(key)`. The route
knows that the library pass is an in-memory structure, that it needs
per-title invalidation, and that `Placed` is the unit of refresh.
`library/stand.ts` exports `Placed`, `placedKey`, `refreshPlaced` for exactly
this. `applyEntries` + stand refresh + `writeMetadata` + `setOrganized` +
`pruneRelease` + two `publish` calls is one transaction expressed in a
handler.

### 2.9 Browser-side duplication (three clusters)

- **Fetch wrapper, five copies**: `read`/`call` in `windows/{catalog,db,downloads,settings,wishlist}/api.ts`
  — same 12 lines each, already drifted (`Content-Type` vs `content-type`;
  three different error-message spellings; catalog needs a sixth variant
  because 409 is an answer).
- **Query keys as string literals**: 27 distinct `queryKey: [...]` literals
  across components, and `web/data/event-client.ts:10-23` re-lists them in a
  hand-maintained `INVALIDATE` map. `["plan", id]`, `["detail", id]` and
  `["ftp","listing",id]` are absent from that map and are invalidated by hand
  in `Downloads.tsx:332,339` and `Organize.tsx:204-205`. The contract between
  a component's key and the bridge is implicit — rename a key and
  invalidation fails silently.
- **Table layout, two identical copies**: `loadWidths`/`saveWidths` in
  `windows/catalog/columns.ts` and `windows/wishlist/columns.ts` are byte-identical
  apart from `STORE_KEY`. The `Column` type is declared three times with three
  shapes (library: no `width`; catalog: required `width`; wishlist: adds
  `mono`). `web/lib/search.ts fuzzyMatch` and `web/windows/library/search.ts
  fuzzyHit` are two fuzzy matchers, the library using its own.

### 2.10 One concept, two editors: the download settings menu

`web/windows/downloads/Downloads.tsx:111-241` — `SettingsMenu` hard-codes 11
setting keys with hand-written labels and a `NumberInput`/`Check` pair, while
`SETTINGS_AREAS` + `SETTING_FIELDS` + `settings/labels.ts` already describe the
same `download` area for the Settings window. The registry is bypassed on this
surface, so a new key has to be added in two places to appear in both.

`web/windows/downloads/Downloads.tsx` is 1078 lines with 10 `useState`,
8 `useEffect`, 0 `useMemo` — one exported component holding row rendering,
progress math (`toneOf`, `partOf`), a settings editor, a context menu, an ftp
file picker and the detail pane.

### 2.11 Library read-model lives under `wishlist/`

`server/wishlist/library.ts` (79 lines) is imported by `upgrades/{run,pick,stand}`,
`downloads/organize` and `api/catalog` — 5 non-wishlist modules. Its key
function is typed on `WishKind` (`"movie" | "tv"`), so wishlist vocabulary is
required to ask a library question. The type is well designed (a proper deep
read-model); it is in the wrong house.

### 2.12 Smaller interface defects

- `shared/types/settings.ts:221` — `SETTING_FIELDS: Record<string, SettingField>`
  promises a field for any string, so the fallbacks at
  `Settings.tsx:70,79` (`?? { key, kind: "text" }`) and
  `upgrades/pick.ts:163` (`?.initial ?? 30`) are unreachable under the type.
  The signature is simpler than the truth; `Record<string, SettingField | undefined>`
  would make the fallbacks real.
- `downloads/config.ts:70-75` — `maxJobs()` comment says "a row that is not
  there means three"; the `value > 0` guard returns `1` for a stored `0`.
- `downloads/config.ts:55-57` — the doc comment for `parallel` is nested inside
  the `maxJobs` line's comment, so the type reads with one field undocumented.
- `server/db/schema.ts` `DownloadState`/`CUT_OFF` (`runner.ts:240`) vs
  `interruptedDownloads()` (`store.ts:169-174`) keep two hand-maintained lists
  of the same "mid-flight" states, with different membership (`measuring` is in
  one and not the other).

---

## 3. Suggested responsibility boundaries

The goal is one owner per concept, not more layers.

```
server/
  media/            ← NEW home for the shared vocabulary
    band.ts           resLabel, bandOf, bandOfRes, probeRes, MinRes mapping
    name-info.ts      (from library/) + VIDEO/SUB/SAMPLE/GROUP patterns
  library/
    stand.ts          startScan / running / currentStand  — one job contract
    index.ts          (from wishlist/library.ts) LibraryIndex, libraryKey
    probe.ts          probeFile + a path→Probe memo
  tmdb/
    title.ts          Title read facade: stored + remote + refresh in one
                      entry point; returns TmdbTitle, not $inferSelect rows
    write.ts          (store.ts) persistence only
  downloads/
    store.ts          downloads table only
    fsview.ts         diskFiles / filesUnder / bytesUnder  (one walker)
    plan.ts           pure: (release, link, settings, stand) → Plan
    apply.ts          move + nfo/images + mark organized + stand refresh
                      + prune + publish  ← one transaction
  job.ts (server/app) ← single-flight, throttle, state, progress event
  upgrades/
    flow.ts           takes services, not routes
server/api/         ← parse → one domain call → status mapping. No db.*, no joins.
web/
  lib/http.ts         one fetch wrapper (incl. the "ok-as-answer" case)
  lib/columns.ts      persisted widths + one Column type
  data/keys.ts        queryKey builders; event-client reads them
  windows/settings/   one field-renderer used by the Settings window AND the
                      downloads quick menu
```

Boundary rules worth writing down:

1. **Route = adapter.** No `db.` calls, no multi-table joins, no workflow
   ordering. If a handler needs a join, the owning module exposes the joined
   read (e.g. `catalog.releasesPage(category)`), not the tables.
2. **A "plan"/"get"/"list" call does not write.** `adoptNfoIds` moves to the
   apply step or becomes an explicit `POST /plan/refresh`.
3. **One module owns a state machine.** `DownloadState` transitions and the
   "was cut off" set live in one place; `store.ts`, `runner.ts` and the API
   read them from there.
4. **Shared vocabulary lives with the vocabulary, not with the first feature
   that needed it** (`band`, `name-info`, `library index`).
5. **In-process callers call functions.** Keep the HTTP layer as the browser's
   boundary, not as the internal one.

---

## 4. Refactor plan

Ordered by (leverage ÷ effort). Each step is independently shippable.

**P0 — one hour each, no behaviour change**

1. Extract `web/lib/http.ts`; delete the five wrappers. Keep catalog's
   "409 is an answer" as one option (`{ acceptStatus: [409] }`).
2. Extract `web/lib/columns.ts` (`useColumnWidths(storeKey, columns)`), one
   `Column` type with optional `width`/`mono`.
3. Delete `bytesUnder` (no callers) and `listenerCount` if it stays unused.
4. `SETTING_FIELDS: Record<string, SettingField | undefined>`; then the
   existing fallbacks become real and `pick.ts:163` needs no `?? 30` guess.
5. Fix the `maxJobs` comment/`0` mismatch and the misplaced doc comment in
   `DownloadLimits`.
6. Move `library/name-info.ts`, `SAMPLE_RE`, `VIDEO_EXTENSIONS`, `isVideo` into
   one module and let `downloads/organize.ts` import them instead of keeping a
   second copy.

**P1 — the concept with no owner: `media/band.ts`**

7. Single module exporting `band(probe) → MinRes | "sd" | null`,
   `bandLabel()`, `rank()`. Replace `bandOfRes`/`bandOf`/`resLabel`,
   `Organize.tsx shapeOf`, `columns.ts RES_NUM`, `format.ts QUALITY_RANK` with
   imports. Decide 1440p and SD explicitly, once, with a test.
   *Benefit: the label shown and the band used for the upgrade decision cannot
   drift again.*

**P2 — routes back to adapters**

8. `wishlist`: add `wishlist/repository.ts` (`add`, `setTarget`, `remove`,
   `list`) with the enum whitelist and defaults next to the table; the route
   keeps parsing and status codes. Removes 5 `db` calls from `api/wishlist.ts`.
9. `catalog`: add `catalog/releases.ts` exposing `releasesPage(category):
   Release[]` (the 70-line handler becomes one call) and
   `infoFile.fetch(threadId)` returning a typed result
   (`{ok, ftp, thanks, problems} | {error, status}`), taking the ladder out of
   the handler.
10. Give the ambiguous case its own 200 shape (`{ ambiguous: candidates }`) so
    `web/windows/catalog/api.ts` can drop `send()`.

**P3 — one job contract**

11. `server/app/job.ts`: `singleFlight(name, run)` + `throttled(fn, ms)` +
    `jobState(name)`. Rewrite the four entry points to return the same
    `boolean` ("started / already running") and use named throttle constants.
    `api/settings.ts` collapses to one idiom.
    *Do not* unify the payloads (`ScanState` vs `SyncState` vs `LinkState`) —
    they are different facts and forcing one shape would be an empty
    abstraction.

**P4 — split `planOf`, then cache the probe**

12. `plan.ts` = pure build (no fs writes, no probe subprocess);
    `apply.ts` = the transaction in §3 rule 2. Move the `adoptNfoIds` write to
    `apply`. Add a `path → Probe` memo in `probe.ts` keyed on
    `(path, mtime, size)` so `GET /plan` and `POST /organize` share one probe
    pass. Move the `refreshPlaced` loop from `api/downloads.ts:140-148` into
    `apply`, so `stand.ts` keeps its cache to itself.
13. Split `downloads/store.ts` into `store.ts` (table) and `fsview.ts`
    (single walker); make `downloadRows` reuse the walker it already has
    instead of walking per row.

**P5 — decouple `upgrades/run.ts` from HTTP**

14. Add `downloads/api-service.ts` (or let `run.ts` call `startDownload` +
    await a promise the runner resolves on `planned`). The runner already knows
    when it is done; a promise costs less than a 2 s poll and gives a real
    error channel plus a timeout.
    Keep `route.request` for the tests, where it is genuinely useful.

**P6 — tmdb boundary**

15. `title.ts` returns `TmdbTitle` (already a shared type) and exposes
    `titleFor(kind, tmdbId, { refresh })` instead of `stored*` + `*` +
    `refresh` flag pairs. Keep `$inferSelect` types inside `tmdb/`; the
    row-shaped `titleOf` duplication in `api/catalog.ts:53-83` disappears.
16. Stop erasing errors in `resolveText`: return
    `{ none: true, reason: "no-key" | "key-rejected" | "unreachable" | "not-found" }`.
    The `Tmdb*` classes already exist; they only need to reach the API layer.

**P7 — query keys**

17. `web/data/keys.ts` with builders (`keys.plan(id)`, `keys.detail(id)`);
    components and the `INVALIDATE` map both import from it, so the map becomes
    derived instead of hand-maintained — and `plan`/`detail`/`ftp.listing`
    stop being manual.

**P8 — one settings renderer**

18. Extract the row/field renderer the Settings window already builds from
    `SETTING_FIELDS`, and rebuild `SettingsMenu` as
    `<SettingsFields area="download" compact />`. New download settings then
    appear in both surfaces by adding one registry entry.

**Testing note.** 195 tests pass in 2.1 s and `tests/upgrades-pick.test.ts`
shows the pattern that works here: pure functions extracted from the flow
(`mayPlace`) and asserted directly. 4508 lines currently have no test
reference — `server/tmdb/*` (2236), `server/board/*` (1443), `sfdl/*` (217),
`wishlist/evaluate.ts` (494), `library/name-info.ts` (118). The cheapest
high-value additions are the pure parsers in that set: `tmdb/text.ts`,
`tmdb/name.ts`, `board/tags.ts`, `library/name-info.ts`, `sfdl/parse.ts`, and
`db/raw.ts` (`checked()` is an injection boundary worth locking down).
Every P1–P8 extraction above should arrive with tests at the new interface —
that is also the check that the new interface is the right one.

---

## 5. Where not to abstract

Some duplication is cheap and removing it would cost more than it saves.

- **`web/mobile/` re-implementing desktop views** (1217 lines) is the right
  call: it already reuses the `*/api.ts` clients and `columns.ts` helpers, and
  a shared responsive shell would fight the window-manager model.
- **`server/board/` parsers** (`tags.ts`, `thanks.ts`, `forums.ts`, `html.ts`)
  are shallow-looking but each one is a one-off of a specific HTML shape. A
  common "board scraper" base would be a false abstraction; the current
  `http.ts` (`getPage`/`postPage`) is the right seam and already exists.
- **`db/raw.ts` and the DB editor** intentionally skip domain validation; the
  comment at the top of the file says so, and the schema-name check is the
  correct amount of hiding.
- **Two fuzzy matchers** (`lib/search.ts fuzzyMatch`, `library/search.ts
  fuzzyHit`) — merging them is a P8-level nicety at best; the library variant
  is tuned for short folder names.
- **`shared/types/` as a plain type directory** (863 lines, no runtime code) is
  the correct weight for a two-language-boundary app. Adding validators or a
  schema library here would be premature unless request validation becomes a
  real need.
- **`ScanHooks`** in `library/scan.ts` (5 no-op callbacks in `stand.ts:45-51`)
  looks like ceremony but is what keeps the scanner unaware of progress
  counting and event publishing. Leave it.

---

## 6. Summary

| # | Finding | Where | Cost | Leverage |
|---|---|---|---|---|
| 1 | Route layer holds workflows and joins | `api/catalog.ts`, `api/wishlist.ts` | M | H |
| 2 | Quality band computed 6×, thresholds disagree | `wishlist/target.ts`, `upgrades/pick.ts`, `web/…/Organize.tsx`, 2× `columns/format` | S | H |
| 3 | Five fetch wrappers, already drifted | `web/windows/*/api.ts` | S | M |
| 4 | Query keys implicit between components and SSE bridge | `web/data/event-client.ts` | S | M |
| 5 | Four job lifecycles with four contracts | `library/stand.ts`, `board/sync.ts`, `upgrades/run.ts`, `downloads/runner.ts` | M | M |
| 6 | In-process caller uses the HTTP interface + 2 s poll | `upgrades/run.ts:31-61` | M | M |
| 7 | `planOf` writes, probes and re-walks on a read | `downloads/organize.ts:261-385`, `api/downloads.ts:114,129` | M | M |
| 8 | DB row types as interior currency; `TmdbTitle` unused | `tmdb/title.ts` → 7 modules | M | M |
| 9 | `resolveText` erases `Tmdb*` error classes | `resolve.ts:585-590` | S | M |
| 10 | Stand cache maintained by a route | `api/downloads.ts:140-148` | S | S |
| 11 | Download settings edited in two places | `Downloads.tsx:111-241` | M | S |
| 12 | Library read-model under `wishlist/`, typed on `WishKind` | `wishlist/library.ts` | S | S |
| 13 | 4508 lines of pure parsers with no tests | `tmdb/`, `board/`, `sfdl/`, `name-info` | M | M |
| 14 | Dead/misdocumented interface bits | `bytesUnder`, `SETTING_FIELDS` typing, `maxJobs` | S | S |

The structural direction that would resolve most of these at once: make the
route layer thin, give the two ownerless concepts (`band`, job lifecycle) a
home, and let one module own each state machine. The existing deep modules
(`resolve.ts`, `settings.ts`, `db/raw.ts`, `window-store.ts`, `event-client.ts`)
are the in-repo reference for the target shape.

Zum Umbau selbst: `docs/refactor.md` hält fest, welche Regel heute an welcher Stelle sitzt.
