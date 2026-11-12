"use client";

import { useEffect, useState } from "react";
import type { LeagueSkaterScoring } from "./luck-neutral";

/** This league's skater scoring weights. Pass null to skip fetching -
 *  callers fall back to plain points (G + A). */
export function useYahooScoring(leagueKey: string | null) {
  // Tagged with the key it was fetched for, same reasoning as
  // use-yahoo-free-agents.ts.
  const [state, setState] = useState<
    { key: string; scoring: LeagueSkaterScoring } | { key: string; error: string } | null
  >(null);

  useEffect(() => {
    if (!leagueKey) return;
    let cancelled = false;
    fetch(`/api/yahoo/scoring?leagueKey=${encodeURIComponent(leagueKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Yahoo scoring settings");
        return res.json();
      })
      .then((json: { scoring: LeagueSkaterScoring }) => {
        if (!cancelled) setState({ key: leagueKey, scoring: json.scoring });
      })
      .catch((err) => {
        if (!cancelled) setState({ key: leagueKey, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [leagueKey]);

  const current = state && state.key === leagueKey ? state : null;
  const scoring = current && "scoring" in current ? current.scoring : null;
  const error = current && "error" in current ? current.error : null;

  return { scoring, error, loading: Boolean(leagueKey) && !error && !scoring };
}
