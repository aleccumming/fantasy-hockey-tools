// Plain data/types shared by both server code (API routes, server
// components) and the client-only Zustand store (src/store/draft-store.ts).
// This file must NOT have "use client" - Next.js's RSC bundler replaces
// plain-value exports (not just components) from "use client" modules with
// undefined when they're imported into server-only code, which is exactly
// what broke DEFAULT_DRAFT_STATE when it lived in draft-store.ts.

import type {
  AdpSource,
  DraftOrderType,
  DraftPick,
  DraftSettings,
  Player,
  RankingSource,
  StatDefinition,
} from "@/lib/types";
import { DEFAULT_DRAFT_SETTINGS, DEFAULT_SCORING } from "@/lib/types";

/** Resolves a draft's actual order type, migrating the legacy
 *  `thirdRoundReversal` boolean (from before `draftOrderType` existed) so an
 *  older draft that had it enabled keeps behaving the same way instead of
 *  silently reverting to plain snake order. Use this instead of reading
 *  `settings.draftOrderType` directly anywhere picks get generated. */
export function resolveDraftOrderType(settings: DraftSettings): DraftOrderType {
  if (settings.draftOrderType) return settings.draftOrderType;
  return settings.thirdRoundReversal ? "thirdRoundReversal" : "snake";
}

function isReversedRound(round: number, draftOrderType: DraftOrderType): boolean {
  if (draftOrderType === "balanced") return round >= 2;
  if (draftOrderType === "thirdRoundReversal") {
    return round >= 3 ? round % 2 === 1 : round % 2 === 0;
  }
  return round % 2 === 0;
}

function generatePicks(
  teamCount: number,
  totalRounds: number,
  draftOrderType: DraftOrderType = "snake"
): DraftPick[] {
  const picks: DraftPick[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const reversed = isReversedRound(round, draftOrderType);
    for (let i = 0; i < teamCount; i++) {
      const teamIndex = reversed ? teamCount - 1 - i : i;
      picks.push({
        pickNumber: (round - 1) * teamCount + i + 1,
        round,
        teamIndex,
        playerId: null,
      });
    }
  }
  return picks;
}

/** Re-applies existing pick assignments onto a freshly-generated picks
 *  array, matched by overall pick number - used when settings that affect
 *  team-index mapping (like draftOrderType) change on a draft that already
 *  has real picks made, so fixing the mapping doesn't wipe them. */
export function carryOverPlayerIds(
  oldPicks: DraftPick[],
  newPicks: DraftPick[]
): DraftPick[] {
  const playerIdByPickNumber = new Map(oldPicks.map((p) => [p.pickNumber, p.playerId]));
  return newPicks.map((p) => ({
    ...p,
    playerId: playerIdByPickNumber.get(p.pickNumber) ?? p.playerId,
  }));
}

function defaultTeamNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Team ${i + 1}`);
}

const DEFAULT_TOTAL_ROUNDS = 16;

/** The subset of the draft store's state that's actually persisted (to
 *  localStorage and to a draft's DB row) - everything except action
 *  functions and transient UI-only fields like importNote. This is the
 *  shape of a `drafts.state` JSONB column. */
export interface DraftPersistedState {
  players: Player[];
  scoring: StatDefinition[];
  settings: DraftSettings;
  totalRounds: number;
  teamNames: string[];
  picks: DraftPick[];
  rankingSources: RankingSource[];
  adpSources: AdpSource[];
  /** Which adpSources entry overrides the bundled default ADP, if any -
   *  null means "use the bundled default", matching the app's existing
   *  ADP behavior for drafts that don't opt into an alternate. */
  activeAdpSourceId: string | null;
  /** Free-form draft notes (strategy, sleepers, reminders) - just a plain
   *  string blob, not structured per-player. */
  notes: string;
}

export const DEFAULT_DRAFT_STATE: DraftPersistedState = {
  players: [],
  scoring: DEFAULT_SCORING,
  settings: DEFAULT_DRAFT_SETTINGS,
  totalRounds: DEFAULT_TOTAL_ROUNDS,
  teamNames: defaultTeamNames(DEFAULT_DRAFT_SETTINGS.teamCount),
  picks: generatePicks(DEFAULT_DRAFT_SETTINGS.teamCount, DEFAULT_TOTAL_ROUNDS),
  rankingSources: [],
  adpSources: [],
  activeAdpSourceId: null,
  notes: "",
};

/** Strips action functions and transient fields, leaving just the JSON-
 *  serializable data - used both for localStorage persistence and for
 *  syncing a draft's state to its DB row. */
export function partializeDraftState<T extends DraftPersistedState>(
  state: T
): DraftPersistedState {
  return {
    players: state.players,
    scoring: state.scoring,
    settings: state.settings,
    totalRounds: state.totalRounds,
    teamNames: state.teamNames,
    picks: state.picks,
    rankingSources: state.rankingSources,
    adpSources: state.adpSources,
    activeAdpSourceId: state.activeAdpSourceId,
    notes: state.notes,
  };
}

export { generatePicks, defaultTeamNames };
