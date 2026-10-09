// Shared player-identity keying, for every place in this app that joins
// or looks up player data by name across sources (Yahoo eligibility, NST
// stat rows, roster rows, ...). Real NHL players can share an exact full
// name - confirmed live, there are currently two "Sebastian Aho"s
// (Carolina forward, a Pittsburgh defenseman) and two "Elias Pettersson"s
// (both on Vancouver - one forward, one defenseman, so even team alone
// doesn't always disambiguate). A plain name-keyed Map silently drops one
// of a collision pair at construction (Map keys must be unique), and
// whichever one "loses" ends up computing off the OTHER player's data
// everywhere that key is used - not just a display bug. Caught live in
// deployment-service.ts (both Petterssons showed an identical PP share to
// 13 decimal places) and in applyEligibilityOverrides (both Petterssons
// got forced to the SAME team+position, which is what broke this file's
// own earlier name+team+position React key fix - the override ran first
// and erased the very distinction that key relied on).
import { normalizeName } from "./name-matching";
import { headshotPositionGroup } from "./headshots";

/** The specific, collision-safe key - correct whenever the item's own
 *  team/position are known and haven't changed since the other side of
 *  the join was captured. */
export function playerIdentityKey(name: string, team: string, positions: string[] | undefined): string {
  return `${normalizeName(name)}|${team}|${headshotPositionGroup(positions)}`;
}

/** Builds a two-tier lookup map: the specific key above, plus a plain-
 *  name fallback (first-wins) for a caller that only has a name to look
 *  up with, or whose own team differs from this item's (e.g. a trade
 *  since this snapshot was taken) - see lookupPlayerIdentity. */
export function buildPlayerIdentityMap<T>(
  items: T[],
  getName: (item: T) => string,
  getTeam: (item: T) => string,
  getPositions: (item: T) => string[] | undefined
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const name = getName(item);
    map.set(playerIdentityKey(name, getTeam(item), getPositions(item)), item);
    const fallback = normalizeName(name);
    if (!map.has(fallback)) map.set(fallback, item);
  }
  return map;
}

/** Name + forward/defense group, deliberately without team - stable across
 *  snapshots taken at different times (stat windows spanning a trade), yet
 *  still splits both known collision pairs, which differ on F vs D. Used
 *  where one entry per real player is needed across several snapshots
 *  (pickers, Compare's per-window lookups). Would merge two same-named
 *  players in the same group on different teams - no such pair exists
 *  today. */
export function playerNameGroupKey(name: string, positions: string[] | undefined): string {
  return `${normalizeName(name)}|${headshotPositionGroup(positions)}`;
}

/** One entry per real player across several sources (first source wins),
 *  keyed by playerNameGroupKey - so a traded player collapses to one entry
 *  but a real collision pair stays two. */
export function dedupePlayersAcrossSources<T>(
  sources: T[][],
  getName: (item: T) => string,
  getPositions: (item: T) => string[] | undefined
): Map<string, T> {
  const map = new Map<string, T>();
  for (const source of sources) {
    for (const item of source) {
      const key = playerNameGroupKey(getName(item), getPositions(item));
      if (!map.has(key)) map.set(key, item);
    }
  }
  return map;
}

/** Tries the specific key first (resolves a collision correctly), falls
 *  back to plain name (resolves a trade correctly, at the cost of
 *  picking arbitrarily - first-wins - in the rare compound case of a
 *  trade AND a collision on the same name). */
export function lookupPlayerIdentity<T>(
  map: Map<string, T>,
  name: string,
  team: string,
  positions: string[] | undefined
): T | undefined {
  return map.get(playerIdentityKey(name, team, positions)) ?? map.get(normalizeName(name));
}
