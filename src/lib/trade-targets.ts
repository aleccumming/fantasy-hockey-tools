// Trade Targets: buy-low candidates (strong underlying process, results
// held down by bad luck) and, for a chosen target, which of your own
// players fit what the other team's roster needs positionally.
import type { RankedSkaterStats } from "./streamer-stats";
import {
  computePositionalDepth,
  type RosterFitPlayer,
  type RosterPosition,
  type RosterSlotConfig,
} from "./roster-fit";
import type { SkaterPosition } from "./types";

// Below these samples a luck metric is noise, not luck: one scoreless game
// reads as 0% S%, 0% oiS% and 0% IPP (IPP isn't even defined with no
// on-ice goals) - which would rank every one-game player as the coldest in
// the league. On-ice goals aren't in the data, so games stand in for them.
export const MIN_SHOTS_FOR_SH_PCT = 20;
export const MIN_GP_FOR_ON_ICE = 10;

const LUCK_PAIRS = [
  ["shootingPct", "baselineShootingPct"],
  ["onIceShPct", "baselineOnIceShPct"],
  ["ipp", "baselineIpp"],
] as const;

function hasSample(p: RankedSkaterStats, key: (typeof LUCK_PAIRS)[number][0]): boolean {
  if (key === "shootingPct") {
    const shots = (p.shotsPer60 * p.toiPerGame * p.gamesPlayed) / 60;
    return shots >= MIN_SHOTS_FOR_SH_PCT;
  }
  return p.gamesPlayed >= MIN_GP_FOR_ON_ICE;
}

/** Average of S%, oiS% and IPP each relative to the player's own career
 *  baseline - e.g. -0.3 means running 30% below normal. Relative, not raw
 *  percentage points, because the three live on very different scales
 *  (IPP sits around 60-70%, S% around 10%), so a raw average would be
 *  almost all IPP. Negative = running cold. Only metrics with a real
 *  sample (and a baseline) count; null when none do. */
export function luckIndex(p: RankedSkaterStats): number | null {
  let sum = 0;
  let counted = 0;
  for (const [key, baselineKey] of LUCK_PAIRS) {
    const baseline = p[baselineKey];
    if (baseline <= 0 || !hasSample(p, key)) continue;
    sum += (p[key] - baseline) / baseline;
    counted++;
  }
  return counted > 0 ? sum / counted : null;
}

export interface BuyLowCandidate extends RankedSkaterStats {
  luckIndex: number;
  /** Position in the C-Score order (1 = best process) within the pool. */
  processRank: number;
  /** Position in the luck order (1 = coldest) within the same pool. */
  coldRank: number;
  /** Average of processRank and coldRank - lower is better. Same "average
   *  the ranks" approach as C-Score itself, so neither side needs a
   *  hand-picked weight. */
  buyLowScore: number;
}

/** Takes one group's (forwards or D) C-Score-ranked pool and returns only
 *  players currently running cold, best buy-low first. Ranks are computed
 *  against the whole pool before filtering, like C-Score's metric ranks, so
 *  they don't shift as ownership/TOI filters change. Players with no luck
 *  signal yet (too small a sample) are left out of the cold ranking. */
export function computeBuyLowCandidates(ranked: RankedSkaterStats[]): BuyLowCandidate[] {
  const withLuck = ranked
    .map((p, i) => ({ p, processRank: i + 1, luck: luckIndex(p) }))
    .filter((entry): entry is { p: RankedSkaterStats; processRank: number; luck: number } => entry.luck !== null);
  const coldRanks = new Map(
    [...withLuck].sort((a, b) => a.luck - b.luck).map((entry, i) => [entry.p, i + 1])
  );
  return withLuck
    .filter((entry) => entry.luck < 0)
    .map(({ p, processRank, luck }) => {
      const coldRank = coldRanks.get(p)!;
      return { ...p, luckIndex: luck, processRank, coldRank, buyLowScore: (processRank + coldRank) / 2 };
    })
    .sort((a, b) => a.buyLowScore - b.buyLowScore);
}

export type Fit = "fills-hole" | "adds-depth" | "none";

export interface TeamNeeds {
  unfilled: RosterPosition[];
  /** Positions with starting slots but no real backup (already-unfilled
   *  positions aren't repeated here). */
  thin: SkaterPosition[];
}

export function computeTeamNeeds(roster: RosterFitPlayer[], slots: RosterSlotConfig): TeamNeeds {
  const depth = computePositionalDepth(roster, slots);
  const thin = (["C", "LW", "RW", "D"] as SkaterPosition[]).filter(
    (pos) => slots[pos] > 0 && depth.backups[pos] === 0 && !depth.unfilled.includes(pos)
  );
  return { unfilled: depth.unfilled, thin };
}

/** Would adding `candidate` to this roster fill one of its empty starting
 *  slots, or back up a position with no depth? `needs` is
 *  computeTeamNeeds(roster) - passed in so it's computed once per roster,
 *  not once per candidate. */
export function fitIfAdded(
  roster: RosterFitPlayer[],
  needs: TeamNeeds,
  candidate: RosterFitPlayer,
  slots: RosterSlotConfig
): { fit: Fit; positions: RosterPosition[] } {
  if (computePositionalDepth([...roster, candidate], slots).unfilled.length < needs.unfilled.length) {
    const positions = needs.unfilled.filter((pos) => pos === "UTIL" || candidate.positions.includes(pos));
    return { fit: "fills-hole", positions: [...new Set(positions)] };
  }
  const positions = needs.thin.filter((pos) => candidate.positions.includes(pos));
  return positions.length > 0 ? { fit: "adds-depth", positions } : { fit: "none", positions: [] };
}

export interface TradeSideImpact {
  before: TeamNeeds;
  after: TeamNeeds;
  /** The roster after the trade - the lineup-eligible players only. */
  rosterAfter: RosterFitPlayer[];
}

/** One team's lineup before and after a trade of any size. `roster`,
 *  `outgoing` and `incoming` should already be lineup-eligible skaters
 *  only (no goalies, no IR); outgoing players are matched by identity. */
export function evaluateTradeSide(
  roster: RosterFitPlayer[],
  outgoing: RosterFitPlayer[],
  incoming: RosterFitPlayer[],
  slots: RosterSlotConfig
): TradeSideImpact {
  const leaving = new Set(outgoing);
  const rosterAfter = [...roster.filter((p) => !leaving.has(p)), ...incoming];
  return {
    before: computeTeamNeeds(roster, slots),
    after: computeTeamNeeds(rosterAfter, slots),
    rosterAfter,
  };
}
