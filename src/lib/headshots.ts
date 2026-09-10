// Server-only helper for looking up NHL headshot images by player name.
// Derived from the shared roster fetch in nhl-roster.ts.

import { getNhlRosterPlayers } from "./nhl-roster";
import { normalizeName } from "./name-matching";

/** normalizedName -> headshot image URL */
export type HeadshotMap = Record<string, string>;

export async function getHeadshotMap(forceRefresh = false): Promise<HeadshotMap> {
  const players = await getNhlRosterPlayers(forceRefresh);
  const map: HeadshotMap = {};
  for (const p of players) {
    map[normalizeName(p.name)] = p.headshot;
  }
  return map;
}
