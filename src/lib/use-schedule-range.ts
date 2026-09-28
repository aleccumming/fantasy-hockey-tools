"use client";

import { useEffect, useState } from "react";

export interface ScheduleRange {
  start: string;
  end: string;
  gameDatesByTeam: Record<string, string[]>;
}

/** Fetches which dates each team plays within [start, end] (both
 *  "YYYY-MM-DD"). Refetches whenever the range changes - e.g. when a user
 *  widens it to plan holding a streamer for a couple of weeks instead of
 *  just the current one. */
export function useScheduleRange(start: string, end: string) {
  const [data, setData] = useState<ScheduleRange | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ start, end });
    fetch(`/api/schedule/range?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load schedule");
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
  }, [start, end]);

  // Derived, not tracked separately - true whenever the data we're holding
  // doesn't (yet) correspond to the currently-requested range, which
  // naturally covers both the initial mount and every subsequent refetch
  // without needing an extra setState call at the top of the effect.
  const loading = !error && (!data || data.start !== start || data.end !== end);

  return { data, error, loading };
}
