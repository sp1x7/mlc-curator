import type { LibraryFile, LibrarySeason, LibraryTitle, TmdbTitle } from "@shared/types/library";
import { posterUrl } from "@shared/types/tmdb";
import {
  audioText,
  dateText,
  QUALITY_LABEL,
  ratingText,
  runtimeText,
  shortDateText,
  sizeText,
  subtitleText,
} from "./format";
import {
  childrenOf,
  countEntries,
  countFiles,
  haveOf,
  type LibraryNode,
  lastModified,
  type NodeIndex,
  qualitiesOf,
  titleAbove,
  totalSize,
  trailOf,
  videosOf,
} from "./node";

/** One label line of the detail column; an empty value renders zero output. */
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt className="label-tight pt-[2px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}

/** A grid of label lines; entries that are all empty render zero output. */
function Rows({ entries }: { entries: Array<[string, string | null | undefined]> }) {
  const filled = entries.filter(([, value]) => Boolean(value));
  if (filled.length === 0) return null;

  return (
    <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-1">
      {filled.map(([label, value]) => (
        <Row key={label} label={label} value={value ?? null} />
      ))}
    </dl>
  );
}

/** A titled block; children that fall away leave the block out. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const parts = Array.isArray(children) ? children.filter(Boolean) : [children];
  if (parts.filter(Boolean).length === 0) return null;

  return (
    <section className="mt-2.5 border-t border-hair-8 pt-2.5">
      <h3 className="label-section mb-1.5 text-muted-foreground">{title}</h3>
      {parts}
    </section>
  );
}

/** The tmdb line: id and kind word. */
function tmdbLabel(tmdb: TmdbTitle): string {
  return `${tmdb.tmdbId} · ${tmdb.kind === "movie" ? "Film" : "Serie"}`;
}

// IMDb, Genre and Freigabe belong to the title record, so the levels below
// repeat them instead of carrying their own.
function creditRows(tmdb: TmdbTitle | null) {
  return (
    <Rows
      entries={[
        ["IMDb", tmdb?.imdbId ?? null],
        ["Genre", tmdb?.genres.length ? tmdb.genres.join(", ") : null],
        ["Freigabe", tmdb?.certification ?? null],
      ]}
    />
  );
}

function titleRows(tmdb: TmdbTitle | null) {
  if (!tmdb) return null;

  return (
    <>
      <Rows
        entries={[
          ["Titel", tmdb.title],
          [
            "Originaltitel",
            tmdb.originalTitle && tmdb.originalTitle !== tmdb.title ? tmdb.originalTitle : null,
          ],
          ["TMDB", tmdbLabel(tmdb)],
        ]}
      />
      {creditRows(tmdb)}
      <Rows
        entries={[
          ["Jahr", tmdb.year === null ? null : String(tmdb.year)],
          ["Bewertung", ratingText(tmdb.rating)],
        ]}
      />
    </>
  );
}

/** The lines of a season folder: tmdb id, first air date and the qualities of its
    files. */
function seasonRows(season: LibrarySeason, seriesTmdb: TmdbTitle | null) {
  return (
    <>
      <Rows
        entries={[
          ["TMDB", seriesTmdb ? String(seriesTmdb.tmdbId) : "nicht gefunden"],
          ["Erstausstrahlung", season.airDate],
          [
            "Qualität",
            qualitiesOf(season)
              .map((quality) => QUALITY_LABEL[quality] ?? quality)
              .join(" · "),
          ],
        ]}
      />
      {creditRows(seriesTmdb)}
    </>
  );
}

/** The lines of an episode file: the tmdb episode when the match found one, the word
    from the name otherwise. */
function episodeRows(file: LibraryFile, seriesTmdb: TmdbTitle | null) {
  const episode = file.episode;

  if (!episode) {
    return <Rows entries={[["Folge im Namen", file.nameInfo.episodeLabel ?? "nicht erkannt"]]} />;
  }

  const reference = `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}`;

  return (
    <>
      <Rows
        entries={[
          ["Titel", episode.name],
          [
            "Originaltitel",
            episode.originalName && episode.originalName !== episode.name
              ? episode.originalName
              : null,
          ],
          ["TMDB", seriesTmdb ? `${seriesTmdb.tmdbId} · ${reference}` : reference],
        ]}
      />
      {creditRows(seriesTmdb)}
      <Rows
        entries={[
          ["Erstausstrahlung", episode.airDate],
          ["Laufzeit", episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : null],
        ]}
      />
    </>
  );
}

