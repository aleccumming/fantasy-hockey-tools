import rawYahooPositions from "@/data/yahoo-positions.json";
import type { Player, Position } from "./types";
import { normalizeName } from "./name-matching";

interface YahooPositionEntry {
  team: string;
  positions: Position[];
}

const YAHOO_POSITIONS = rawYahooPositions as Record<string, YahooPositionEntry>;

const NORMALIZED_INDEX = new Map(
  Object.entries(YAHOO_POSITIONS).map(([name, entry]) => [normalizeName(name), entry])
);

/** How many players are in the bundled Yahoo positions dataset - 0 until
 *  `npm run build:yahoo-positions` has been run at least once (see README). */
export function yahooPositionsAvailable(): number {
  return Object.keys(YAHOO_POSITIONS).length;
}

function lookup(name: string): YahooPositionEntry | undefined {
  return NORMALIZED_INDEX.get(normalizeName(name));
}

/**
 * Overrides each player's positions with the bundled Yahoo dataset where a
 * name match exists. Players with no match (including everyone, if the
 * dataset hasn't been generated yet) are left exactly as imported.
 */
export function applyYahooPositions(players: Player[]): {
  players: Player[];
  matchedCount: number;
} {
  let matchedCount = 0;
  const updated = players.map((p) => {
    const entry = lookup(p.name);
    if (!entry || entry.positions.length === 0) return p;
    matchedCount++;
    return { ...p, positions: entry.positions };
  });
  return { players: updated, matchedCount };
}
