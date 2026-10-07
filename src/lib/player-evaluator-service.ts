// Server-only. Builds real SkaterRateStats for the Player Evaluator's four
// windows - last 5 games, last 10 games, the season to date, and last
// season - each ranked independently, plus a per-window multi-season
// baseline for the luck/regression columns, so a stat is never compared
// against itself even when viewing the Season or Last Season window (see
// seasonRangeSpanning's use below for how Last Season gets its own
// baseline ending one season further back, instead of reusing the
// current-season baseline, which would otherwise overlap it heavily).
import type { SkaterRateStats } from "./streamer-stats";
import { currentNstSeason, baselineSeasonRange, previousNstSeason, seasonRangeSpanning } from "./nst-client";
import { fetchSkaterWindow, toSkaterRateStats, type SkaterWindowRow } from "./skater-window";
import { normalizeName } from "./name-matching";
import { readNstCacheRow, writeNstCacheRow } from "./nst-data-cache";

export type EvaluatorWindow = "last5" | "last10" | "season" | "lastSeason";

export interface PlayerEvaluatorStats {
  last5: SkaterRateStats[];
  last10: SkaterRateStats[];
  season: SkaterRateStats[];
  lastSeason: SkaterRateStats[];
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
const WINDOW_MIN_TOI_AT_FULL: Record<EvaluatorWindow, { fullGames: number; fullMinToi: number }> = {
  last5: { fullGames: 5, fullMinToi: 20 },
  last10: { fullGames: 10, fullMinToi: 20 },
  season: { fullGames: 84, fullMinToi: 250 },
  // Last Season is always a complete season by definition, so this just
  // settles at the full 250-minute bar in practice (same config as
  // Season - the scaling only matters while a window is still filling up).
  lastSeason: { fullGames: 84, fullMinToi: 250 },
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

// In-memory only for the lifetime of a single warm serverless instance -
// the real cross-request/cross-cold-start cache is the DB row this reads
// through to (see nst-data-cache.ts). Freshness is controlled entirely by
// how often refresh-nst-caches' cron writes that row, not by any TTL here.
let memoryCache: PlayerEvaluatorStats | null = null;

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

/** What every page request calls - never talks to NST directly. Reads the
 *  DB row the daily cron last wrote; only falls back to a live fetch if
 *  that row has genuinely never been seeded yet (e.g. right after this
 *  table was created, before the cron's first run). */
export async function getPlayerEvaluatorStats(): Promise<PlayerEvaluatorStats> {
  if (memoryCache) return memoryCache;

  const dbData = await readNstCacheRow<PlayerEvaluatorStats>("playerEvaluator");
  if (dbData) {
    memoryCache = dbData;
    return dbData;
  }

  return refreshPlayerEvaluatorCache();
}

/** The real live NST fetch + computation - only the cron (and the one-time
 *  bootstrap fallback above) should call this directly. */
export async function refreshPlayerEvaluatorCache(): Promise<PlayerEvaluatorStats> {
  const [season, baselineRange] = await Promise.all([currentNstSeason(), baselineSeasonRange()]);
  const lastSeason = previousNstSeason(season);
  // Ends one season further back than lastSeason itself, so Last Season's
  // own luck/regression columns aren't compared against a baseline that's
  // mostly made of the exact same season being displayed.
  const lastSeasonBaselineRange = seasonRangeSpanning(previousNstSeason(lastSeason));

  const [last5Rows, last10Rows, seasonRows, baselineRows, lastSeasonRows, lastSeasonBaselineRows] =
    await Promise.all([
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
      fetchSkaterWindow({
        fromSeason: lastSeason,
        thruSeason: lastSeason,
        gameRange: { type: "none" },
        situation: "all",
      }),
      fetchSkaterWindow({ ...lastSeasonBaselineRange, gameRange: { type: "none" }, situation: "all" }),
    ]);

  const data: PlayerEvaluatorStats = {
    last5: buildStats(last5Rows, baselineRows, scaledMinToi(last5Rows, "last5")),
    last10: buildStats(last10Rows, baselineRows, scaledMinToi(last10Rows, "last10")),
    season: buildStats(seasonRows, baselineRows, scaledMinToi(seasonRows, "season")),
    lastSeason: buildStats(lastSeasonRows, lastSeasonBaselineRows, scaledMinToi(lastSeasonRows, "lastSeason")),
  };

  memoryCache = data;
  await writeNstCacheRow("playerEvaluator", data);
  return data;
}