/** The measured lines of a file; an absent measurement lists the words the name
    carries. */
function probeRows(file: LibraryFile) {
  const probe = file.probe;

  if (!probe) {
    return (
      <Rows
        entries={[
          ["Geprüft", file.probeFailed ? "fehlgeschlagen" : "nicht geprüft"],
          ["Folge im Namen", file.nameInfo.episodeLabel],
          ["Qualität im Namen", file.nameInfo.quality],
          ["Codec im Namen", file.nameInfo.codec],
          ["Audio im Namen", file.nameInfo.audio],
          ["HDR im Namen", file.nameInfo.hdr],
          ["Gruppe im Namen", file.nameInfo.group],
        ]}
      />
    );
  }

  return (
    <Rows
      entries={[
        ["Auflösung", probe.width && probe.height ? `${probe.width}×${probe.height}` : null],
        ["Codec", probe.videoCodec],
        ["HDR", probe.hdr ?? "nein"],
        ["Laufzeit", runtimeText(probe.runtimeMinutes)],
        ["Audio", audioText(probe)],
        ["Untertitel", subtitleText(probe)],
      ]}
    />
  );
}

/** One measurement block per video file. */
function technologyRows(files: LibraryFile[]) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.path}>
          <div className="mb-1 font-mono text-[10px] break-all text-muted-foreground">
            {file.name}
          </div>
          {probeRows(file)}
        </div>
      ))}
    </div>
  );
}

