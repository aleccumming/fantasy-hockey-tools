// Server-only helper for fetching every active NHL player's name, team, and
// position(s) - and headshot - from the live roster endpoints. Shared by
// src/lib/headshots.ts and the player-universe API so the 32-team fetch only
// happens once per cache window, not once per feature.

import { NHL_TEAMS } from "./schedule";
import { fetchNhlJson, mapInBatches } from "./nhl-api";
import type { Position } from "./types";

interface RawRosterPlayer {
  id: number;
  headshot: string;
  firstName: { default: string };
  lastName: { default: string };
  positionCode: string;
}

interface RawRosterResponse {
  forwards: RawRosterPlayer[];
  defensemen: RawRosterPlayer[];
  goalies: RawRosterPlayer[];
}

const POSITION_CODE_MAP: Record<string, Position> = {
  C: "C",
  L: "LW",
  R: "RW",
  D: "D",
  G: "G",
};

export interface NhlRosterPlayer {
  id: number;
  name: string;
  team: string;
  positions: Position[];
  headshot: string;
}

// Per warm instance, on top of Next's fetch cache. The in-flight promise is
// shared, so headshots and the player universe loading together make one
// batched pass over the 32 roster endpoints, not two bursts.
let cache: { promise: Promise<NhlRosterPlayer[]>; expiresAt: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - rosters rarely change

// The roster endpoint rate-limits a burst of ~32 simultaneous requests (one
// per team), so teams go a few at a time, each retried with backoff on
// 429/5xx (see nhl-api.ts).
const BATCH_SIZE = 6;

async function fetchTeamRoster(team: string): Promise<NhlRosterPlayer[]> {
  const data = await fetchNhlJson<RawRosterResponse>(`https://api-web.nhle.com/v1/roster/${team}/current`, 86400);
  return [...data.forwards, ...data.defensemen, ...data.goalies].map((p) => {
    const position = POSITION_CODE_MAP[p.positionCode];
    return {
      id: p.id,
      name: `${p.firstName.default} ${p.lastName.default}`,
      team,
      positions: position ? [position] : [],
      headshot: p.headshot,
    };
  });
}

export function getNhlRosterPlayers(forceRefresh = false): Promise<NhlRosterPlayer[]> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) return cache.promise;
  const promise = mapInBatches(NHL_TEAMS, BATCH_SIZE, fetchTeamRoster).then((teams) => teams.flat());
  const entry = { promise, expiresAt: Date.now() + CACHE_TTL_MS };
  cache = entry;
  // A failed pass must not be cached - the next request should try again.
  promise.catch(() => {
    if (cache === entry) cache = null;
  });
  return promise;
}
