"use client";

import { useEffect, useState } from "react";
import type { ScheduleAnalysis } from "./schedule";

export function useScheduleAnalysis() {
  const [data, setData] = useState<ScheduleAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/schedule")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load schedule");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error, loading };
}
