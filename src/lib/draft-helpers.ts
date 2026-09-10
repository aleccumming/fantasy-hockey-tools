import type { DraftPick, Position, RosterSettings } from "./types";
import type { RankedPlayer } from "./scoring";

export function getDraftedPlayerIds(picks: DraftPick[]): Set<string> {
  const ids = new Set<string>();
  for (const pick of picks) {
    if (pick.playerId) ids.add(pick.playerId);
  }
  return ids;
}

export function getCurrentPick(picks: DraftPick[]): DraftPick | undefined {
  return picks.find((p) => p.playerId === null);
}

export function getPicksForTeam(picks: DraftPick[], teamIndex: number): DraftPick[] {
  return picks.filter((p) => p.teamIndex === teamIndex);
}

export interface RosterSlotAssignment {
  slot: string;
  position: Position | "UTIL" | "BENCH";
  player: RankedPlayer | null;
}

const SLOT_ORDER: (Position | "UTIL" | "BENCH")[] = [
  "C",
  "LW",
  "RW",
  "D",
  "G",
  "UTIL",
  "BENCH",
];

/** Greedily slots a team's drafted players (in draft order) into roster slots. */
export function assignRoster(
  draftedPlayers: RankedPlayer[],
  rosterSettings: RosterSettings
): RosterSlotAssignment[] {
  const slots: RosterSlotAssignment[] = [];
  for (const pos of SLOT_ORDER) {
    const count = rosterSettings.slots[pos] ?? 0;
    for (let i = 0; i < count; i++) {
      slots.push({ slot: `${pos}${count > 1 ? i + 1 : ""}`, position: pos, player: null });
    }
  }

  const remaining = [...draftedPlayers];

  for (const slot of slots) {
    if (slot.position === "UTIL" || slot.position === "BENCH") continue;
    const idx = remaining.findIndex((p) => p.positions.includes(slot.position as Position));
    if (idx !== -1) {
      slot.player = remaining[idx];
      remaining.splice(idx, 1);
    }
  }

  for (const slot of slots) {
    if (slot.position !== "UTIL") continue;
    const idx = remaining.findIndex((p) => !p.positions.includes("G"));
    if (idx !== -1) {
      slot.player = remaining[idx];
      remaining.splice(idx, 1);
    }
  }

  for (const slot of slots) {
    if (slot.position !== "BENCH") continue;
    if (remaining.length === 0) break;
    slot.player = remaining.shift() ?? null;
  }

  return slots;
}
