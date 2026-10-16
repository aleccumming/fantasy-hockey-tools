"use client";

import { useCallback, useEffect, useState } from "react";

export interface ScheduleRange {
  start: string;
  end: string;
  gameDatesByTeam: Record<string, string[]>;
}

// The server already retries each NHL request, but a rate limit can outlast
// that - a couple of spaced-out client retries ride it out before the user
// ever sees an error.
const AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

/** Fetches which dates each team plays within [start, end] (both
 *  "YYYY-MM-DD"). Refetches whenever the range changes - e.g. when a user
 *  widens it to plan holding a streamer for a couple of weeks instead of
 *  just the current one. `retry()` refetches after an error. */
export function useScheduleRange(start: string, end: string) {
  const [data, setData] = useState<ScheduleRange | null>(null);
  // Tagged with the range (and attempt) it belongs to, so an old error never
  // shows for a new range or a manual retry that's still loading.
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${start}|${end}|${attempt}`;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ start, end });

    async function load() {
      for (let i = 0; i <= AUTO_RETRIES; i++) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        if (cancelled) return;
        try {
          const res = await fetch(`/api/schedule/range?${params.toString()}`);
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "Failed to load schedule");
          if (!cancelled) setData(json);
          return;
        } catch (err) {
          if (i === AUTO_RETRIES && !cancelled) {
            setError({ key, message: err instanceof Error ? err.message : "Failed to load schedule" });
          }
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [start, end, key]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const currentError = error && error.key === key ? error.message : null;
  // Derived, not tracked separately - true whenever the data we're holding
  // doesn't (yet) correspond to the currently-requested range, which
  // naturally covers both the initial mount and every subsequent refetch
  // without needing an extra setState call at the top of the effect.
  const loading = !currentError && (!data || data.start !== start || data.end !== end);

  return { data, error: currentError, loading, retry };
}
