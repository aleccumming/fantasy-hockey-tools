"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlayerEvaluatorStats } from "./player-evaluator-service";

interface PlayerEvaluatorResponse {
  windows: PlayerEvaluatorStats;
  computedAt: string;
}

/** Fetches all three Player Evaluator windows (last 5 / last 10 / season)
 *  in one request, once per mount, so switching between window tabs is
 *  instant afterward - the server caches the underlying NST data for a few
 *  hours anyway, so there's no benefit to fetching per-tab instead. */
export function usePlayerEvaluatorStats() {
  const [data, setData] = useState<PlayerEvaluatorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by reload() (after the Refresh button pulls new data) to refetch
  // without a page reload. The current data stays on screen meanwhile.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/player-evaluator-stats")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load player evaluator stats");
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

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return {
    windows: data?.windows ?? null,
    computedAt: data?.computedAt ?? null,
    error,
    loading: !error && !data,
    reload,
  };
}
