"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { SAMPLE_ROSTER, type SampleRosterPlayer } from "./sample-roster";
import type { SkaterPosition } from "./types";

// Saved in this browser only. Starts as the default roster in
// sample-roster.ts until the user edits it.
const STORAGE_KEY = "fh-tools:my-roster:v1";
const VALID_POSITIONS = new Set<string>(["C", "LW", "RW", "D"]);

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseRoster(raw: string | null): SampleRosterPlayer[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const roster: SampleRosterPlayer[] = [];
    for (const item of value) {
      if (
        item &&
        typeof item.name === "string" &&
        typeof item.team === "string" &&
        Array.isArray(item.positions)
      ) {
        const positions = item.positions.filter((p: string) => VALID_POSITIONS.has(p)) as SkaterPosition[];
        if (positions.length > 0) roster.push({ name: item.name, team: item.team, positions });
      }
    }
    return roster;
  } catch {
    return null;
  }
}

export function useMyRoster() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const roster = useMemo(() => parseRoster(raw) ?? SAMPLE_ROSTER, [raw]);

  const setRoster = useCallback((next: SampleRosterPlayer[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked (private window etc.) - edits just won't persist.
    }
    listeners.forEach((l) => l());
  }, []);

  return { roster, setRoster };
}
