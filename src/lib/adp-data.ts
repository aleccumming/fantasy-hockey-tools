import rawAdp from "@/data/adp.json";
import type { Player } from "./types";
import { normalizeName } from "./name-matching";

const ADP = rawAdp as Record<string, number>;

const NORMALIZED_INDEX = new Map(Object.entries(ADP).map(([name, adp]) => [normalizeName(name), adp]));

/** How many players are in the bundled ADP dataset - 0 until
 *  `npm run build:adp` has been run at least once (see README). */
export function adpAvailable(): number {
  return Object.keys(ADP).length;
}

function lookup(name: string): number | undefined {
  return NORMALIZED_INDEX.get(normalizeName(name));
}

/**
 * Fills in ADP for each player from the bundled dataset where a name match
 * exists. Only overrides players missing an ADP (e.g. from a projections
 * CSV with no ADP column) - if the imported CSV already supplied its own
 * ADP, that's left alone.
 */
export function applyAdp(players: Player[]): { players: Player[]; matchedCount: number } {
  let matchedCount = 0;
  const updated = players.map((p) => {
    if (p.adp !== undefined) return p;
    const adp = lookup(p.name);
    if (adp === undefined) return p;
    matchedCount++;
    return { ...p, adp };
  });
  return { players: updated, matchedCount };
}
