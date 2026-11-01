// The tmdb side of one release and what ffprobe says about its files.

import { basename } from "node:path";
import type { ReleaseDetail } from "@shared/types/downloads";
import { nameInfoOf } from "../library/name-info";
import { probeMeasured } from "../library/probe";
import { parseName } from "../tmdb/name";
import { genreNames } from "../tmdb/store";
import {
  type EpisodeRow,
  season as fetchSeason,
  storedMovie,
  storedSeason,
  storedSeries,
} from "../tmdb/title";
import { isVideo, releaseFilesOf, releasePathOf } from "./organize";
import { releaseInfoOf, releaseOf } from "./store";

/**
 * Builds the detail payload of one release: tmdb info fields for the linked
 * title, episodes matched onto the video files of the folder, and one ffprobe
 * measurement per file.
 */
export async function releaseDetailOf(threadId: number, folder: string): Promise<ReleaseDetail> {
  const link = releaseInfoOf(threadId);
  const tmdbId = link.tmdbId;

  const detail: ReleaseDetail = {
    threadId,
    info: {
      ...link,
      overview: null,
      posterPath: null,
      originalName: null,
      genres: [],
      rating: null,
      votes: null,
      certification: null,
      boardUrl: releaseOf(threadId)?.url ?? null,
      season: null,
      seasonEpisodes: null,
      seasonOverview: null,
    },
    episodes: [],
    videos: [],
  };

  // A release whose mapping is empty keeps the frame with board url and empty
  // lists.
  if (tmdbId === null) return detail;

  const videos = releaseFilesOf(folder).filter((file) => isVideo(basename(file)));

  // Files are named from the release folder down, the ftp list does the same.
  const root = `${releasePathOf(folder)}/`;
  const tail = (file: string): string => (file.startsWith(root) ? file.slice(root.length) : file);

  // Movie branch: the stored movie row fills the info fields.
  if (link.kind === "movie") {
    const movie = storedMovie(tmdbId);

    if (movie) {
      detail.info.overview = movie.overview;
      detail.info.posterPath = movie.posterPath;
      detail.info.originalName = movie.originalTitle;
      detail.info.genres = genreNames(movie.genres);
      detail.info.rating = movie.voteAverage;
      detail.info.votes = movie.voteCount;
      detail.info.certification = movie.certification;
    }
  } else {
    const series = storedSeries(tmdbId);

    if (series) {
      detail.info.overview = series.overview;
      detail.info.posterPath = series.posterPath;
      detail.info.originalName = series.originalTitle;
      detail.info.genres = genreNames(series.genres);
      detail.info.rating = series.voteAverage;
      detail.info.votes = series.voteCount;
      detail.info.certification = series.certification;
    }

    // One entry per season and episode pair that the file names carry, with the
    // files that name it.
    const named = new Map<string, { season: number; episode: number; files: string[] }>();
    const packs = new Set<number>();

    for (const file of videos) {
      const words = nameInfoOf(basename(file));
      // The folder name of a file gives the season first, the file name second,
      // and season 1 for a file that names none of them.
      const season = words.season ?? parseName(basename(file)).season ?? 1;

      if (words.episodes.length === 0) {
        packs.add(season);
        continue;
      }

      for (const episode of words.episodes) {
        const entry = named.get(`${season}/${episode}`) ?? { season, episode, files: [] };
        entry.files.push(tail(file));
        named.set(`${season}/${episode}`, entry);
      }
    }

    // A pack file arrives episode-free, so its whole season counts as meant.
    const wanted = new Set<number>(packs);
    for (const entry of named.values()) wanted.add(entry.season);

    const stored = new Map<string, EpisodeRow>();

    // One tmdb season request per season the files touched; a failing request
    // leaves that season out of the map.
    for (const number of wanted) {
      const answer = await fetchSeason(tmdbId, number).catch(() => null);
      if (answer === null) continue;

      for (const row of answer.episodes)
        stored.set(`${row.seasonNumber}/${row.episodeNumber}`, row);
    }

    // Every stored episode of a pack season that the files left unnamed joins
    // the list with an empty file list.
    for (const number of packs) {
      for (const [key, row] of stored) {
        if (row.seasonNumber !== number || named.has(key)) continue;

        named.set(key, { season: number, episode: row.episodeNumber, files: [] });
      }
    }

    detail.episodes = [...named.values()]
      .sort((a, b) => a.season - b.season || a.episode - b.episode)
      .map((entry) => {
        const row = stored.get(`${entry.season}/${entry.episode}`) ?? null;

        return {
          season: entry.season,
          episode: entry.episode,
          name: row?.name ?? row?.originalName ?? null,
          overview: row?.overview ?? null,
          runtimeMinutes: row?.runtimeMinutes ?? null,
          airDate: row?.airDate ?? null,
          stillPath: row?.stillPath ?? null,
          files: entry.files,
        };
      });

    const seasons = [...new Set(detail.episodes.map((entry) => entry.season))];

    // Season meta shows for a release that covers exactly one season.
    if (seasons.length === 1) {
      const number = seasons[0] ?? 0;
      const row = storedSeason(tmdbId, number);

      detail.info.season = number;
      detail.info.seasonEpisodes = row?.episodeCount ?? null;
      detail.info.seasonOverview = row?.overview ?? null;
    }
  }

  // ffprobe measurements last, one entry per video file of the folder.
  for (const file of videos) {
    const answer = await probeMeasured(file);
    detail.videos.push({
      path: tail(file),
      bytes: answer.bytes,
      probe: answer.probe,
      note: answer.note,
    });
  }

  return detail;
}
