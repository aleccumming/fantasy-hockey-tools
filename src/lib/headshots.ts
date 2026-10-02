// Server-only helper for looking up NHL headshot images by player name.
// Derived from the shared roster fetch in nhl-roster.ts.
//
// Keyed by more than just name: a handful of real NHL players share an
// exact full name with someone else currently active (confirmed live -
// there are two real "Sebastian Aho"s, Carolina's forward and a Penguins
// defenseman, and two real "Elias Pettersson"s, BOTH on Vancouver - one a
// forward, one a defenseman, so even team alone doesn't always
// disambiguate). A plain name-keyed map silently has one overwrite the
// other, so whichever lookup wins shows the wrong player's photo with no
// visible sign anything's wrong - exactly what a user reported seeing.
// Every player gets three keys, most specific first: name+team+position-
// group (resolves every known collision), name+team (first-wins, correct
// whenever a collision is cross-team), and plain name (first-wins, the
// legacy fallback for a caller that can't supply team/position). See
// player-headshot.tsx for how a lookup picks the best available key.
import { getNhlRosterPlayers } from "./nhl-roster";
import { normalizeName } from "./name-matching";

/** key -> headshot image URL. See file header for the key formats. */
export type HeadshotMap = Record<string, string>;

/** Coarse group, not the exact position list - robust to minor formatting
 *  differences between data sources (e.g. "C/LW" vs "LW/C"), and it's
 *  exactly the axis both known real collisions split on (forward vs.
 *  defenseman), not the specific position within that axis. Takes plain
 *  string[] rather than the stricter Position[] since callers carry a few
 *  different but compatible position-list shapes across the app. */
export function headshotPositionGroup(positions: string[] | undefined): string {
  if (!positions || positions.length === 0) return "";
  if (positions.includes("G")) return "G";
  if (positions.includes("D")) return "D";
  return "F";
}

export async function getHeadshotMap(forceRefresh = false): Promise<HeadshotMap> {
  const players = await getNhlRosterPlayers(forceRefresh);
  const map: HeadshotMap = {};
  for (const p of players) {
    const name = normalizeName(p.name);
    const group = headshotPositionGroup(p.positions);
    if (group) map[`${name}|${p.team}|${group}`] = p.headshot;
    if (!(`${name}|${p.team}` in map)) map[`${name}|${p.team}`] = p.headshot;
    if (!(name in map)) map[name] = p.headshot;
  }
  return map;
}
