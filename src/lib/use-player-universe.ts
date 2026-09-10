"use client";

import { useEffect, useState } from "react";
import type { Position } from "./types";

export interface PlayerUniverseEntry {
  name: string;
  team: string;
  positions: Position[];
}

let cachedPromise: Promise<PlayerUniverseEntry[]> | null = null;

function loadPlayerUniverse(): Promise<PlayerUniverseEntry[]> {
  if (!cachedPromise) {
    cachedPromise = fetch("/api/player-universe")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load player universe");
        return res.json();
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }
  return cachedPromise;
}

/** Every active NHL skater and goalie (live roster data), independent of
 *  whatever's in the user's uploaded ranking CSV - used to fill in players
 *  the CSV doesn't cover (typically goalies, since most ranking exports are
 *  skater-only) so they still exist to be drafted. Shared across callers
 *  the same way useHeadshots() is. */
export function usePlayerUniverse(): PlayerUniverseEntry[] {
  const [universe, setUniverse] = useState<PlayerUniverseEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPlayerUniverse()
      .then((u) => {
        if (!cancelled) setUniverse(u);
      })
      .catch(() => {
        // If this fails, CSV-only players still work - just without the
        // full-universe fill-in (e.g. goalies may be missing).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return universe;
}
