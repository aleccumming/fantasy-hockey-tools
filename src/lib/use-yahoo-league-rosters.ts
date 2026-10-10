"use client";

import { useEffect, useState } from "react";
import type { RosterSlotConfig } from "./roster-fit";
import type { YahooLeagueTeamRoster } from "./yahoo-fantasy-client";

interface LeagueRostersResponse {
  teams: YahooLeagueTeamRoster[];
  slots: RosterSlotConfig;
}

/** Every team's roster in one league, plus its roster slots. Pass null to
 *  skip fetching (not connected / no league picked yet). Tagged with the
 *  key it was fetched for, same reasoning as use-yahoo-roster.ts. */
export function useYahooLeagueRosters(leagueKey: string | null) {
  const [state, setState] = useState<
    { key: string; data: LeagueRostersResponse } | { key: string; error: string } | null
  >(null);

  useEffect(() => {
    if (!leagueKey) return;
    let cancelled = false;
    fetch(`/api/yahoo/league-rosters?leagueKey=${encodeURIComponent(leagueKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load your league's rosters");
        return res.json();
      })
      .then((json: LeagueRostersResponse) => {
        if (!cancelled) setState({ key: leagueKey, data: json });
      })
      .catch((err) => {
        if (!cancelled) setState({ key: leagueKey, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [leagueKey]);

  const current = state && state.key === leagueKey ? state : null;
  const data = current && "data" in current ? current.data : null;
  const error = current && "error" in current ? current.error : null;

  return {
    teams: data?.teams ?? null,
    slots: data?.slots ?? null,
    error,
    loading: Boolean(leagueKey) && !error && !data,
  };
}