/** One row per season tmdb expects: the folder, or the marker of an absent one. */
function seasonTable(title: LibraryTitle) {
  // The season folders by their number.
  const present = new Map(
    childrenOf(title)
      .filter((child): child is LibrarySeason => child.type === "season")
      .map((child) => [child.number ?? -1, child]),
  );
  // The higher of the tmdb season count and the folders on disk.
  const total = Math.max(title.tmdb?.seasonsExpected ?? 0, present.size);
  if (total === 0) return null;

  const rows = [];
  for (let number = 1; number <= total; number += 1) {
    const season = present.get(number);

    if (!season) {
      rows.push(
        <tr key={number}>
          <td className="px-1 py-[3px] text-right font-mono tabular-nums">{number}</td>
          <td className="px-1 py-[3px] text-err">Ordner fehlt</td>
          <td className="px-1 py-[3px] text-right font-mono tabular-nums">-</td>
        </tr>,
      );
      continue;
    }

    // The folder holds the episode count tmdb names for the season.
    const complete = haveOf(season) >= season.expected;
    rows.push(
      <tr key={number}>
        <td className="px-1 py-[3px] text-right font-mono tabular-nums">{number}</td>
        <td className="px-1 py-[3px]">{season.tmdbName ?? `Staffel ${season.number}`}</td>
        <td
          className={cnRow(
            complete ? "text-ok" : "text-wrn",
            "px-1 py-[3px] text-right font-mono tabular-nums",
          )}
        >
          {haveOf(season)}/{season.expected}
        </td>
      </tr>,
    );
  }

  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-hair-8">
          <th className="label px-1 py-1 text-right text-muted-foreground">Nr</th>
          <th className="label px-1 py-1 text-left text-muted-foreground">Staffel</th>
          <th className="label px-1 py-1 text-right text-muted-foreground">Folgen</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

/** One row per tmdb episode, the file column checking the folder on disk. */
function episodeTable(season: LibrarySeason) {
  if (season.episodes.length === 0) return null;

  // The episode numbers the files of the folder name, samples left out.
  const owned = new Set(
    season.children
      .filter((file) => !file.sample)
      .map((file) => file.episode?.number ?? file.nameInfo.episodes[0])
      .filter((number): number is number => typeof number === "number"),
  );

  return (
    <table className="w-full table-fixed border-collapse text-[12px]">
      <colgroup>
        <col style={{ width: 32 }} />
        <col />
        <col style={{ width: 62 }} />
        <col style={{ width: 44 }} />
      </colgroup>
      <thead>
        <tr className="border-b border-hair-8">
          <th className="label px-1 py-1 text-right text-muted-foreground">Nr</th>
          <th className="label px-1 py-1 text-left text-muted-foreground">Folge</th>
          <th className="label px-1 py-1 text-left text-muted-foreground">Datum</th>
          <th className="label px-1 py-1 text-right text-muted-foreground">Datei</th>
        </tr>
      </thead>
      <tbody>
        {season.episodes.map((episode) => {
          const has = owned.has(episode.number);
          return (
            <tr key={episode.number}>
              <td className="px-1 py-[3px] text-right font-mono tabular-nums">{episode.number}</td>
              <td className="truncate px-1 py-[3px] whitespace-nowrap" title={episode.name ?? ""}>
                {episode.name}
              </td>
              <td className="px-1 py-[3px] font-mono tabular-nums text-muted-foreground">
                {shortDateText(episode.airDate) || "-"}
              </td>
              <td className={cnRow(has ? "text-ok" : "text-err", "px-1 py-[3px] text-right")}>
                {has ? "✓" : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Joins the class fragments that hold text. */
function cnRow(...classes: string[]): string {
  return classes.filter(Boolean).join(" ");
}

/** The detail column of one library node: title text, season, episode, measurements
    and the tables under it. */
export default function Detail({ node, index }: { node: LibraryNode | null; index: NodeIndex }) {
  if (!node) {
    return <div className="p-3 text-muted-foreground">Nichts ausgewählt</div>;
  }

  const trail = trailOf(node, index);
  const titleLevel = titleAbove(node, index);
  const seriesLevel = trail.find(
    (part): part is LibraryTitle => part.type === "title" && part.kind === "series",
  );
  const seasonLevel = trail.find((part): part is LibrarySeason => part.type === "season") ?? null;

  const series = seriesLevel?.tmdb ?? null;
  const ownTitle = node.type === "title" ? node.tmdb : null;

  // A file or season under a title shows the text of that title when its own level
  // stays empty.
  const shownTitle: TmdbTitle | null =
    node.type === "title"
      ? node.tmdb
      : node.type === "file"
        ? node.flat
          ? node.tmdb
          : titleLevel?.kind === "movie"
            ? titleLevel.tmdb
            : null
        : (titleLevel?.tmdb ?? null);

  const overview =
    (node.type === "file" ? node.episode?.overview : null) ??
    (node.type === "season" ? node.overview : null) ??
    (node.type === "title" ? node.tmdb?.overview : null) ??
    shownTitle?.overview ??
    null;

  const videos: LibraryFile[] =
    node.type === "file"
      ? node.video
        ? [node]
        : []
      : node.type === "title" && node.kind === "movie"
        ? videosOf(node)
        : [];

  // A picture file gets no episode section.
  const isImage = node.type === "file" && !node.video;

  const elements: Array<[string, string | null]> = [];
  if (node.type === "root-folder") elements.push(["Einträge", String(countEntries(node))]);
  if (node.type !== "file") elements.push(["Dateien", String(countFiles(node))]);
  elements.push(["Größe", sizeText(totalSize(node))], ["Geändert", dateText(lastModified(node))]);

  const poster =
    node.type === "season"
      ? posterUrl(node.posterPath, "w300")
      : node.type === "file" && node.episode
        ? posterUrl(node.episode.stillPath, "w300")
        : posterUrl(shownTitle?.posterPath ?? null, "w185");

  return (
    <div className="p-3">
      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">
            {ownTitle?.title ??
              (node.type === "file" ? (node.tmdb?.title ?? node.name) : node.name)}
          </h2>
          <div className="mb-2 truncate text-[11px] text-muted-foreground">
            {trail.map((part) => part.name).join(" / ")}
          </div>
        </div>
        {poster && (
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="w-[86px] shrink-0 self-start rounded-[9px] border border-hair-8 object-cover"
          />
        )}
      </div>

      {shownTitle ? <Section title="Titel">{titleRows(shownTitle)}</Section> : null}

      {seasonLevel?.path === node.path ? (
        <Section title={seasonLevel.tmdbName ?? `Staffel ${seasonLevel.number}`}>
          {seasonRows(seasonLevel, series)}
        </Section>
      ) : null}

      {node.type === "file" && (seasonLevel || seriesLevel) && !isImage ? (
        <Section title="Folge">{episodeRows(node, series)}</Section>
      ) : null}

      {overview ? (
        <Section title="Beschreibung">
          <p className="text-[12px] text-muted-foreground">{overview}</p>
        </Section>
      ) : null}

      {videos.length > 0 ? <Section title="Technik">{technologyRows(videos)}</Section> : null}

      {node.type === "title" && node.kind === "series" ? (
        <Section title="Staffeln">{seasonTable(node)}</Section>
      ) : null}

      {node.type === "season" ? <Section title="Folgen">{episodeTable(node)}</Section> : null}

      <Section title="Elemente">
        <Rows entries={elements} />
      </Section>
    </div>
  );
}
