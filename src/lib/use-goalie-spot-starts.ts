"use client";

import { useEffect, useState } from "react";
import type { LiveSpotStart } from "./goalie-spot-start-service";

interface SpotStartsResponse {
  spotStarts: LiveSpotStart[];
  computedAt: string;
}

/** Live Spot Starts for a date range (defaults to the current week server-
 *  side if omitted). */
export function useGoalieSpotStarts(start?: string, end?: string) {
  const [data, setData] = useState<SpotStartsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const qs = params.toString();
    fetch(`/api/goalie-spot-starts${qs ? `?${qs}` : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load goalie spot starts");
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

  return {
    spotStarts: data?.spotStarts ?? null,
    computedAt: data?.computedAt ?? null,
    error,
    loading: !error && !data,
  };
}
