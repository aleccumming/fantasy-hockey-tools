import type { RankingSource } from "./types";
import type { RankedPlayer } from "./scoring";
import { normalizeName } from "./name-matching";

export interface EnrichedPlayer extends RankedPlayer {
  /** sourceId -> that source's rank for this player, only present when matched. */
  sourceRanks: Record<string, number>;
  /** Average of this player's own rank plus every matched source's rank. */
  avgRank: number;
}

/**
 * Cross-references each player against every added ranking source (by
 * name) and computes an average rank across the player's own rank plus
 * whichever sources matched them.
 */
export function applyRankingSources(
  players: RankedPlayer[],
  sources: RankingSource[]
): EnrichedPlayer[] {
  const indexes = sources.map((source) => ({
    id: source.id,
    index: new Map(source.entries.map((e) => [normalizeName(e.name), e.rank])),
  }));

  return players.map((p) => {
    const normalized = normalizeName(p.name);
    const sourceRanks: Record<string, number> = {};
    let sum = p.rank;
    let count = 1;

    for (const { id, index } of indexes) {
      const rank = index.get(normalized);
      if (rank !== undefined) {
        sourceRanks[id] = rank;
        sum += rank;
        count += 1;
      }
    }

    return { ...p, sourceRanks, avgRank: sum / count };
  });
}
