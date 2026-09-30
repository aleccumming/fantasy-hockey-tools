// Server-only. Builds real SkaterRateStats for the Player Evaluator's three
// windows - last 5 games, last 10 games, and the season to date - each
// ranked independently, plus a shared multi-season baseline for the
// luck/regression columns (used in all three windows, so a stat is never
// compared against itself even when viewing the Season window).
import type { SkaterRateStats } from "./streamer-stats";
import { currentNstSeason, baselineSeasonRange } from "./nst-client";
import { fetchSkaterWindow, toSkaterRateStats, type SkaterWindowRow } from "./skater-window";
import { normalizeName } from "./name-matching";

export type EvaluatorWindow = "last5" | "last10" | "season";

export interface PlayerEvaluatorStats {
  last5: SkaterRateStats[];
  last10: SkaterRateStats[];
  season: SkaterRateStats[];
}

// Same small-sample guard as Streamer Suggestions - below this much total
// ice time over a window, per-60 rates are too noisy to trust. Fixed at 20
// minutes for the two short windows, since they're always the same size
// (5 or 10 games) regardless of when in the season it is.
const MIN_WINDOW_TOI_MINUTES = 20;

// The Season window can't use a fixed total-minutes bar the same way - a
// flat "250 minutes" would show almost nobody for the first couple of
// weeks of a new season, since nobody's played enough games yet to reach
// it. 250 minutes over a full 84-game season averages out to about 3
// min/game - an intentionally low, inclusive bar meant only to exclude
// one-shift emergency call-ups, not real roster players. Scaling that same
// per-game standard by how far the season has actually progressed (using
// the highest single-player GP seen in the data as a proxy for that,
// rather than a separate schedule lookup) keeps the bar proportionally
// tiny on opening night and lets it grow into the full 250 as the season
// goes on, so real players never disappear from the list early on.
const SEASON_FULL_GAMES = 84;
const SEASON_MIN_TOI_AT_FULL_SEASON = 250;

function seasonMinToi(seasonRows: Map<string, SkaterWindowRow>): number {
  let maxGp = 0;
  for (const row of seasonRows.values()) {
    if (row.gp > maxGp) maxGp = row.gp;
  }
  if (maxGp <= 0) return 0;
  return (SEASON_MIN_TOI_AT_FULL_SEASON * Math.min(maxGp, SEASON_FULL_GAMES)) / SEASON_FULL_GAMES;
}

let cache: { data: PlayerEvaluatorStats; expiresAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

function buildStats(
  rows: Map<string, SkaterWindowRow>,
  baselineRows: Map<string, SkaterWindowRow>,
  minToi: number
): SkaterRateStats[] {
  const stats: SkaterRateStats[] = [];
  for (const row of rows.values()) {
    if (row.toi < minToi) continue;
    stats.push(toSkaterRateStats(row, baselineRows.get(normalizeName(row.name))));
  }
  return stats;
}

export async function getPlayerEvaluatorStats(forceRefresh = false): Promise<PlayerEvaluatorStats> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const [season, baselineRange] = await Promise.all([currentNstSeason(), baselineSeasonRange()]);

  const [last5Rows, last10Rows, seasonRows, baselineRows] = await Promise.all([
    fetchSkaterWindow({
      fromSeason: season,
      thruSeason: season,
      gameRange: { type: "teamGames", games: 5 },
      situation: "all",
    }),
    fetchSkaterWindow({
      fromSeason: season,
      thruSeason: season,
      gameRange: { type: "teamGames", games: 10 },
      situation: "all",
    }),
    fetchSkaterWindow({
      fromSeason: season,
      thruSeason: season,
      gameRange: { type: "none" },
      situation: "all",
    }),
    fetchSkaterWindow({ ...baselineRange, gameRange: { type: "none" }, situation: "all" }),
  ]);

  const data: PlayerEvaluatorStats = {
    last5: buildStats(last5Rows, baselineRows, MIN_WINDOW_TOI_MINUTES),
    last10: buildStats(last10Rows, baselineRows, MIN_WINDOW_TOI_MINUTES),
    season: buildStats(seasonRows, baselineRows, seasonMinToi(seasonRows)),
  };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
