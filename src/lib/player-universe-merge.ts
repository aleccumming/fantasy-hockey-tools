import { v4 as uuidv4 } from "uuid";
import type { Player, Position } from "./types";
import { normalizeName } from "./name-matching";

/**
 * Adds anyone from the live NHL player universe who isn't already in the
 * uploaded ranking list - typically goalies, since most ranking exports are
 * skater-only. Without this, those players can never be drafted (by
 * anyone, including opponents in the simulation), which breaks a real
 * draft. Added players get no rank/adp, so they naturally sort after every
 * ranked player (see rankPlayers() in scoring.ts).
 *
 * Also backfills `team` on players already in the list whose CSV didn't
 * include a team column (or left it blank) - never overrides a team the
 * CSV actually provided.
 */
export function mergePlayerUniverse(
  players: Player[],
  universe: { name: string; team: string; positions: Position[] }[]
): { players: Player[]; addedCount: number; teamBackfillCount: number } {
  const universeByName = new Map(universe.map((u) => [normalizeName(u.name), u]));
  const existing = new Set(players.map((p) => normalizeName(p.name)));

  let teamBackfillCount = 0;
  const withTeams = players.map((p) => {
    if (p.team !== "") return p;
    const u = universeByName.get(normalizeName(p.name));
    if (!u || !u.team) return p;
    teamBackfillCount++;
    return { ...p, team: u.team };
  });

  const additions: Player[] = [];
  for (const u of universe) {
    const key = normalizeName(u.name);
    if (existing.has(key) || u.positions.length === 0) continue;
    existing.add(key);
    additions.push({
      id: uuidv4(),
      name: u.name,
      team: u.team,
      positions: u.positions,
      stats: {},
    });
  }
  additions.sort((a, b) => a.name.localeCompare(b.name));

  return {
    players: [...withTeams, ...additions],
    addedCount: additions.length,
    teamBackfillCount,
  };
}
