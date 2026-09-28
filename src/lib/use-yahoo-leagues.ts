"use client";

import { useCallback, useEffect, useState } from "react";
import type { YahooLeague } from "./yahoo-fantasy-client";

interface LeaguesResponse {
  leagues: YahooLeague[];
  activeLeagueKey: string | null;
  connected?: boolean;
}

/** The connected user's real Yahoo leagues, plus whichever one they've set
 *  as "active" (auto-picked when they only have one). Everything that
 *  needs a league context - Drop & Replace, the Unowned toggle - reads
 *  activeLeagueKey from here so there's exactly one switcher. */
export function useYahooLeagues() {
  const [data, setData] = useState<LeaguesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/yahoo/leagues")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Yahoo leagues");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const setActiveLeague = useCallback(async (leagueKey: string) => {
    // Update locally right away so the switcher feels instant; the POST
    // persists it for next time.
    setData((prev) => (prev ? { ...prev, activeLeagueKey: leagueKey } : prev));
    await fetch("/api/yahoo/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueKey }),
    });
  }, []);

  return {
    leagues: data?.leagues ?? [],
    activeLeagueKey: data?.activeLeagueKey ?? null,
    connected: data?.connected !== false,
    setActiveLeague,
    error,
    loading: !error && !data,
    refresh: () => setReloadToken((t) => t + 1),
  };
}
