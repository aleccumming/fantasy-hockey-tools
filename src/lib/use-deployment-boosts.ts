"use client";

import { useEffect, useState } from "react";
import type { DeploymentBoostsByBaseline } from "./deployment-service";

interface DeploymentBoostsResponse {
  baselines: DeploymentBoostsByBaseline;
  computedAt: string;
}

export function useDeploymentBoosts() {
  const [data, setData] = useState<DeploymentBoostsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deployment-boosts")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load deployment boosts");
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
    baselines: data?.baselines ?? null,
    computedAt: data?.computedAt ?? null,
    error,
    loading: !error && !data,
  };
}
