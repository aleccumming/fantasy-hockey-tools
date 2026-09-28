"use client";

import { useEffect, useState } from "react";
import type { YahooFreeAgent } from "./yahoo-fantasy-client";

/** This league's real available-player pool. Pass null to skip fetching -
 *  callers fall back to "not on my roster" as an approximation. */
export function useYahooFreeAgents(leagueKey: string | null) {
  // Tagged with the key it was fetched for, same reasoning as
  // use-yahoo-roster.ts - avoids ever showing a stale league's free agents
  // while switching, without resetting state inside the effect body.
  const [state, setState] = useState<
    { key: string; freeAgents: YahooFreeAgent[] } | { key: string; error: string } | null
  >(null);

  useEffect(() => {
    if (!leagueKey) return;
    let cancelled = false;
    fetch(`/api/yahoo/free-agents?leagueKey=${encodeURIComponent(leagueKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Yahoo free agents");
        return res.json();
      })
      .then((json: { freeAgents: YahooFreeAgent[] }) => {
        if (!cancelled) setState({ key: leagueKey, freeAgents: json.freeAgents });
      })
      .catch((err) => {
        if (!cancelled) setState({ key: leagueKey, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [leagueKey]);

  const current = state && state.key === leagueKey ? state : null;
  const freeAgents = current && "freeAgents" in current ? current.freeAgents : null;
  const error = current && "error" in current ? current.error : null;

  return { freeAgents, error, loading: Boolean(leagueKey) && !error && !freeAgents };
}
