"use client";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draft-store";
import { hasProjectionData, rankPlayers } from "./scoring";
import { applyRankingSources } from "./ranking-sources";
import { applyActiveAdpSource } from "./adp-sources";
import { assignRoster, getCurrentPick, getDraftedPlayerIds, getPicksForTeam } from "./draft-helpers";

export function useDraftData() {
  const players = useDraftStore((s) => s.players);
  const scoring = useDraftStore((s) => s.scoring);
  const settings = useDraftStore((s) => s.settings);
  const picks = useDraftStore((s) => s.picks);
  const rankingSources = useDraftStore((s) => s.rankingSources);
  const adpSources = useDraftStore((s) => s.adpSources);
  const activeAdpSourceId = useDraftStore((s) => s.activeAdpSourceId);

  const hasProjections = useMemo(() => hasProjectionData(players), [players]);

  const ranked = useMemo(() => {
    const withRankings = applyRankingSources(rankPlayers(players, scoring, settings), rankingSources);
    return applyActiveAdpSource(withRankings, adpSources, activeAdpSourceId);
  }, [players, scoring, settings, rankingSources, adpSources, activeAdpSourceId]);

  const draftedIds = useMemo(() => getDraftedPlayerIds(picks), [picks]);

  const available = useMemo(
    () => ranked.filter((p) => !draftedIds.has(p.id)),
    [ranked, draftedIds]
  );

  const byId = useMemo(() => new Map(ranked.map((p) => [p.id, p])), [ranked]);

  const myPicks = useMemo(
    () => getPicksForTeam(picks, settings.myTeamIndex),
    [picks, settings.myTeamIndex]
  );

  const myDraftedPlayers = useMemo(
    () =>
      myPicks
        .filter((p) => p.playerId)
        .map((p) => byId.get(p.playerId as string))
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [myPicks, byId]
  );

  const myRosterSlots = useMemo(
    () => assignRoster(myDraftedPlayers, settings.rosterSettings),
    [myDraftedPlayers, settings.rosterSettings]
  );

  const currentPick = useMemo(() => getCurrentPick(picks), [picks]);

  return {
    ranked,
    draftedIds,
    available,
    byId,
    myRosterSlots,
    currentPick,
    picks,
    hasProjections,
    rankingSources,
  };
}
