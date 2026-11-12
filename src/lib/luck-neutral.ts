// Luck-neutral production: what a skater's goals, assists and fantasy
// points would be with S%, oiS% and IPP at their own 3-season baseline,
// and where that would rank them. A full reset to baseline, not a partial
// regression - real skill changes (a new role, a better line) show up
// here as "luck" too, which the Luck tab says up front.
import type { RankedSkaterStats } from "./streamer-stats";
import { MIN_GP_FOR_ON_ICE, MIN_SHOTS_FOR_SH_PCT } from "./trade-targets";

/** Skater stats this app has data for that a Yahoo points league can
 *  weight. */
export type ScoredSkaterStat = "goals" | "assists" | "points" | "shots" | "hits" | "blocks" | "pim";

export interface LeagueSkaterScoring {
  /** "categories" leagues have no point values - callers fall back to
   *  DEFAULT_WEIGHTS. */
  kind: "points" | "categories";
  weights: Partial<Record<ScoredSkaterStat, number>>;
  /** Display names of skater categories the league scores that aren't in
   *  the data (PPP, +/-, FW...) - left out of fantasy points entirely. */
  unsupported: string[];
}

/** Plain points (G + A) - used with no connected league or in a
 *  categories league. */
export const DEFAULT_WEIGHTS: LeagueSkaterScoring["weights"] = { goals: 1, assists: 1 };

export const SCORED_STAT_LABELS: Record<ScoredSkaterStat, string> = {
  goals: "G",
  assists: "A",
  points: "P",
  shots: "SOG",
  hits: "HIT",
  blocks: "BLK",
  pim: "PIM",
};

export interface LuckNeutralRow {
  player: RankedSkaterStats;
  neutralGoals: number;
  neutralAssists: number;
  /** Each luck stat's share of the change, in its own units - goals for
   *  S%, points for oiS% and IPP. Null when that stat had too small a
   *  sample (or no baseline) to reset. */
  goalsFromShPct: number | null;
  pointsFromOnIceShPct: number | null;
  pointsFromIpp: number | null;
  fantasyPoints: number;
  neutralFantasyPoints: number;
  /** Ranks by fantasy points per game within the pool - 1 = best. */
  rank: number;
  neutralRank: number;
  /** Position in the pool's C-Score order. */
  cScoreRank: number;
}

/** Total shots on goal - SkaterRateStats only carries the per-60 rate. */
function totalShots(p: RankedSkaterStats): number {
  return (p.shotsPer60 * p.toiPerGame * p.gamesPlayed) / 60;
}

function fantasyPoints(
  p: RankedSkaterStats,
  goals: number,
  assists: number,
  weights: LeagueSkaterScoring["weights"]
): number {
  const w = (k: ScoredSkaterStat) => weights[k] ?? 0;
  return (
    w("goals") * goals +
    w("assists") * assists +
    w("points") * (goals + assists) +
    w("shots") * Math.round(totalShots(p)) +
    w("hits") * p.hits +
    w("blocks") * p.blocks +
    w("pim") * p.pim
  );
}

function neutralLine(p: RankedSkaterStats) {
  const goals = p.goals;
  const points = p.goals + p.assists;

  // Own shooting: same shots, baseline S%.
  const shots = totalShots(p);
  const resetShPct = shots >= MIN_SHOTS_FOR_SH_PCT && p.baselineShootingPct > 0;
  const neutralGoals = resetShPct ? (shots * p.baselineShootingPct) / 100 : goals;
  const goalsFromShPct = resetShPct ? neutralGoals - goals : null;

  // Team scoring with the player on the ice: points = on-ice goals x IPP, and
  // on-ice goals = on-ice shots x oiS%. Reset oiS% first, then IPP. Falls
  // back to backing GF/SF out of points/IPP/oiS% for stats cached before
  // onIceGoalsFor/onIceShotsFor existed.
  const gf = p.onIceGoalsFor ?? (p.ipp > 0 ? (points * 100) / p.ipp : undefined);
  const sf = p.onIceShotsFor ?? (gf !== undefined && p.onIceShPct > 0 ? (gf * 100) / p.onIceShPct : undefined);
  const resetOnIce =
    p.gamesPlayed >= MIN_GP_FOR_ON_ICE &&
    p.baselineOnIceShPct > 0 &&
    p.baselineIpp > 0 &&
    gf !== undefined &&
    sf !== undefined &&
    sf > 0;

  if (!resetOnIce) {
    // Only the player's own shooting moves - extra goals are extra points.
    return {
      neutralGoals,
      neutralAssists: p.assists,
      goalsFromShPct,
      pointsFromOnIceShPct: null,
      pointsFromIpp: null,
    };
  }

  const neutralGf = (sf * p.baselineOnIceShPct) / 100;
  // With no on-ice goals yet, IPP is undefined - all of the change is
  // "on-ice luck", then IPP takes it to baseline.
  const pointsAfterOnIce = gf > 0 ? (points * neutralGf) / gf : 0;
  const neutralPoints = (neutralGf * p.baselineIpp) / 100;
  return {
    neutralGoals,
    // The player's own goals are part of their on-ice points, so assists are whatever
    // the reset points leave after the reset goals.
    neutralAssists: Math.max(0, neutralPoints - neutralGoals),
    goalsFromShPct,
    pointsFromOnIceShPct: pointsAfterOnIce - points,
    pointsFromIpp: neutralPoints - pointsAfterOnIce,
  };
}

function ranksByPerGame(values: number[], gamesPlayed: number[]): number[] {
  const order = values.map((_, i) => i).sort((a, b) => values[b] / gamesPlayed[b] - values[a] / gamesPlayed[a]);
  const ranks = new Array<number>(values.length);
  order.forEach((idx, i) => (ranks[idx] = i + 1));
  return ranks;
}

/** Fraction of the window's most games played a skater needs to be ranked
 *  - per-game ranks for a 2-GP call-up are noise. */
const MIN_GP_SHARE = 0.4;

/** Luck-neutral rows for one F or D pool (already in C-Score order, as
 *  computeCompositeRankingsByGroup returns it). Everyone in the pool is
 *  reset at once, so the neutral rank is against everyone else's neutral
 *  line too, not against other players' lucky/unlucky actuals. */
export function computeLuckNeutral(
  pool: RankedSkaterStats[],
  weights: LeagueSkaterScoring["weights"]
): LuckNeutralRow[] {
  const maxGp = pool.reduce((max, p) => Math.max(max, p.gamesPlayed), 0);
  const minGp = Math.max(1, Math.ceil(maxGp * MIN_GP_SHARE));
  const eligible = pool.map((p, i) => ({ p, cScoreRank: i + 1 })).filter(({ p }) => p.gamesPlayed >= minGp);

  const lines = eligible.map(({ p }) => neutralLine(p));
  const actual = eligible.map(({ p }) => fantasyPoints(p, p.goals, p.assists, weights));
  const neutral = eligible.map(({ p }, i) => fantasyPoints(p, lines[i].neutralGoals, lines[i].neutralAssists, weights));
  const gp = eligible.map(({ p }) => p.gamesPlayed);
  const ranks = ranksByPerGame(actual, gp);
  const neutralRanks = ranksByPerGame(neutral, gp);

  return eligible.map(({ p, cScoreRank }, i) => ({
    player: p,
    ...lines[i],
    fantasyPoints: actual[i],
    neutralFantasyPoints: neutral[i],
    rank: ranks[i],
    neutralRank: neutralRanks[i],
    cScoreRank,
  }));
}
