import type { Position } from "./types";
import { normalizeName } from "./name-matching";

/** Rate stats over a recent window (e.g. last 5 games), all "higher is
 *  better" - sourced from Natural Stat Trick. */
export interface SkaterRateStats {
  name: string;
  team: string;
  positions: Position[];
  gamesPlayed: number;
  /** Plain box-score totals over the window - not part of the composite
   *  ranking (goals/assists/points are themselves an outcome of luck as
   *  much as process), just useful to see at a glance alongside it. TOI is
   *  average minutes per game. */
  goals: number;
  assists: number;
  toiPerGame: number;
  /** "Bangers" category totals over the window - categories-league scoring
   *  value (hits/blocks/PIM), not points-league value, so kept alongside
   *  the box score rather than folded into the composite C-Score ranking. */
  pim: number;
  hits: number;
  blocks: number;
  shotsPer60: number;
  iCFPer60: number;
  iSCFPer60: number;
  ixGPer60: number;
  oiCFPer60: number;
  oiSCFPer60: number;
  oixGPer60: number;
  /** "Luck"/regression context, shown alongside the composite ranking but
   *  deliberately NOT part of it - these describe how a player's points
   *  came about (shooting % running hot or cold, how much of the team's
   *  on-ice scoring they personally factored into) rather than how much
   *  opportunity they're generating, so they don't belong in a ranking of
   *  underlying process. All are percentages, e.g. 12.4 meaning 12.4%. */
  shootingPct: number;
  onIceShPct: number;
  ipp: number;
  /** Career baseline for the same three numbers - what "normal" for this
   *  player looks like, so the recent-window value can be read as running
   *  hot or cold relative to their own established level rather than in
   *  isolation. */
  baselineShootingPct: number;
  baselineOnIceShPct: number;
  baselineIpp: number;
}

const METRICS = [
  "shotsPer60",
  "iCFPer60",
  "iSCFPer60",
  "ixGPer60",
  "oiCFPer60",
  "oiSCFPer60",
  "oixGPer60",
] as const;

type MetricKey = (typeof METRICS)[number];

export interface RankedSkaterStats extends SkaterRateStats {
  /** This player's rank (1 = best) within the given pool, for each metric. */
  metricRanks: Record<MetricKey, number>;
  /** Average of the 7 metric ranks - lower is better. Not a single "true"
   *  ranking, just a simple, transparent way to combine several rate stats
   *  that doesn't require weighting one over another. */
  compositeRank: number;
}

/**
 * Ranks every player against the given pool (typically all rostered-eligible
 * skaters league-wide, over a recent window like the last 5 games) on each
 * of the 7 underlying rate stats, then averages those 7 ranks into one
 * composite score. Sorted best (lowest composite) first.
 */
export function computeCompositeRankings(stats: SkaterRateStats[]): RankedSkaterStats[] {
  if (stats.length === 0) return [];

  const ranksByMetric = new Map<MetricKey, Map<SkaterRateStats, number>>();
  for (const metric of METRICS) {
    const sorted = [...stats].sort((a, b) => b[metric] - a[metric]);
    const ranks = new Map<SkaterRateStats, number>();
    sorted.forEach((s, i) => ranks.set(s, i + 1));
    ranksByMetric.set(metric, ranks);
  }

  const ranked = stats.map((s) => {
    const metricRanks = Object.fromEntries(
      METRICS.map((m) => [m, ranksByMetric.get(m)!.get(s)!])
    ) as Record<MetricKey, number>;
    const compositeRank =
      METRICS.reduce((sum, m) => sum + metricRanks[m], 0) / METRICS.length;
    return { ...s, metricRanks, compositeRank };
  });

  return ranked.sort((a, b) => a.compositeRank - b.compositeRank);
}

/** Forwards and defensemen have such different baseline rate-stat profiles
 *  (D generally shoot/generate far less than forwards) that ranking them
 *  together would just mean every top-10 spot goes to a forward - split
 *  into two separate pools first, and rank each independently, so "Shots/60
 *  rank" means "among forwards" or "among D", never mixed. Every NHL skater
 *  is cleanly one or the other, never both. */
export function computeCompositeRankingsByGroup(stats: SkaterRateStats[]): {
  forwards: RankedSkaterStats[];
  defense: RankedSkaterStats[];
} {
  const defenseStats = stats.filter((p) => p.positions.includes("D"));
  const forwardStats = stats.filter((p) => !p.positions.includes("D"));
  return {
    forwards: computeCompositeRankings(forwardStats),
    defense: computeCompositeRankings(defenseStats),
  };
}

/** Filters a composite-ranked list down to only players present in a set of
 *  available (free-agent) names, preserving the existing rank order - a
 *  plain filter, deliberately, since a manual indexing/slicing approach is
 *  exactly what silently dropped the #1 overall player in the old sheet
 *  this was ported from. */
export function filterToAvailable<T extends { name: string }>(
  ranked: T[],
  availableNames: Iterable<string>
): T[] {
  const available = new Set(Array.from(availableNames, normalizeName));
  return ranked.filter((p) => available.has(normalizeName(p.name)));
}
