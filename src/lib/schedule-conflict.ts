import type { OverlapMatrix } from "./schedule";
import type { RosterSlotAssignment } from "./draft-helpers";
import type { Position } from "./types";

export type ConflictLevel = "low" | "medium" | "high";

export const CONFLICT_LABELS: Record<ConflictLevel, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
};

export const CONFLICT_BADGE_CLASSES: Record<ConflictLevel, string> = {
  low: "bg-rink-green-light text-rink-green",
  medium: "bg-rink-gold-light text-rink-gold",
  high: "bg-rink-red-light text-rink-red",
};

export interface ConflictResult {
  score: number;
  relevantTeams: string[];
}

/**
 * How much would drafting this player create schedule overlap with players
 * you've already rostered? Only compares against players in ACTIVE slots
 * (dedicated positions + UTIL, never bench) who share at least one eligible
 * position with the candidate - so a UTIL-eligible rostered player of a
 * different position doesn't count, but one sharing a position does, and a
 * dual/tri-eligible candidate is compared correctly against every one of
 * their possible positions at once (not just a single arbitrary one). If
 * nothing in your active roster overlaps with the candidate's positions,
 * the score is 0.
 */
export function computeCandidateConflict(
  candidate: { id: string; team: string; positions: Position[] },
  myRosterSlots: RosterSlotAssignment[],
  overlapMatrix: OverlapMatrix
): ConflictResult {
  const relevantTeams = new Set<string>();

  for (const slot of myRosterSlots) {
    if (slot.position === "BENCH" || !slot.player || slot.player.id === candidate.id) continue;
    if (slot.player.positions.some((pos) => candidate.positions.includes(pos))) {
      relevantTeams.add(slot.player.team);
    }
  }

  const teams = Array.from(relevantTeams);
  const score = teams.reduce(
    (sum, team) => sum + (overlapMatrix[candidate.team]?.[team] ?? 0),
    0
  );

  return { score, relevantTeams: teams };
}

/**
 * Buckets a set of conflict scores into Low/Medium/High by where each
 * *distinct* value falls within the overall distribution - so every player
 * with a 0 (nothing relevant rostered yet) always lands in Low together,
 * rather than being arbitrarily split across buckets by tie-breaking.
 */
export function bucketConflictScores(scores: number[]): Map<number, ConflictLevel> {
  const distinct = Array.from(new Set(scores)).sort((a, b) => a - b);
  const n = distinct.length;
  const map = new Map<number, ConflictLevel>();

  distinct.forEach((value, i) => {
    const percentile = n > 1 ? i / (n - 1) : 0;
    map.set(value, percentile < 1 / 3 ? "low" : percentile < 2 / 3 ? "medium" : "high");
  });

  return map;
}
