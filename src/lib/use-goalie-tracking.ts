"use client";

import { useEffect, useState } from "react";
import type { GoalieStartTracking } from "./goalie-tracking-service";

interface GoalieTrackingResponse {
  goalies: GoalieStartTracking[];
  computedAt: string;
}

export function useGoalieTracking() {
  const [data, setData] = useState<GoalieTrackingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goalie-tracking")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load goalie start tracking");
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
    goalies: data?.goalies ?? null,
    computedAt: data?.computedAt ?? null,
    error,
    loading: !error && !data,
  };
}
