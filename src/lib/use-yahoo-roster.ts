"use client";

import { useEffect, useState } from "react";
import type { RosterSlotConfig } from "./roster-fit";
import type { YahooRosterPlayer } from "./yahoo-fantasy-client";

interface RosterResponse {
  roster: YahooRosterPlayer[];
  slots: RosterSlotConfig;
  capacity: number;
}

/** The connected user's real roster + real roster-slot settings for one
 *  league. Pass null to skip fetching (not connected / no league picked
 *  yet) - callers fall back to the sample roster + manual editor. */
export function useYahooRoster(leagueKey: string | null) {
  // Tagging the cached response with the key it was fetched for (rather
  // than resetting state to null in the effect) means switching leagues
  // never briefly shows the previous league's roster - the render below
  // just ignores data whose key doesn't match the current one.
  const [state, setState] = useState<{ key: string; data: RosterResponse } | { key: string; error: string } | null>(
    null
  );

  useEffect(() => {
    if (!leagueKey) return;
    let cancelled = false;
    fetch(`/api/yahoo/roster?leagueKey=${encodeURIComponent(leagueKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load your Yahoo roster");
        return res.json();
      })
      .then((json: RosterResponse) => {
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
    roster: data?.roster ?? null,
    slots: data?.slots ?? null,
    capacity: data?.capacity ?? null,
    error,
    loading: Boolean(leagueKey) && !error && !data,
  };
}
