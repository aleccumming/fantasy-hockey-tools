"use client";

import { useEffect, useState } from "react";
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
  }, []);

  return {
    windows: data?.windows ?? null,
    computedAt: data?.computedAt ?? null,
    error,
    loading: !error && !data,
  };
}
