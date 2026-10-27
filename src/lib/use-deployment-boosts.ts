"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeploymentBoostsByBaseline, DeploymentGameLine, DeploymentRolesByWindow } from "./deployment-types";

interface DeploymentBoostsResponse {
  baselines: DeploymentBoostsByBaseline;
  /** Null until the cached row has been refreshed since roles shipped. */
  roles: DeploymentRolesByWindow | null;
  /** Null until the cached row has been refreshed since game lines shipped. */
  lastGame: DeploymentGameLine[] | null;
  computedAt: string;
}

export function useDeploymentBoosts() {
  const [data, setData] = useState<DeploymentBoostsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by reload() (after the Refresh button pulls new data) to refetch
  // without a page reload. The current data stays on screen meanwhile.
  const [reloadToken, setReloadToken] = useState(0);

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
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return {
    baselines: data?.baselines ?? null,
    roles: data?.roles ?? null,
    lastGame: data?.lastGame ?? null,
    computedAt: data?.computedAt ?? null,
    error,
    loading: !error && !data,
    reload,
  };
}
