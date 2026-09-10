"use client";

import { useEffect, useState } from "react";
import type { HeadshotMap } from "./headshots";

let cachedPromise: Promise<HeadshotMap> | null = null;

function loadHeadshots(): Promise<HeadshotMap> {
  if (!cachedPromise) {
    cachedPromise = fetch("/api/headshots")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load headshots");
        return res.json();
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }
  return cachedPromise;
}

/** Shared across every caller - the map is fetched once per page load and
 *  reused, since it's the same 32-team roster lookup no matter who asks. */
export function useHeadshots(): HeadshotMap {
  const [map, setMap] = useState<HeadshotMap>({});

  useEffect(() => {
    let cancelled = false;
    loadHeadshots()
      .then((m) => {
        if (!cancelled) setMap(m);
      })
      .catch(() => {
        // Headshots are decorative - fail silently and fall back to initials.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}
