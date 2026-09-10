import type {
  DraftSettings,
  Player,
  Position,
  StatDefinition,
} from "./types";

export function isGoalie(player: Player): boolean {
  return player.positions.includes("G");
}

export function calculateFantasyPoints(
  player: Player,
  scoring: StatDefinition[]
): number {
  const relevant = isGoalie(player)
    ? scoring.filter((s) => s.appliesTo === "goalie" || s.appliesTo === "both")
    : scoring.filter((s) => s.appliesTo === "skater" || s.appliesTo === "both");

  return relevant.reduce((total, stat) => {
    const value = player.stats[stat.key];
    if (typeof value !== "number" || Number.isNaN(value)) return total;
    return total + value * stat.pointValue;
  }, 0);
}

export interface RankedPlayer extends Player {
  fantasyPoints: number;
  rank: number;
  positionRank: Record<string, number>;
  tier: number;
  vor: number;
  /** Generic "higher is better" score used for suggestions: VOR when
   *  projections are available, otherwise derived from the uploaded rank. */
  value: number;
}

/** True once at least one player has a real (non-zero) stat value. Until
 *  then there's nothing to compute fantasy points/VOR from, so ranking
 *  falls back to the uploaded rank / CSV row order instead. */
export function hasProjectionData(players: Player[]): boolean {
  return players.some((p) =>
    Object.values(p.stats).some((v) => typeof v === "number" && v > 0)
  );
}

/**
 * Replacement-level baseline per position, derived from full player pool
 * (roster slot counts x number of teams = the "starter" cutoff for that
 * position). Used for Value Over Replacement (VOR) so suggestions account
 * for positional scarcity, not just raw projected points.
 */
export function computeReplacementLevels(
  players: RankedPlayer[],
  settings: DraftSettings
): Record<Position, number> {
  const levels: Partial<Record<Position, number>> = {};
  const { teamCount, rosterSettings } = settings;
  const flexPositions: Position[] = ["C", "LW", "RW", "D"];
  const utilSlots = rosterSettings.slots.UTIL ?? 0;

  for (const pos of ["C", "LW", "RW", "D", "G"] as Position[]) {
    const dedicated = rosterSettings.slots[pos] ?? 0;
    // Rough UTIL allocation: split proportionally across skater positions.
    const utilShare =
      pos === "G" ? 0 : utilSlots / flexPositions.length;
    const startersNeeded = Math.round((dedicated + utilShare) * teamCount);
    const pool = players
      .filter((p) => p.positions.includes(pos))
      .sort((a, b) => b.fantasyPoints - a.fantasyPoints);
    const cutoffIndex = Math.max(0, Math.min(pool.length - 1, startersNeeded - 1));
    levels[pos] = pool.length > 0 ? pool[cutoffIndex]?.fantasyPoints ?? 0 : 0;
  }

  return levels as Record<Position, number>;
}

/**
 * Assigns tiers within a group of players (already sorted desc by points)
 * by detecting drop-offs that are meaningfully larger than the typical gap.
 */
function assignTiers(sortedByPoints: RankedPlayer[]): void {
  if (sortedByPoints.length === 0) return;
  const gaps: number[] = [];
  for (let i = 1; i < sortedByPoints.length; i++) {
    gaps.push(sortedByPoints[i - 1].fantasyPoints - sortedByPoints[i].fantasyPoints);
  }
  const meanGap = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const variance =
    gaps.reduce((a, b) => a + (b - meanGap) ** 2, 0) / (gaps.length || 1);
  const stdDev = Math.sqrt(variance);
  const threshold = meanGap + stdDev * 1.25;

  let tier = 1;
  sortedByPoints[0].tier = tier;
  for (let i = 1; i < sortedByPoints.length; i++) {
    const gap = sortedByPoints[i - 1].fantasyPoints - sortedByPoints[i].fantasyPoints;
    if (gap > threshold && gap > 0.5) {
      tier += 1;
    }
    sortedByPoints[i].tier = tier;
  }
}

export function rankPlayers(
  players: Player[],
  scoring: StatDefinition[],
  settings: DraftSettings
): RankedPlayer[] {
  const useProjections = hasProjectionData(players);

  const withPoints: RankedPlayer[] = players.map((p) => ({
    ...p,
    fantasyPoints: calculateFantasyPoints(p, scoring),
    rank: p.rank ?? Number.MAX_SAFE_INTEGER,
    positionRank: {},
    tier: 1,
    vor: 0,
    value: 0,
  }));

  withPoints.sort((a, b) =>
    useProjections ? b.fantasyPoints - a.fantasyPoints : a.rank - b.rank
  );
  withPoints.forEach((p, i) => {
    p.rank = i + 1;
  });

  if (useProjections) {
    assignTiers(withPoints);

    const replacementLevels = computeReplacementLevels(withPoints, settings);
    for (const p of withPoints) {
      const bestPositionLevel = Math.min(
        ...p.positions.map((pos) => replacementLevels[pos] ?? 0)
      );
      p.vor = p.fantasyPoints - bestPositionLevel;
      p.value = p.vor;
    }
  } else {
    for (const p of withPoints) {
      p.value = -p.rank;
    }
  }

  // withPoints is already in overall-rank order, so filtering preserves it.
  for (const pos of ["C", "LW", "RW", "D", "G"] as Position[]) {
    const posPlayers = withPoints.filter((p) => p.positions.includes(pos));
    posPlayers.forEach((p, i) => {
      p.positionRank[pos] = i + 1;
    });
  }

  return withPoints;
}
