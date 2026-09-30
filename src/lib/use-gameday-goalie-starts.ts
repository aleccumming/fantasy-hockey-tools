"use client";

import { useEffect, useState } from "react";
import type { GameDayGoalieEntry } from "./gameday-goalie-starts";

interface GameDayGoalieResponse {
  date: string;
  entries: GameDayGoalieEntry[];
  computedAt: string;
}

/** Real goalie-starter info (confirmed tweets or the site's own "Our
 *  Guess") for one date (YYYY-MM-DD), defaults to today server-side if
 *  omitted. Source: gamedaytweets.com - see gameday-goalie-starts.ts. */
export function useGameDayGoalieStarts(date?: string) {
  const [data, setData] = useState<GameDayGoalieResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = date ? `?date=${date}` : "";
    fetch(`/api/gameday-goalie-starts${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load goalie starts");
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
  }, [date]);

  return {
    entries: data?.entries ?? null,
    error,
    loading: !error && !data,
  };
}
