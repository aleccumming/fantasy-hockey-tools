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

// Below this much total ice time over a window, per-60 rates are too noisy
// to trust - the target bar once a window is actually "full" (a team's
// really played this many games). 20 minutes for the two short windows
// (same flat total for both, so the 10-game window ends up with a more
// lenient per-game average than the 5-game one - intentional: more games
// means more chances for noise to average out, so a slightly lower
// per-game bar is still trustworthy), 250 for the season (~3 min/game
// over a full 84-game season - low and inclusive, meant only to exclude
// one-shift emergency call-ups, not real roster players).
const WINDOW_MIN_TOI_AT_FULL: Record<"last5" | "last10" | "season", { fullGames: number; fullMinToi: number }> = {
  last5: { fullGames: 5, fullMinToi: 20 },
  last10: { fullGames: 10, fullMinToi: 20 },
  season: { fullGames: 84, fullMinToi: 250 },
};

/** A flat minutes floor works once a window is actually full, but early in
 *  a window - especially early in a new season, when even "last 5 games"
 *  can't yet contain 5 real games - the same flat bar becomes a much
 *  stricter PER-GAME requirement than intended (20 minutes total across 1
 *  game is a real ask even a true top-line player can miss on an off
 *  night; confirmed live on opening week: Crosby/Malkin/Karlsson all
 *  excluded from Last 5 by this exact flat bar while clearing Season's
 *  already-scaled one). So every window scales its bar the same way,
 *  proportional to how many games have actually been played so far within
 *  it (using the highest single-player GP seen in that window's own data
 *  as a proxy, rather than a separate schedule lookup) - tiny on opening
 *  night, growing to the full target as that window's games actually
 *  accumulate, so real players never disappear from ANY window early on. */
function scaledMinToi(rows: Map<string, SkaterWindowRow>, window: EvaluatorWindow): number {
  const { fullGames, fullMinToi } = WINDOW_MIN_TOI_AT_FULL[window];
  let maxGp = 0;
  for (const row of rows.values()) {
    if (row.gp > maxGp) maxGp = row.gp;
  }
  if (maxGp <= 0) return 0;
  return (fullMinToi * Math.min(maxGp, fullGames)) / fullGames;
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
    last5: buildStats(last5Rows, baselineRows, scaledMinToi(last5Rows, "last5")),
    last10: buildStats(last10Rows, baselineRows, scaledMinToi(last10Rows, "last10")),
    season: buildStats(seasonRows, baselineRows, scaledMinToi(seasonRows, "season")),
  };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
