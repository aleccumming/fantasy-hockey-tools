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

export type TheirFit = "fills-hole" | "adds-depth" | "none";

export interface OfferFit {
  theirFit: TheirFit;
  /** The positions of theirs this offer covers (the hole or the thin spots). */
  coveredPositions: RosterPosition[];
  /** True when sending this player and receiving the target leaves you
   *  with more unfilled starting slots than you have today. */
  costsYouAStarter: boolean;
  yourUnfilledAfter: RosterPosition[];
}

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

/** One 1-for-1 offer: you send `offer`, they send `target`. Both rosters
 *  are passed in WITHOUT the player leaving them; `theirNeeds` is
 *  computeTeamNeeds of theirs-without-target (computed once per target,
 *  not per offer). */
export function evaluateOffer({
  theirWithoutTarget,
  theirNeeds,
  myWithoutOffer,
  offer,
  target,
  slots,
}: {
  theirWithoutTarget: RosterFitPlayer[];
  theirNeeds: TeamNeeds;
  myWithoutOffer: RosterFitPlayer[];
  offer: RosterFitPlayer;
  target: RosterFitPlayer;
  slots: RosterSlotConfig;
}): OfferFit {
  const theirAfter = computePositionalDepth([...theirWithoutTarget, offer], slots);
  let theirFit: TheirFit = "none";
  let coveredPositions: RosterPosition[] = [];
  if (theirAfter.unfilled.length < theirNeeds.unfilled.length) {
    theirFit = "fills-hole";
    coveredPositions = theirNeeds.unfilled.filter(
      (pos) => pos === "UTIL" || offer.positions.includes(pos)
    );
  } else {
    coveredPositions = theirNeeds.thin.filter((pos) => offer.positions.includes(pos));
    if (coveredPositions.length > 0) theirFit = "adds-depth";
  }

  const myBefore = computePositionalDepth([...myWithoutOffer, offer], slots);
  const myAfter = computePositionalDepth([...myWithoutOffer, target], slots);
  return {
    theirFit,
    coveredPositions: [...new Set(coveredPositions)],
    costsYouAStarter: myAfter.unfilled.length > myBefore.unfilled.length,
    yourUnfilledAfter: myAfter.unfilled,
  };
}
