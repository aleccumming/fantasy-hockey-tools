"use client";

import { createContext, useContext } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { DraftPick, DraftSettings, Player, StatDefinition } from "@/lib/types";
import { DEFAULT_SCORING } from "@/lib/types";
import {
  generatePicks,
  defaultTeamNames,
  partializeDraftState,
  carryOverPlayerIds,
  resolveDraftOrderType,
  type DraftPersistedState,
} from "@/lib/draft-state";

interface DraftStoreState extends DraftPersistedState {
  /** Transient (not persisted) note about the most recent import, e.g. how
   *  many players matched the bundled Yahoo positions dataset. */
  importNote: string | null;

  setPlayers: (players: Player[]) => void;
  addPlayers: (players: Player[]) => void;
  clearPlayers: () => void;
  setImportNote: (note: string | null) => void;
  addRankingSource: (name: string, entries: { name: string; rank: number }[]) => void;
  removeRankingSource: (id: string) => void;
  renameRankingSource: (id: string, name: string) => void;
  addAdpSource: (name: string, entries: { name: string; adp: number }[]) => void;
  removeAdpSource: (id: string) => void;
  renameAdpSource: (id: string, name: string) => void;
  setActiveAdpSource: (id: string | null) => void;
  updateScoring: (scoring: StatDefinition[]) => void;
  resetScoringToDefault: () => void;
  updateSettings: (settings: Partial<DraftSettings>) => void;
  setTeamName: (index: number, name: string) => void;
  setTotalRounds: (rounds: number) => void;
  setNotes: (notes: string) => void;

  draftPlayer: (playerId: string) => void;
  undoPick: (pickNumber: number) => void;
  resetDraft: () => void;
  /** Overwrites picks with a server-fetched copy - used to pick up picks
   *  made by the kkupfl live-sync relay, which writes to the DB directly
   *  rather than through this store (it runs outside any open tab). */
  applyServerPicks: (picks: DraftPick[]) => void;
}

/** One store instance per opened draft (see DraftStoreProvider) - persisted
 *  to a draft-specific localStorage key as a write-through fallback cache,
 *  with the draft's DB row as the actual source of truth (synced separately
 *  by the provider, since that's an app-level concern, not a store one). */
export function createDraftStore(draftId: string, initialState: DraftPersistedState) {
  return createStore<DraftStoreState>()(
    persist(
      (set) => ({
        ...initialState,
        importNote: null,

        setPlayers: (players) => set({ players }),
        addPlayers: (players) =>
          set((state) => ({ players: [...state.players, ...players] })),
        clearPlayers: () =>
          set((state) => ({
            players: [],
            picks: generatePicks(
              state.settings.teamCount,
              state.totalRounds,
              resolveDraftOrderType(state.settings)
            ),
          })),
        setImportNote: (note) => set({ importNote: note }),

        addRankingSource: (name, entries) =>
          set((state) => ({
            rankingSources: [...state.rankingSources, { id: uuidv4(), name, entries }],
          })),
        removeRankingSource: (id) =>
          set((state) => ({
            rankingSources: state.rankingSources.filter((s) => s.id !== id),
          })),
        renameRankingSource: (id, name) =>
          set((state) => ({
            rankingSources: state.rankingSources.map((s) =>
              s.id === id ? { ...s, name } : s
            ),
          })),

        addAdpSource: (name, entries) =>
          set((state) => ({
            adpSources: [...state.adpSources, { id: uuidv4(), name, entries }],
          })),
        removeAdpSource: (id) =>
          set((state) => ({
            adpSources: state.adpSources.filter((s) => s.id !== id),
            activeAdpSourceId: state.activeAdpSourceId === id ? null : state.activeAdpSourceId,
          })),
        renameAdpSource: (id, name) =>
          set((state) => ({
            adpSources: state.adpSources.map((s) => (s.id === id ? { ...s, name } : s)),
          })),
        setActiveAdpSource: (id) => set({ activeAdpSourceId: id }),

        updateScoring: (scoring) => set({ scoring }),
        resetScoringToDefault: () => set({ scoring: DEFAULT_SCORING }),

        updateSettings: (partial) =>
          set((state) => {
            const settings = { ...state.settings, ...partial };
            const teamCount = settings.teamCount;
            const teamNames =
              teamCount !== state.settings.teamCount
                ? defaultTeamNames(teamCount)
                : state.teamNames;
            const freshPicks = generatePicks(
              teamCount,
              state.totalRounds,
              resolveDraftOrderType(settings)
            );
            return {
              settings,
              teamNames,
              picks: carryOverPlayerIds(state.picks, freshPicks),
            };
          }),

        setTeamName: (index, name) =>
          set((state) => {
            const teamNames = [...state.teamNames];
            teamNames[index] = name;
            return { teamNames };
          }),

        setNotes: (notes) => set({ notes }),

        setTotalRounds: (rounds) =>
          set((state) => {
            const freshPicks = generatePicks(
              state.settings.teamCount,
              rounds,
              resolveDraftOrderType(state.settings)
            );
            return {
              totalRounds: rounds,
              picks: carryOverPlayerIds(state.picks, freshPicks),
            };
          }),

        draftPlayer: (playerId) =>
          set((state) => {
            const alreadyDrafted = state.picks.some((p) => p.playerId === playerId);
            if (alreadyDrafted) return state;
            const nextOpenIndex = state.picks.findIndex((p) => p.playerId === null);
            if (nextOpenIndex === -1) return state;
            const picks = [...state.picks];
            picks[nextOpenIndex] = { ...picks[nextOpenIndex], playerId };
            return { picks };
          }),

        undoPick: (pickNumber) =>
          set((state) => ({
            picks: state.picks.map((p) =>
              p.pickNumber === pickNumber ? { ...p, playerId: null } : p
            ),
          })),

        resetDraft: () =>
          set((state) => ({
            picks: generatePicks(
              state.settings.teamCount,
              state.totalRounds,
              resolveDraftOrderType(state.settings)
            ),
          })),

        applyServerPicks: (picks) => set({ picks }),
      }),
      {
        name: `fantasy-hockey-draft-assistant:${draftId}`,
        partialize: partializeDraftState,
      }
    )
  );
}

export const DraftStoreContext = createContext<StoreApi<DraftStoreState> | null>(null);

/** Reads from whichever draft's store the nearest DraftStoreProvider set up.
 *  Call signature is unchanged from the old global-singleton version -
 *  every existing `useDraftStore(selector)` call site keeps working as-is. */
export function useDraftStore<T>(selector: (state: DraftStoreState) => T): T {
  const store = useContext(DraftStoreContext);
  if (!store) {
    throw new Error("useDraftStore must be used within a DraftStoreProvider");
  }
  return useStore(store, selector);
}
