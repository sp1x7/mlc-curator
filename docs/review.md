Modultiefe-Review: mlc-curator
Perspektive: deep modules — Schnittstelle kleiner als Implementation, Komplexität hinter der Grenze, der Aufrufer muss interne Regeln nicht kennen.

Zum Inhalt: Dieses Dokument beschreibt den Ist-Zustand und seine Wirkung. Es enthält keine Umsetzungsvorschläge.

1. Methode und Umfang
Gelesen: server/** vollständig, shared/types/** vollständig, tests/**, package.json; web/** stichproben mit Vollständigkeit der Infrastrukturschicht (data/query-client.ts, data/event-client.ts, shell/window-store.ts, shell/window-registry.tsx) und aller windows/*/api.ts; Fensterkomponenten nach Größe und Importen, vertieft windows/downloads/Downloads.tsx, windows/library/node.ts.

Bewertet wurde je Modul:

Interface-Fläche — Zahl der Namen, die ein Aufrufer kennen muss: exportierte Funktionen, Endpunkte, Pflicht-Callbacks, mitgelieferte Zustandstypen.
Implementationsgröße — Zeilen im File, exakt gemessen.
Tiefe — Verhältnis beides, bewertet an der Frage: muss der Aufrufer interne Regeln kennen, um die Schnittstelle korrekt zu benutzen?
Bedingung der Sitzung: Die Shell war gesperrt (read-only). Die Analyse ist statisch; bun test, tsc -b und biome check wurden nicht ausgeführt, Laufzeitverhalten ist aus dem Code abgeleitet.

