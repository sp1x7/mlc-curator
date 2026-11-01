# Module und ihre Besitzer

Diese Datei ist die Landkarte nach dem Umbau: welche Regel an einer Stelle sitzt,
wie sie heisst und wer sie benutzen darf. `docs/review.md` und
`docs/deep-module-review.md` beschreiben den Zustand vor dem Umbau und bleiben
unverändert; hier steht, was daraus gefolgt ist.

## 1. Besitzer

| Regel | Besitzer | Schnittstelle |
| --- | --- | --- |
| Auflösung und Qualitätsband eines Titels | `shared/types/band.ts` | `bandOf`, `bandLabel`, `bandRank`, `probeRes`, `wantedRes`, `minResOf` |
| Textform eines Titels (Suche und Vergleich) | `shared/types/text.ts` | `fold`, `norm`, `tokensOf` |
| Postergrösse und Poster-Url | `shared/types/tmdb.ts` | `posterUrl`, `PosterSize`, `TmdbSettings` |
| Tabelle `settings` | `server/settings/store.ts` | `setting`, `numberSetting`, `on`, `secretSet`, `writeSetting`, `writeSettings`, `snapshot` |
| Name eines Einstellungsschlüssels | `server/settings/keys.ts` | `LIBRARY_ROOT_KEY`, `TMDB_KEY`, `UPGRADES_ENABLED`, `PASS_KEYS`, … |
| Bibliothekswurzel und was sie erlaubt | `server/library/root.ts` | `libraryRoot`, `storedRoot`, `setLibraryRoot` |
| Wunschliste (Zeilen und Ziele) | `server/wishlist/store.ts` | `wishOf`, `addWish`, `setTarget`, `removeWish` |
| Plan eines Releases und der Move | `server/downloads/organize.ts` | `planFor`, `organize`, `planOf`, `applyEntries`, `mappingOf` |
| Tabelle `downloads` | `server/downloads/store.ts` | `findDownload`, `saveDownload`, `setState`, `setOrganized`, `filesOf`, `interruptedDownloads` |
| Downloadordner auf der Platte | `server/downloads/fsview.ts` | `diskFiles`, `filesUnder`, `downloadRows` |
| ftp-Zugang eines Releases (Info-Datei) | `server/board/info.ts` | `fetchAccess` |
| ftp-Ordner eines Releases | `server/downloads/listing.ts` | `listingOf`, `ftpPaths` |
| Board-Sitzung | `server/board/login.ts` | `sessionState`, `login`, `logout` |
| tmdb-Fehler → Antwort der API | `server/tmdb/client.ts` | `tmdbFailure` |
| Titelzeilen aus der tmdb-Tabelle | `server/tmdb/title.ts` | `storedMovie`, `storedSeries`, `storedMoviesIn`, `storedSeriesIn`, `setImdbId` |
| Leibesvisitationsstand der Bibliothek | `server/library/stand.ts` | `currentStand`, `refreshPlaced`, `resetStand` |
| Query-Keys des Browsers | `web/lib/queries.ts` | `KEYS` |
| Ereigniskanal → Query-Key | `web/data/event-client.ts` | `INVALIDATE` (ein Map-eintrag pro Kanal) |

## 2. Was eine Route noch ist

Eine Route in `server/api/` nimmt Parameter, prüft Form und Status, ruft eine
Domaenfunktion und antwortet. Sie schreibt keine Tabelle, rechnet kein
Qualitätsband und baut keinen Plan aus Pfaden.

Einige Regeln gehören dazu und sitzen deshalb in `server/app/json.ts`
(`jsonBody`: ein Rumpf, der nicht lesbar ist, ist kein Fehler 500) und in
`server/tmdb/client.ts` (`tmdbFailure`: tmdb-Fehler werden zu einer Antwort mit
Grund und Status).

Der Upgrade-Pass (`server/upgrades/run.ts`) ruft Domaenfunktionen, nicht die
eigenen Endpunkte: ein Endpunkt, der seine Form ändert, darf den Pass nicht
still umwerfen.

## 3. Was gleich geblieben ist

Die Endpunkte, die Oberflächen und die Tabellen sind unangetastet: kein Client
musste mitgehen, keine Tabelle bekam eine neue Spalte, keine Scheibe verlor eine
Funktion. Der Umbau ist ausschliesslich der Umzug von Regeln an ihren Besitzer.

Drei Antworten sagen heute exakter, was passiert ist:

- `POST /api/wishlist/add` antwortet `{ ok: true, exists: false }`, wenn ein
  Titel neu auf die Liste kam — das Feld `exists` stand vorher nur für den
  Wiederholungsfall in der Antwort.
- Schreibende Endpunkte, deren Rumpf kein json ist, antworten 400 statt 500
  (`wishlist`, `settings`, `library/root`, `tmdb/settings`, `db`).
- Ein Fehler aus tmdb kommt als dieselbe Antwort an, egal welcher Endpunkt ihn
  auslöst: 400 ohne Schlüssel, 401 bei abgelehntem Schlüssel, 502 mit Grund.

## 4. Prüfen

```
bun install
bun run lint     # biome check web server shared tests
bun run check    # tsc -b
bun test         # bun test --preload ./tests/setup.ts
bun run build    # vite build für die Oberflächen
```
