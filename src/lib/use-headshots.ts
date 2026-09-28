"use client";

import { useEffect, useMemo, useState } from "react";
import type { HeadshotMap } from "./headshots";
import { normalizeName } from "./name-matching";
import { useYahooPlayerEligibility } from "./use-yahoo-player-eligibility";

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
 *  reused, since it's the same 32-team roster lookup no matter who asks.
 *  Yahoo's own player thumbnails (already tightly cropped to the face, from
 *  the same cached eligibility data used for positions) take priority over
 *  the NHL's raw mugshots wherever available - see player-headshot.tsx for
 *  why the two need different crop handling. */
export function useHeadshots(): HeadshotMap {
  const [map, setMap] = useState<HeadshotMap>({});
  const { eligibility } = useYahooPlayerEligibility();

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

  return useMemo(() => {
    if (!eligibility) return map;
    const merged = { ...map };
    for (const p of eligibility) {
      if (p.headshotUrl) merged[normalizeName(p.name)] = p.headshotUrl;
    }
    return merged;
  }, [map, eligibility]);
}
