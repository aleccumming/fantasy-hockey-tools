"use client";

import { useEffect, useMemo, useState } from "react";
import { buildPlayerIdentityMap } from "./player-identity-key";
import type { YahooPlayerEligibility } from "./yahoo-fantasy-client";

/** Every NHL player's real Yahoo position eligibility - a fast DB read
 *  (see getCachedPlayerEligibility), kept fresh by a daily cron job rather
 *  than any live Yahoo call at request time, so this never makes a page
 *  wait and doesn't depend on the viewer's own Yahoo connection. Falls
 *  back to null only if the cache has never been seeded at all (callers
 *  keep whatever single-position data they already have, e.g. from NST).
 *
 *  byName is keyed via buildPlayerIdentityMap (name+team+position first,
 *  plain name as a fallback), NOT a plain name Map - real NHL namesakes
 *  exist (confirmed live: two Sebastian Ahos, two Elias Petterssons), and
 *  a plain name Map would silently drop one of them at construction, so
 *  any caller of applyEligibilityOverrides that looked both of them up by
 *  name alone would get the SAME single entry back for both - not just a
 *  wrong label, but forcing two real, different players to the same
 *  team+position, which is what broke an earlier fix downstream
 *  (deployment-board.tsx's React key relied on team+position already
 *  being correct going in). */
export function useYahooPlayerEligibility() {
  const [eligibility, setEligibility] = useState<YahooPlayerEligibility[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/yahoo/player-eligibility")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Yahoo player eligibility");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setEligibility(json.eligibility);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byName = useMemo(
    () =>
      eligibility
        ? buildPlayerIdentityMap(
            eligibility,
            (p) => p.name,
            (p) => p.team,
            (p) => (p.isGoalie ? ["G"] : p.positions)
          )
        : null,
    [eligibility]
  );

  return { eligibility, byName, error, loading: !error && !eligibility };
}
