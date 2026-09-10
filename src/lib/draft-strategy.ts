import type { DraftPick, DraftSettings, Position } from "./types";
import type { RankedPlayer } from "./scoring";
import { getPicksForTeam, assignRoster } from "./draft-helpers";

const DEDICATED_POSITIONS: Position[] = ["C", "LW", "RW", "D", "G"];

export interface SmartSuggestion {
  player: RankedPlayer;
  fillsNeed: boolean;
  /** Short, human-readable explanations for why this player is recommended
   *  now, e.g. "D thins out fast after this - grab now or lose the value" -
   *  the scoring below is a set of heuristics, not a guarantee, so showing
   *  the reasoning lets the user weigh it themselves rather than trusting a
   *  black-box rank. */
  reasons: string[];
}

/** Which dedicated roster slots (UTIL/BENCH excluded) I still have open -
 *  used for the "fills a need on my own team" boost. */
function myOpenPositions(
  picks: DraftPick[],
  byId: Map<string, RankedPlayer>,
  myTeamIndex: number,
  settings: DraftSettings
): Set<Position> {
  const drafted = getPicksForTeam(picks, myTeamIndex)
    .filter((p) => p.playerId)
    .map((p) => byId.get(p.playerId as string))
    .filter((p): p is RankedPlayer => Boolean(p));
  const slots = assignRoster(drafted, settings.rosterSettings);
  const open = new Set<Position>();
  for (const slot of slots) {
    if (slot.player || slot.position === "UTIL" || slot.position === "BENCH") continue;
    open.add(slot.position as Position);
  }
  return open;
}

/** How many picks happen between right now and the next time I'm on the
 *  clock - i.e. how many chances other teams get to draft before I do.
 *  Skips the current pick itself, since that's the decision being made now. */
function picksUntilMyNextTurn(picks: DraftPick[], fromIndex: number, myTeamIndex: number): number {
  for (let i = fromIndex + 1; i < picks.length; i++) {
    if (picks[i].teamIndex === myTeamIndex) return i - fromIndex - 1;
  }
  return picks.length - fromIndex - 1;
}

/**
 * Ranks available players using three blended signals, on top of the base
 * `value` (VOR, or -rank when there are no projections):
 *
 * 1. Fills a currently-open dedicated slot on MY roster (the original
 *    heuristic - kept as-is).
 * 2. Positional depth ("VONA" - value over next available): uses real ADP
 *    to estimate how many players at each position will likely be drafted
 *    league-wide before my next turn, then compares each player's value
 *    against whoever would likely *still* be available at their position
 *    by then. A big gap means the position is thin and drops off fast right
 *    after this player; a small/negative gap means it's deep and there'll
 *    be similar value later - better to spend this pick elsewhere.
 * 3. ADP urgency: a player already past their average draft position (still
 *    on the board despite the market expecting them gone) or approaching it
 *    before my next turn is flagged as a real reach risk.
 */
