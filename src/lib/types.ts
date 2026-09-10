export type SkaterPosition = "C" | "LW" | "RW" | "D";
export type Position = SkaterPosition | "G";

export const SKATER_POSITIONS: SkaterPosition[] = ["C", "LW", "RW", "D"];
export const ALL_POSITIONS: Position[] = ["C", "LW", "RW", "D", "G"];

// Stat keys are open-ended so users can import whatever columns their
// projection source provides. Common ones are listed for defaults/labels.
export type StatKey = string;

export type PlayerStats = Record<StatKey, number>;

export interface Player {
  id: string;
  name: string;
  team: string; // NHL team abbreviation, e.g. "TOR"
  positions: Position[];
  stats: PlayerStats;
  adp?: number;
  notes?: string;
  /** Rank from the uploaded CSV (explicit "Rank" column, or row order if none given). */
  rank?: number;
}

/** A user-added comparison ranking (e.g. "ESPN Rankings"), matched to the
 *  main player list by name so it can be shown alongside your own rank. */
export interface RankingSource {
  id: string;
  name: string;
  entries: { name: string; rank: number }[];
}

/** A user-added alternate ADP dataset (e.g. a points-league ADP, or a
 *  different site's), matched to the main player list by name. Unlike
 *  ranking sources these aren't blended together - a draft picks at most
 *  one active source (or none, meaning "use the bundled default"). */
export interface AdpSource {
  id: string;
  name: string;
  entries: { name: string; adp: number }[];
}

export interface DraftPick {
  pickNumber: number; // 1-indexed, overall pick
  round: number;
  teamIndex: number; // 0-indexed
  playerId: string | null;
}

export interface RosterSettings {
  slots: Record<Position | "UTIL" | "BENCH", number>;
}

export const DEFAULT_ROSTER_SETTINGS: RosterSettings = {
  slots: {
    C: 2,
    LW: 2,
    RW: 2,
    D: 4,
    G: 2,
    UTIL: 1,
    BENCH: 4,
  },
};

export interface StatDefinition {
  key: StatKey;
  label: string;
  pointValue: number;
  appliesTo: "skater" | "goalie" | "both";
}

export const DEFAULT_SCORING: StatDefinition[] = [
  { key: "goals", label: "Goals", pointValue: 3, appliesTo: "skater" },
  { key: "assists", label: "Assists", pointValue: 2, appliesTo: "skater" },
  { key: "ppp", label: "Power Play Points", pointValue: 0.5, appliesTo: "skater" },
  { key: "shp", label: "Short-Handed Points", pointValue: 1, appliesTo: "skater" },
  { key: "sog", label: "Shots on Goal", pointValue: 0.1, appliesTo: "skater" },
  { key: "hits", label: "Hits", pointValue: 0.1, appliesTo: "skater" },
  { key: "blocks", label: "Blocked Shots", pointValue: 0.1, appliesTo: "skater" },
  { key: "pim", label: "Penalty Minutes", pointValue: 0, appliesTo: "skater" },
  { key: "wins", label: "Wins", pointValue: 4, appliesTo: "goalie" },
  { key: "saves", label: "Saves", pointValue: 0.2, appliesTo: "goalie" },
  { key: "goalsAgainst", label: "Goals Against", pointValue: -1, appliesTo: "goalie" },
  { key: "shutouts", label: "Shutouts", pointValue: 3, appliesTo: "goalie" },
  { key: "otLosses", label: "OT Losses", pointValue: 1, appliesTo: "goalie" },
];

/** "snake" alternates every round (1-12, 12-1, 1-12, ...). "thirdRoundReversal"
 *  is standard snake except round 3 repeats round 2's direction instead of
 *  flipping back, then keeps alternating from there. "balanced" reverses
 *  once after round 1 and then stays reversed for every remaining round
 *  (never flips back) - whoever picks last in round 1 picks first in every
 *  round after that. */
export type DraftOrderType = "snake" | "thirdRoundReversal" | "balanced";

export interface DraftSettings {
  teamCount: number;
  myTeamIndex: number;
  rosterSettings: RosterSettings;
  draftOrderType?: DraftOrderType;
  /** @deprecated superseded by `draftOrderType` - kept only so drafts saved
   *  before that field existed still resolve to "thirdRoundReversal" when
   *  read. Use `resolveDraftOrderType()` rather than reading this directly. */
  thirdRoundReversal?: boolean;
}

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  teamCount: 12,
  myTeamIndex: 0,
  rosterSettings: DEFAULT_ROSTER_SETTINGS,
  draftOrderType: "snake",
};