2. Modulbestand
Bereich	Dateien	LOC	Endpunkte
server/app	3	149	2 (/health, /events)
server/api	7	916	46
server/board	8	≈1450	–
server/tmdb	9	2242	–
server/library	4	1040	–
server/downloads	6	1531	–
server/ftp	1	364	–
server/unpack	1	118	–
server/sfdl	4	205	–
server/wishlist	3	743	–
server/upgrades	3	681	–
server/db	3	354	–
shared/types	7	868	–
web/data	2	94	Client-Transport
web/windows/*	33	≈3600	8 Clients in api.ts
HTTP-Oberfläche gesamt: 48 Endpunkte in 8 Routen-Dateien. server/db/schema.ts (196 LOC) wird von rund 20 Modulen direkt importiert.

3. Tiefenmessung
LOC/Element = Filelänge geteilt durch die Zahl der Namen, die ein Aufrufer kennen muss. Der Wert ist ein Indikator, kein Urteil; das Urteil kommt aus der letzten Spalte.

3.1 Tiefe Module (Interface deutlich kleiner als Implementation)
Modul	LOC	Interface	LOC/El.	verborgene Komplexität
tmdb/resolve.ts	609	2	305	Nummern-Order, Stored-Suche, TMDB-Suche, T/Y/E-Gates, Duplikatgruppen, Tiebreak, Saison- und Episode-Anhängen
wishlist/evaluate.ts	495	5	99	Soll-Ermittlung, Nachladen, Ist-Zählung, Match-Text, Fortschritt
board/sync.ts	568	6	95	Seitengang, Dedupe, Diff gegen Tabellenbestand, Löschregel, Transaktion, Link-Queue
downloads/metadata.ts	384	3	128	NFO-Aufbau je Ebene, Bildpfade, Nachladen fehlender Felder, Schreiben
upgrades/run.ts	266	3	89	Info-Datei, Listing, Start, Warten, Plan-Vergleich, Move
board/tags.ts	189	3	63	Szenenname → Name und normalisierte Tags, Sonderfälle (WEB-DL, S04 E11, Gruppen-Suffix)
ftp/client.ts	364	8	46	Host-Slots, Slice-Meter, Resume über Restgröße, Retry, Abbruch über close()
library/probe.ts	169	3	56	ffprobe-Aufruf, Stream-Auswahl, HDR-Ableitung, Sprachtabellen, Binary-Suche
board/http.ts	177	4	44	JS-Challenge, serielle Queue, Delay, cp1252-Fallback, POST-Helfer
db/raw.ts	134	5	27	Namensprüfung gegen Live-Schema, Primärschlüssel-Ermittlung, Suche, Zellenfilter
sfdl/parse.ts + aes.ts + xml.ts	168	4	42	Format, Feldverschlüsselung, Tag-Leser ohne DOM
unpack/rar.ts	118	6	20	Plattform-Suche, Split-Archiv-Erkennung, Satz-Bereinigung
Wirkung: Diese Module haben konsistente Fehlermodelle (SfdlError, UnpackError, DownloadStopped, TmdbKeyRejected) und werden von mehreren Aufrufern mit identischem Ergebnis benutzt. resolveText hat fünf Aufrufer (api/catalog.ts, api/wishlist.ts, api/tmdb.ts, library/scan.ts, board/sync.ts) und wird von keinem mit eigener Nacharbeit benutzt.

3.2 Mittlere Module (die Interface trägt einen Teil der Regeln)
Modul	LOC	Interface	LOC/El.	was nach aussen tritt
library/scan.ts	588	3 Einstiege + ScanHooks (5 Pflicht-Callbacks) + 4 Regex/Mengen-Exporte	74	Zähl- und Fortschrittsmodell ist Teil der Schnittstelle; Erkennungsregeln (VIDEO_EXTENSIONS, SEASON_FOLDER_RE, SAMPLE_RE, TRICKPLAY_RE) sind exportiert und werden von aussen mitbenutzt
downloads/organize.ts	422	11	38	Aufrufer kennt die Reihenfolge planOf → filtern → applyEntries → placedKey/refreshPlaced → writeMetadata → setOrganized → pruneRelease
tmdb/gates.ts	269	9	30	Answer ist die TMDB-Rohform und Teil der Schnittstelle; details/imdbOf stehen neben der Gate-Kombination
downloads/runner.ts	259	7	37	Zustandsautomat sichtbar (8 Zustände); CUT_OFF steht doppelt in runner.ts und store.interruptedDownloads
board/sync.ts (Status)	–	SyncState 13 Felder, LinkState 6 Felder	–	Fortschrittsmodell vollständig im Typ; Katalog- und Settings-Fenster bilden daraus Zeilen
tmdb/title.ts	169	16	11	Cache-Politik ist in der Schnittstelle getrennt: storedMovie gegen movie(id, refresh) gegen certificationOf; jeder Aufrufer entscheidet selbst über Nachladen
library/stand.ts	171	6	29	Placed und placedKey() setzen Pfad-Kenntnis im Aufrufer voraus (Eintrag, Root-String, 0-basierter Schnitt)
api/catalog.ts	325	10 Endpunkte	33	Route hält die Info-Datei-Kette (Thanks → Fetch → Entschlüsselung → Speichern → Antwort) und vier Formatierungs-Helfer
api/downloads.ts	172	9 Endpunkte	19	Route hält die Einsortier-Kette (7 Aufrufe, 4 Bedingungen)
upgrades/pick.ts	315	3	105	pick.ts exportiert tagsOf, Picked, UpgradeTab und nutzt buildWishes als Datenquelle statt einer Wunsch-Abfrage
3.3 Flache Module (Interface ≈ Implementation)
Modul	LOC	Interface	LOC/El.	Befund
wishlist/target.ts	163	12	14	Einzelprüfungen (resCheck, hdrCheck, audioCheck, probeRes, bandOfRes, tagRes, tagHdr, resLabel) werden von vier Aufrufern selbst zusammengesetzt
downloads/config.ts	98	11	9	Key→Wert-Zugriff; die Prädikate (on, numberSetting) sind Teil der Fläche
upgrades/stand.ts	100	2	50	titleStand + releaseRes; tagsOf ist kopiert
api/settings.ts	151	11 Endpunkte	14	hält Board-Session, Board-Sync, Bibliothekslauf und Ordner-Browser neben der Einstellungsfunktion
api/tmdb.ts	36	3	12	schreibt settings-Zeilen mit eigener write-Hilfsfunktion, unabhängig von api/settings.ts
api/library.ts	39	3	13	liest und schreibt library_root direkt, parallel zu downloads/config.libraryRoot()
api/db.ts	58	5	12	bewusste Weiterleitung mit Fehlerumsetzung auf 400
web/data/query-client.ts	18	1	18	Konfigurationsobjekt
3.4 Zwei Stellen ohne Modulträger
Einstellungen. Es gibt kein server/settings-Modul. Der Zugriff liegt als vier separate Implementationen von Key→Typ vor: downloads/config.ts (setting, numberSetting, on), board/http.ts (numberSetting), server/app/index.ts (setting), tmdb/client.ts (setting, readSettings). Die Fallback-Regeln weichen voneinander ab: numberSetting in config.ts liefert den fallback bei Werten < 0, die in board/http.ts liefert 0 bei <= 0; maxJobs() ergibt bei Unsinn 1, downloadLimits() sonst 3.

Besitz der Bibliothek. Kein Modul beantwortet „was ist in der Bibliothek". wishlist/library.ts (80 LOC) liefert indexLibrary(roots) als reine Funktion über den gescannten Baum; die Regeln darüber bauen fünf Verbraucher selbst: api/catalog.ts (/releases), downloads/organize.ts (planOf), wishlist/evaluate.ts (seasonsOf, folderQuality), upgrades/pick.ts (heldEpisodes), upgrades/run.ts (heldRes). Jeder mit eigenem Filter für sample, episodeLabel, probe und Saison-Zuordnung.

4. Wo Komplexität nach aussen tritt
L1 — Pfadmodell ohne Eigentümer
Vier Konventionen nebeneinander, jede mit eigenem Umrechner an jeder Verbrauchsstelle.

Konvention	Vorkommen	Umrechner
absolut, Bibliothekswurzel	PlanEntry.from, PlanEntry.to, MetadataTarget.path	–
relativ zur Release-Mappe	DownloadRow.disk[].path, FtpEntry.path, ReleaseDetail.videos[].path	detail.ts: tail(), Downloads.tsx: tailOf()
relativ zur Bibliothekswurzel	LibraryFile.path, Placed.path	scan.ts: relativeOf(), organize.ts: video.slice(root.length + 1), stand.ts: placedKey()
Key-String kind:tmdbId	libraryKey()	pick.ts: /^tv:(\d+)$/
Downloads.tsx führt row.disk und listed.entries über tailOf-Vergleich zusammen und entscheidet Größen-Präzedenz und Restpfad-Anzeige selbst. organize.ts vergleicht video.slice(root.length + 1) gegen LibraryFile.path, um ein Ziel als vorhanden zu erkennen.

L2 — Auflösungsleiter an vier Orten, Rückkanal über Fließtext
wishlist/target.ts enthält die Leiter dreifach (RES_OF, resLabel, bandOfRes), upgrades/pick.ts vierfach (bandOf). Für Werte unter 480 geben resLabel ("sd") und bandOf ("720p") unterschiedliche Ergebnisse.

Zusätzlich schreibt upgrades/run.ts: noteOf() einen Lesetext in downloads.note ("measured 1080p, thread claims 2160p"), und upgrades/pick.ts liest die Zahl mit DISPROVEN = /measured \d+p, thread claims (\d+)p/ zurück. Eine Messung ohne Höhe ("nothing measured") oder im Band sd erzeugt einen Text, den die Regex nicht erkennt; diese Bänder stehen dann nicht als widerlegt im Bestand. upgrades/run.ts definiert außerdem ein drittes MinRes-Vokabular (720/1080/2160 als Zahl) neben MinRes ("720p" | "1080p" | "2160p") in den geteilten Typen.

L3 — Lesende Endpunkte mit Schreib- und Netzwerkeffekt
Endpunkt	Effekt
GET /downloads/plan/:id	adoptNfoIds() schreibt mappings und tmdbMovies; probeFile() läuft pro Video ohne Cache
GET /downloads/detail/:id	fetchSeason() je genannte Saison: Netzwerk und Saison-Schreibvorgang
GET /wishlist/wishes	pullSeasons() je Wunsch-Saison, pulled-Set pro Prozess
GET /library/stand	vollständiger Baum (LibraryStand.roots) als Antwort
Wirkung im Browser: web/data/event-client.ts mapped catalog.changed auf ["catalog"] und ["wishlist"]. Jeder abgeschlossene Snapshot-Lauf löst damit buildWishes() aus, und das lädt TMDB-Saisons nach. Downloads.tsx invalidiert bei jedem Zustandswechsel zusätzlich manuell ["detail"], was ffprobe und die Saisonabrufe erneut auslöst. ["ftp","listing",…] und ["detail",…] stehen in keiner Invalidations-Tabelle; sie leben allein von diesem Effekt und von run() nach jeder Mutation.

L4 — Prozesszustand ist in der Schnittstelle nicht sichtbar
Zustand	Ort	Lebensdauer
Bibliotheksstand	library/stand.ts	Prozess, nach Neustart leer
Live-Bytes und Tempo	downloads/runner.ts (live)	nur während der Übertragung
Snapshot- und Link-Fortschritt	board/sync.ts	Prozess
TMDB-Antworten	tmdb/client.ts (answers)	Prozess
Messwerte je Datei	downloads/detail.ts (measured, gültig über bytes + mtime)	Prozess
gezogene Saisons	wishlist/evaluate.ts (pulled)	Prozess
unrar-Pfad	unpack/rar.ts (resolved)	Prozess
Keine Schnittstelle trägt ein Frische-Merkmal. storedMovie(), season() und probeCached() liefern Wert oder null, ohne zwischen „nicht vorhanden" und „nicht nachgesehen" zu unterscheiden. planOf misst deshalb ohne Cache, releaseDetailOf misst dieselbe Datei über probeCached — zwei Mess-Caches, einer mit Gültigkeitsprüfung.

L5 — Zweifach exponierte Vorgänge mit unterschiedlichem Vertrag
Vorgang	Stelle A	Stelle B	Unterschied
Bibliothekslauf starten	POST /library/scan	POST /settings/library/scan	A antwortet stets 200 mit running; B antwortet 409, wenn einer läuft
Snapshot starten	POST /catalog/sync	POST /settings/board/sync	Fehlertext A Deutsch („Es läuft bereits ein Sync"), B Englisch
Board-Sitzung lesen	GET /catalog/session	GET /settings/session	gleicher Inhalt, zwei Wege, zwei Clients
TMDB-Einstellung	PUT /tmdb/settings	PUT /settings	A schreibt apiKey/language ungeprüft, B filtert über SETTING_FIELDS
Dazu die Sprache der Antworten: api/library.ts und api/catalog.ts und api/wishlist.ts geben deutsche Meldungen zurück ("root muss ein absoluter Pfad sein", "Titel fehlt"), api/downloads.ts und api/settings.ts englische ("release not in the database"), api/db.ts deutsche.

L6 — upgrades/run.ts verbraucht die HTTP-Schnittstelle
run.ts ruft catalogRoute.request() und downloadsRoute.request(). Der Übertragungsstart liefert kein Ergebnis, deshalb pollt waitPlanned() alle 2 s findDownload ohne Zeitgrenze; eine Release, die in downloading hängt, pollt unendlich.

Die Auswahl der Pfade für den Move steht zweimal über demselben Plan: run.ts nimmt entries.filter(e => e.move).map(e => e.from), api/downloads.ts nimmt entry.move && !entry.added && chosen.has(entry.from). run.ts rechnet dafür chosen aus listed.entries.filter(e => !e.directory) und wirft die ftp-Namen dann in tailOf, weil PlanEntry.from absolut ist (siehe L1).

mayPlace() ist die einzige Stelle, die Messwert, Thread-Anspruch und Bibliotheksbestand vergleicht. Dieselben drei Größen werden in upgrades/pick.ts über titleStand(), resCheck() und disproven() anders verglichen, und wishlist/evaluate.ts: coveredOf() ein drittes Mal.

L7 — Titel-Vollständigkeit als Entscheidung des Aufrufers
tmdb/title.ts trennt Cache-Lesen und Nachladen in der Schnittstelle. Vier Nachlade-Policies stehen nebeneinander:

downloads/metadata.ts: storedMovie → bei Lücke fetchMovie → fehlt imdbId oder certification, erneut fetchMovie bzw. certificationOf → erneut storedMovie. Für Serien doppelt implementiert.
library/scan.ts: fillTitle(): genres !== null ? row : await movie(id, true).
tmdb/resolve.ts: storedHit(): stets await series/movie(id).
downloads/detail.ts: umgeht title.ts und liest tmdbMovies/tmdbSeries direkt über db.
Da db/schema.ts für rund zwanzig Module offen ist, existiert neben jeder Modul-Schnittstelle ein Zweithandweg über die Tabellen; api/catalog.ts und api/settings.ts schreiben settings-Zeilen ebenfalls direkt. Modulgrenzen sind hier Verabredungen, keine Kanten.

L8 — Feldmap der Oberfläche als Server-Abhängigkeit
shared/types/settings.ts (257 LOC) enthält SETTINGS_AREAS, SETTING_FIELDS mit Gruppen, Gruppen-Layout, initial-Werten und kind. Der Server wertet davon aus: unbekannte Keys verwerfen, secret als Flag antworten, und upgrades/pick.ts liest SETTING_FIELDS.upgrade_lookback_days?.initial ?? 30 als Standardwert.

Die Feldarten werden serverseitig nicht geprüft: PUT /api/settings schreibt jeden String („every other key is written as it arrived"), min wirkt nur im Eingabefeld. api/library.ts prüft library_root auf startsWith("/"), nicht auf Existenz, und startet danach startScan(); ein Tippfehler erscheint als stand.scan.error, nicht als Antwort des Schreibvorgangs. config.libraryRoot() prüft beim Lesen zusätzlich existsSync, scan.ts liest die Zeile ungeprüft direkt.

Die Boot-Schlüssel (lib_scan_at_boot, catalog_sync_interval_min, upgrade_check_at_boot, download_resume) stehen zusätzlich hartcodiert in server/app/index.ts. Der Schlüssel library_root steht in api/library.ts, downloads/config.ts und library/scan.ts; sfdl_password in api/catalog.ts (SFDL_PASSWORD_KEY) und in der Feldmap; tmdb_api_key in tmdb/client.ts, api/tmdb.ts und in der Feldmap.

L9 — Typ-Vokabular an den Rändern
Konzept	Werte	Quelle
Titelart Bibliothek	"movie" | "series" | "other"	shared/types/library.ts
Titelart TMDB, Mapping, Wunsch, Release	"movie" | "tv"	tmdb/gates.ts, mappings, shared/types/wishlist.ts, ReleaseInfo
wishlist/library.ts: kindOf() faltet die eine in die andere; die Regel „Serie, aber nicht eine Datei davon" steht dort, nicht bei den Typen. Der Browser erhält beide simultaneously: TmdbTitle.kind mit "series" im Stand, ReleaseTitle.kind mit "tv" im Katalog.

LibraryStand.root ist im Typ als konfigurierter Ordner erklärt, wird in library/stand.ts aber in allen drei Zuweisungen null gelassen; GET /library/stand ergänzt root aus der Settings-Zeile, POST /settings/library/scan antwortet ohne root.

L10 — Domänenschritt im Browser
windows/downloads/Downloads.tsx (1079 LOC): Verschmelzung disk × ftp-Listing, Restzeit- und Tempo-Ansatz, Episoden-Zuordnung über detail.episodes[].files, eigenes Einstellungen-Menü mit NumberInput/Check und eigener save-Funktion — dasselbe Schreibverhalten wie das Settings-Fenster, eigener Ansatzt.
windows/library/node.ts (167 LOC) und format.ts (101 LOC): sämtliche Aggregate (Dateizahl, Gesamtgröße, letzter Stand, Eintragszahl, Ton, Qualität aus dem Messwert) werden aus dem ungefalteten Baum gebildet, den GET /library/stand liefert.
windows/catalog/filters.ts (44 LOC) und Catalog.tsx (231 LOC): Filterachsen, Foren und Suche im Browser über dem vollständigen Kategoriensatz; api/catalog.ts sagt das ausdrücklich („no paging").
L11 — Vervielfachte Helfer
Helfer	Stellen
JSON-Tagspaltung tagsOf	api/catalog.ts, wishlist/evaluate.ts, upgrades/stand.ts, upgrades/pick.ts (dort exportiert)
JSON-Genre-Spaltung genresOf	api/catalog.ts, wishlist/evaluate.ts — neben tmdb/store.genreNames() (3 Aufrufern)
VIDEO_EXTENSIONS, SAMPLE_RE, isVideo	library/scan.ts, downloads/organize.ts — identische 15-Erweiterungen-Menge, identische Regex, unabhängig gepflegt
Verzeichnis-Läufer	store.ts (filesUnder, diskFiles, bytesUnder), organize.ts (releaseFilesOf), scan.ts (filesUnder, asynchron mit Hooks)
two / pad (Ziffernpaarung)	organize.ts, metadata.ts, wishlist/evaluate.ts, upgrades/pick.ts
norm	tmdb/text.ts, lokal erneut in wishlist/target.ts
Entitätspaltung	board/html.ts, board/thanks.ts (decodeEntities)
Ordnername aus ftp-Pfad	ftp/client.releaseFolder, organize.releasePathOf, run.releaseFolderOf, config.downloadFolder
root-Ordner der Bibliothek	scan.ts (Settings-Zeile), config.libraryRoot(), api/library.ts (ROOT_KEY)
5. Verantwortungsgrenzen im Ist-Zustand
Verantwortung	Träger	weitere Stellen mit derselben Regel
Board-Seiten holen und deuten	board/http.ts, board/sync.ts, board/tags.ts, board/html.ts	board/login.ts umgeht http.ts mit eigenem Challenge-Pfad, eigenem Cookie-Lager und eigener Fehlerklasse
Info-Datei eines Threads	board/thanks.ts, sfdl/fetch.ts, sfdl/parse.ts	Ablaufkette, Fehlercodes (401/404/409/422/502) und Antwortform liegen in api/catalog.ts
Titelidentität	tmdb/resolve.ts	– (fünf Aufrufer ohne Nacharbeit)
Titelzeile aus TMDB	tmdb/title.ts, tmdb/store.ts	detail.ts liest Tabellen direkt; metadata.ts und scan.ts halten eigene Nachlade-Policies
Qualitätsbänder	wishlist/target.ts	upgrades/pick.ts: bandOf, upgrades/stand.ts: FORUM_BAND, organize.ts mit bandOfRes(probeRes(…))
Bibliotheksbestand	library/scan.ts (Erzeugung), library/stand.ts (Ablage)	Bestand abfragen fünf Module selbst (3.4)
Einsortieren, Zielname	downloads/organize.ts (targetOf, render)	flat_mode, subfolders(), nameFormats() kommen aus downloads/config.ts; name_format_movie steht zusätzlich in tmdb/nfo.ts: flatFolder()
Metadaten schreiben	downloads/metadata.ts	Planeintrag entsteht in organize.ts, Schreiben und Meldungsform in api/downloads.ts
Übertragung	ftp/client.ts	Zustandsübergänge in runner.ts, Persistenz in store.ts, Abbruch über die pooled-Map, Fortschritt über die live-Map
Release-Zustand	downloads/runner.ts	CUT_OFF doppelt (runner.ts, store.ts); run.ts schreibt stopped-Notizen, deren Text pick.ts parst
Automatik-Auswahl	upgrades/pick.ts	upgrades/run.ts prüft dieselben Umschalter erneut (takeAll), mit anderer Reihenfolge der Bedingungen
Ereignisse	app/events.ts (Verteilung)	Kanal→Query-Key-Zuordnung liegt in web/data/event-client.ts; Produzenten stehen in sieben Server-Modulen; zwei Query-Key-Familien fehlen dort
Einstellungen	api/settings.ts (Schreiben), SETTING_FIELDS (Schlüsselmenge)	Lesezugriff in vier Modulen, Schlüssel-Strings mehrfach (L8)
Rohzugriff auf Tabellen	db/raw.ts	db/schema.ts als öffentlicher Zweitweg
Fensterzustand	shell/window-store.ts (Reducer, localStorage-Form, 19 Aktionen)	–
Datenaktualisierung Client	web/data/*	Downloads.tsx mit zweitem Invalidationspfad (L3)
6. Kohäsion und Wiederverwendung
Geteilt und mehrfach benutzt: resolveText (5), nameInfoOf (4), indexLibrary/libraryKey (5), genreNames (3), SETTING_FIELDS (2 Serverstellen, 2 Fenster), SETTING_*-Konstanten, render (Namensformate), placedKey/refreshPlaced (Route und Automatik), coveredOf (Wunsch und Upgrade), parseTitle (Snapshot, Tests), EVENT_CHANNELS (Typ auf beiden Seiten), Meter und Host-Slots (nur ftp/client.ts).

Grenzen der Abstraktion, wie sie gesetzt sind: db/raw.ts verzichtet bewusst auf Domänenprüfung und hält nur die Namensprüfung gegen das Live-Schema; sfdl/xml.ts verzichtet auf einen DOM-Parser; tmdb/resolve.ts ist eine Pipeline aus Funktionen ohne erweiterbares Gate-Register; shared/types/ ist flächenspezifisch in sieben Dateien und nicht generisch; shared/types/events.ts führt Kanäle als Liste, die Zuordnung zum Client-Zustand steht dort nicht.

Wiederverwendung ohne Modul: Die Erkennungsregeln für Dateiart, Musterdatei und Verzeichnislauf existieren zweimal bis dreimal mit identischen Mengen (L11); library/scan.ts und downloads/organize.ts pflegen dieselbe Erweiterungsliste und dieselbe Regex getrennt.

Dichte ohne Über-abstraktion: unpack/rar.ts, sfdl/*, db/raw.ts, board/http.ts und board/tags.ts sind kleine, vollständige Module mit einer Verantwortung und eigenem Fehlertyp, ohne konfigurierbare Haken, und werden von mehreren Stellen benutzt.

7. Schluss
Das Tiefenprofil ist zweigeteilt.

Die Beschaffungs- und Erkennungsseite ist tief: tmdb/resolve.ts (609 LOC, 2 Funktionen), board/http.ts (177, 4), ftp/client.ts (364, 8), db/raw.ts (134, 5), board/tags.ts (189, 3), library/probe.ts (169, 3), unpack/rar.ts, sfdl/*. Diese Module haben schmale Schnittstellen, eigene Fehlermodelle und werden von mehreren Aufrufern ohne Nacharbeit benutzt.

Die Seite, die Besitz und Entscheidung über Besitz betrifft, hat keine Schnittstelle dieser Form. Fünf Module beantworten „was ist in der Bibliothek" mit je eigenen Filtern über demselben indexLibrary-Ergebnis; die Auflösungsleiter steht an vier Stellen und läuft in einem Fall über einen geparsten Lesetext in downloads.note; die Einsortier-Kette wird in api/downloads.ts und in upgrades/run.ts als zwei Regelvarianten über demselben Plan ausgeführt; vier Nachlade-Policies für Titelzeilen stehen nebeneinander, weil tmdb/title.ts die Cache-Politik in der Schnittstelle zeigt. Der Pfadkonventionen gibt es vier, und jede Verbrauchsstelle rechnet selbst um.

Zwei Strukturmerkmale halten diese Verteilung offen: server/db/schema.ts ist für rund zwanzig Module direkt les- und schreibbar, wodurch jede Modulgrenze eine Verabredung ist; und die Einstellungen haben keinen Träger, wodurch Schlüssel-Strings, Standardwerte und Typdeutung an mehreren Stellen zugleich stehen, bis hin zum Standardwert einer Upgrade-Einstellung, den upgrades/pick.ts aus der Feldmap der Oberfläche liest.

Die HTTP-Schicht (48 Endpunkte) ist an mehreren Stellen zugleich Produkt-Schnittstelle und interne Modul-Schnittstelle: upgrades/run.ts verbraucht sie über route.request() und pollt danach die Tabelle, weil der Startvorgang kein Ergebnis zurückgibt; drei lesende Endpunkte schreiben Tabellen und rufen TMDB auf; und die Zuordnung Kanal→Query-Key im Browser entscheidet damit über Netzwerk- und Messkosten im Server (catalog.changed → wishlist → pullSeasons).

Zum Umbau selbst: `docs/refactor.md` hält fest, welche Regel heute an welcher Stelle sitzt.
