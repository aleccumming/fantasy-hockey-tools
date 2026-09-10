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
 */
export function mergePlayerUniverse(
  players: Player[],
  universe: { name: string; team: string; positions: Position[] }[]
): { players: Player[]; addedCount: number } {
  const existing = new Set(players.map((p) => normalizeName(p.name)));

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

  return { players: [...players, ...additions], addedCount: additions.length };
}
