// Figures out which specific days a free-agent candidate could actually be
// STARTED on your roster - not just "does their team play that day," but
// "does a fully valid lineup assignment exist that includes them," given
// your other rostered skaters' own games and real position eligibility.
// UTIL is universal - any skater (C/LW/RW/D) can fill it, not an
// explicit per-player flag - so it's handled as an implicit extra
// eligibility for everyone, not something listed in a player's positions.
//
// This is solved as a genuine maximum bipartite matching (players who are
// playing that day <-> individual lineup slots), via Kuhn's algorithm
// (repeated augmenting-path search) - not a greedy single-pass assignment.
// The difference matters: a greedy pass seats each player into the first
// slot it finds and never reconsiders, so it can report "no room" in a
// case where a full reshuffle of already-seated multi-eligible players
// would have made room. Kuhn's algorithm explores exactly those
// reassignments (an augmenting path can walk back through an already-
// matched slot and bump its occupant to a different slot), so it finds the
// TRUE maximum number of players who can be simultaneously started - the
// actual answer to "can we fit everyone in," not an approximation of it.
import type { Position, SkaterPosition } from "./types";

export type RosterPosition = SkaterPosition | "UTIL";

export interface RosterSlotConfig {
  C: number;
  LW: number;
  RW: number;
  D: number;
  UTIL: number;
}

function isEligible(playerPositions: SkaterPosition[], slotPosition: RosterPosition): boolean {
  // UTIL accepts any skater, regardless of their listed positions.
  return slotPosition === "UTIL" || playerPositions.includes(slotPosition);
}

// A plausible standard config - not any real league's actual settings.
// Swap for the league's real roster positions once Yahoo league settings
// are fetched (league/{league_key}/settings - confirmed available, see
// ROADMAP.md).
export const SAMPLE_ROSTER_SLOTS: RosterSlotConfig = {
  C: 3,
  LW: 3,
  RW: 3,
  D: 4,
  UTIL: 1,
};

export interface RosterFitPlayer {
  name: string;
  team: string;
  /** Real position eligibility only (C/LW/RW/D) - UTIL is implicit for
   *  every skater, never listed here. */
  positions: SkaterPosition[];
}

/** One instance of a slot type - e.g. slot count C:3 expands to three
 *  separate "C" slot instances, turning "match players to position types
 *  with capacity" into a plain 1-to-1 bipartite matching problem. */
interface SlotInstance {
  id: string;
  position: RosterPosition;
}

function expandSlots(slots: RosterSlotConfig): SlotInstance[] {
  const instances: SlotInstance[] = [];
  for (const position of Object.keys(slots) as RosterPosition[]) {
    for (let i = 0; i < slots[position]; i++) {
      instances.push({ id: `${position}-${i}`, position });
    }
  }
  return instances;
}

/** Kuhn's algorithm: tries to find an augmenting path from player index
 *  `playerIdx` through the bipartite graph, reassigning already-matched
 *  slots along the way if that's what it takes. Returns true if the player
 *  was successfully matched (possibly by displacing someone else, who
 *  themselves get reassigned - never left unmatched by this call). */
function tryAugment(
  playerIdx: number,
  eligibleSlotIndexes: number[][],
  slotMatchedTo: number[], // slotIdx -> playerIdx, or -1
  visitedSlots: boolean[]
): boolean {
  for (const slotIdx of eligibleSlotIndexes[playerIdx]) {
    if (visitedSlots[slotIdx]) continue;
    visitedSlots[slotIdx] = true;
    const currentOccupant = slotMatchedTo[slotIdx];
    if (currentOccupant === -1 || tryAugment(currentOccupant, eligibleSlotIndexes, slotMatchedTo, visitedSlots)) {
      slotMatchedTo[slotIdx] = playerIdx;
      return true;
    }
  }
  return false;
}

/** Runs the actual matching, returning both the count seated and exactly
 *  which player (by index into `players`) landed in each slot - the full
 *  working, not just the final number. */
function computeMatching(
  players: SkaterPosition[][],
  slots: SlotInstance[]
): { matched: number; slotMatchedTo: number[] } {
  const eligibleSlotIndexes = players.map((positions) =>
    slots.reduce<number[]>((acc, slot, idx) => {
      if (isEligible(positions, slot.position)) acc.push(idx);
      return acc;
    }, [])
  );
  const slotMatchedTo = new Array(slots.length).fill(-1);
  let matched = 0;
  for (let p = 0; p < players.length; p++) {
    const visitedSlots = new Array(slots.length).fill(false);
    if (tryAugment(p, eligibleSlotIndexes, slotMatchedTo, visitedSlots)) matched++;
  }
  return { matched, slotMatchedTo };
}

/** Maximum number of the given players who can be simultaneously seated
 *  into the given slots, respecting each player's real eligibility (plus
 *  everyone's implicit UTIL eligibility). */
function maxMatchedCount(players: SkaterPosition[][], slots: SlotInstance[]): number {
  return computeMatching(players, slots).matched;
}

export interface DayLineupSlot {
  slotId: string;
  position: RosterPosition;
  playerName: string | null;
}

/** The actual optimal lineup assignment for one day's playing group - who
 *  starts in which slot, and which slots (if any) go unfilled. This is
 *  the same matching `computeFitDays` uses internally, exposed directly -
 *  useful to show your work, and the basis for a future "today's lineup"
 *  view. */
export function computeDayLineup(playersPlayingToday: RosterFitPlayer[], slots: RosterSlotConfig): DayLineupSlot[] {
  const slotInstances = expandSlots(slots);
  const { slotMatchedTo } = computeMatching(
    playersPlayingToday.map((p) => p.positions),
    slotInstances
  );
  return slotInstances.map((slot, idx) => ({
    slotId: slot.id,
    position: slot.position,
    playerName: slotMatchedTo[idx] === -1 ? null : playersPlayingToday[slotMatchedTo[idx]].name,
  }));
}

/** Which of the given days the candidate could actually be started on -
 *  the true answer (via maximum bipartite matching), not a greedy
 *  approximation. `roster` should already exclude whoever's being dropped
 *  - their slot is exactly what opens up. Evaluates one candidate at a
 *  time, as a standalone what-if - it doesn't jointly optimize multiple
 *  simultaneous adds. */
export function computeFitDays(
  candidateTeam: string,
  candidatePositions: Position[],
  days: string[],
  gameDatesByTeam: Record<string, string[]>,
  roster: RosterFitPlayer[],
  slots: RosterSlotConfig
): string[] {
  const candidateGameDays = new Set(gameDatesByTeam[candidateTeam] ?? []);
  const candidateRosterPositions = candidatePositions.filter((p): p is SkaterPosition => p !== "G");
  const slotInstances = expandSlots(slots);

  return days.filter((day) => {
    if (!candidateGameDays.has(day)) return false;
    const playingToday = roster.filter((p) => (gameDatesByTeam[p.team] ?? []).includes(day));

    const withoutCandidate = maxMatchedCount(playingToday.map((p) => p.positions), slotInstances);
    const withCandidate = maxMatchedCount(
      [...playingToday.map((p) => p.positions), candidateRosterPositions],
      slotInstances
    );
    return withCandidate > withoutCandidate;
  });
}
