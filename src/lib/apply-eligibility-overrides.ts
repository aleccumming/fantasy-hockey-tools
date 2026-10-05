// NST (this app's stat source) only ever reports one primary position per
// player - it has no concept of fantasy multi-position eligibility. Yahoo's
// game-wide player list does (confirmed live: e.g. Mitch Marner shows
// eligible at C/LW/RW), so when it's available this overrides team+
// positions on any NST-sourced stat shape that has them - a player whose
// real Yahoo eligibility includes a position NST doesn't report would
// otherwise land in the wrong group entirely (e.g. forwards/defense split),
// not just show the wrong label. Shared across every tool that ranks NST
// data by name (Rankings/Compare, Deployment) rather than duplicated per
// tool.
//
// Looks each item up by its OWN team+position first (via
// lookupPlayerIdentity), not name alone - real NHL namesakes exist
// (confirmed live: two Sebastian Ahos, two Elias Petterssons, the latter
// pair even on the same team), and a name-only lookup would hand BOTH of
// them the exact same override, forcing two real, different players to
// identical team+position - caught live exactly this way (both
// Petterssons collapsed to the same identity downstream in
// deployment-board.tsx, corrupting its player-list rendering).
import { lookupPlayerIdentity } from "./player-identity-key";
import type { Position } from "./types";
import type { YahooPlayerEligibility } from "./yahoo-fantasy-client";

export function applyEligibilityOverrides<T extends { name: string; team: string; positions: Position[] }>(
  items: T[],
  eligibilityByName: Map<string, YahooPlayerEligibility> | null
): T[] {
  if (!eligibilityByName) return items;
  return items.map((item) => {
    const override = lookupPlayerIdentity(eligibilityByName, item.name, item.team, item.positions);
    if (!override || override.isGoalie || override.positions.length === 0) return item;
    return { ...item, team: override.team, positions: override.positions };
  });
}
