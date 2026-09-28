"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeName } from "./name-matching";
import type { YahooPlayerEligibility } from "./yahoo-fantasy-client";

/** Every NHL player's real Yahoo position eligibility, keyed by normalized
 *  name - a fast DB read (see getCachedPlayerEligibility), kept fresh by a
 *  daily cron job rather than any live Yahoo call at request time, so this
 *  never makes a page wait and doesn't depend on the viewer's own Yahoo
 *  connection. Falls back to null only if the cache has never been seeded
 *  at all (callers keep whatever single-position data they already have,
 *  e.g. from NST). */
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
    () => (eligibility ? new Map(eligibility.map((p) => [normalizeName(p.name), p])) : null),
    [eligibility]
  );

  return { eligibility, byName, error, loading: !error && !eligibility };
}