export function getSmartSuggestions(
  available: RankedPlayer[],
  picks: DraftPick[],
  byId: Map<string, RankedPlayer>,
  settings: DraftSettings,
  count = 15
): SmartSuggestion[] {
  if (available.length === 0) return [];

  const currentIndex = picks.findIndex((p) => p.playerId === null);
  const currentPick = currentIndex === -1 ? null : picks[currentIndex];

  const sortedByValue = [...available].sort((a, b) => b.value - a.value);
  const gaps = sortedByValue
    .slice(1)
    .map((p, i) => sortedByValue[i].value - p.value)
    .filter((g) => g > 0);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const needBoost = avgGap * 3;

  const openPositions = myOpenPositions(picks, byId, settings.myTeamIndex, settings);

  // How many picks stand between now and my next turn - the window ADP is
  // measured against below, both for positional depth and for ADP urgency.
  const windowSize = currentPick ? picksUntilMyNextTurn(picks, currentIndex, settings.myTeamIndex) : 0;

  const availableByPos: Partial<Record<Position, RankedPlayer[]>> = {};
  for (const pos of DEDICATED_POSITIONS) {
    availableByPos[pos] = available
      .filter((p) => p.positions.includes(pos))
      .sort((a, b) => b.value - a.value);
  }

  // How many players at each position real ADP data expects to be gone by
  // the time my next turn comes around.
  const windowEndPick = currentPick ? currentPick.pickNumber + windowSize : Infinity;
  const expectedDrafted: Partial<Record<Position, number>> = {};
  for (const pos of DEDICATED_POSITIONS) {
    const pool = availableByPos[pos] ?? [];
    expectedDrafted[pos] = pool.filter((p) => p.adp !== undefined && p.adp <= windowEndPick).length;
  }

  // How many overall ranks worse the "still there" comparison player is -
  // this is the bar for whether a positional drop-off is worth mentioning
  // to a human at all, kept in plain rank units (not VOR/value units, which
  // don't mean anything intuitive on their own and, in rank-only mode where
  // value is just -rank, made basically any gap look "significant" against
  // a whole-draft average consecutive gap of ~1).
  const RANK_DROPOFF_THRESHOLD = 30;

  function vonaFor(pos: Position, player: RankedPlayer): { vona: number; stillThereRank: number | null } {
    const pool = availableByPos[pos];
    if (!pool || pool.length === 0) return { vona: 0, stillThereRank: null };
    const k = Math.min(expectedDrafted[pos] ?? 0, pool.length);
    if (k >= pool.length) {
      // Every available player at this position is expected gone by my
      // next turn - no one to compare against, so treat it as maximally
      // urgent rather than reporting a specific (nonexistent) rank.
      const worst = pool.at(-1);
      return { vona: worst ? player.value - worst.value : 0, stillThereRank: -1 };
    }
    const stillThere = pool[k];
    return { vona: player.value - stillThere.value, stillThereRank: stillThere.rank };
  }

  const scored = available.map((player) => {
    const fillsNeed = player.positions.some((pos) => openPositions.has(pos));

    let hottestPos: Position = player.positions[0];
    let positionalVona = -Infinity;
    let hottestStillThereRank: number | null = null;
    for (const pos of player.positions) {
      const { vona, stillThereRank } = vonaFor(pos, player);
      if (vona > positionalVona) {
        positionalVona = vona;
        hottestPos = pos;
        hottestStillThereRank = stillThereRank;
      }
    }
    if (positionalVona === -Infinity) positionalVona = 0;

    let adpUrgency = 0;
    if (currentPick && player.adp !== undefined) {
      const pickGap = player.adp - currentPick.pickNumber;
      if (pickGap <= 0) {
        adpUrgency = Math.min(1.5, 1 + -pickGap / 10);
      } else if (windowSize > 0) {
        adpUrgency = Math.max(0, 1 - pickGap / windowSize);
      }
    }

    const reasons: string[] = [];
    if (fillsNeed) reasons.push("Fills an open roster need");
    if (hottestStillThereRank === -1) {
      reasons.push(`Every available ${hottestPos} is expected gone before your next turn`);
    } else if (hottestStillThereRank !== null && hottestStillThereRank - player.rank > RANK_DROPOFF_THRESHOLD) {
      reasons.push(`Next available ${hottestPos} likely falls to around rank ${hottestStillThereRank}`);
    }
    if (adpUrgency > 0.4 && player.adp !== undefined) {
      reasons.push(
        player.adp <= currentPick!.pickNumber
          ? `Already past ADP (${player.adp.toFixed(1)}) - could go any pick`
          : `Approaching ADP (${player.adp.toFixed(1)}) before your next turn`
      );
    }

    const score =
      player.value +
      (fillsNeed ? needBoost : 0) +
      Math.max(positionalVona, 0) +
      adpUrgency * needBoost;

    return { player, fillsNeed, reasons, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ player, fillsNeed, reasons }) => ({ player, fillsNeed, reasons }));
}
