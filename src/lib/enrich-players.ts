import type { Player, Position } from "./types";
import { applyYahooPositions, yahooPositionsAvailable } from "./yahoo-positions-data";
import { applyAdp, adpAvailable } from "./adp-data";
import { mergePlayerUniverse } from "./player-universe-merge";

export interface EnrichResult {
  players: Player[];
  notes: string[];
}

/** Puts players with no rank (i.e. added by mergePlayerUniverse, not the
 *  uploaded CSV) in ADP order among themselves - missing ADP last, name as
 *  a final tiebreak. Ranked players keep their existing relative order
 *  (their distinct rank values already fully determine sort order in
 *  rankPlayers(), regardless of array position). */
function orderUnrankedByAdp(players: Player[]): Player[] {
  const ranked = players.filter((p) => p.rank !== undefined);
  const unranked = players.filter((p) => p.rank === undefined);
  unranked.sort((a, b) => {
    if (a.adp === undefined && b.adp === undefined) return a.name.localeCompare(b.name);
    if (a.adp === undefined) return 1;
    if (b.adp === undefined) return -1;
    return a.adp - b.adp;
  });
  return [...ranked, ...unranked];
}

/**
 * The full pipeline every source of a player list should go through, so
 * behavior stays consistent no matter how the list arrived (a fresh CSV
 * upload, or the one-time old-localStorage-draft import):
 *  1. Fix positions for anyone matched in the bundled Yahoo dataset.
 *  2. Add anyone missing entirely (mostly goalies) from the live NHL roster,
 *     and backfill team for anyone already in the list who's missing it.
 *  3. Fill in ADP from the bundled dataset.
 *  4. Order the newly-added, unranked players by ADP.
 */
export function enrichPlayers(
  initialPlayers: Player[],
  playerUniverse: { name: string; team: string; positions: Position[] }[]
): EnrichResult {
  let players = initialPlayers;
  const notes: string[] = [];

  if (yahooPositionsAvailable() > 0) {
    const result = applyYahooPositions(players);
    players = result.players;
    notes.push(
      `${result.matchedCount} of ${players.length} players matched to Yahoo's stored positions`
    );
  }

  if (playerUniverse.length > 0) {
    const result = mergePlayerUniverse(players, playerUniverse);
    players = result.players;
    if (result.addedCount > 0) {
      notes.push(
        `${result.addedCount} more players (mostly goalies) added from the live NHL roster so they can be drafted too`
      );
    }
    if (result.teamBackfillCount > 0) {
      notes.push(`${result.teamBackfillCount} players filled in with their NHL team`);
    }
  }

  if (adpAvailable() > 0) {
    const result = applyAdp(players);
    players = result.players;
    notes.push(`${result.matchedCount} players filled in with stored ADP`);
  }

  players = orderUnrankedByAdp(players);

  return { players, notes };
}
