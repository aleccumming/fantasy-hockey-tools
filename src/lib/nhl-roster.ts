// Server-only helper for fetching every active NHL player's name, team, and
// position(s) - and headshot - from the live roster endpoints. Shared by
// src/lib/headshots.ts and the player-universe API so the 32-team fetch only
// happens once per cache window, not once per feature.

import { NHL_TEAMS } from "./schedule";
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

let cache: { data: NhlRosterPlayer[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - rosters rarely change

// The roster endpoint rate-limits bursts of ~32 simultaneous requests (one
// per team) more aggressively than the schedule endpoint does, so fetches
// are staggered into small batches with a retry/backoff on 429s.
const BATCH_SIZE = 6;
const BATCH_DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTeamRoster(
  team: string,
  attempt = 0
): Promise<{ team: string; players: RawRosterPlayer[] }> {
  const res = await fetch(`https://api-web.nhle.com/v1/roster/${team}/current`, {
    next: { revalidate: 86400 },
  });
  if (res.status === 429 && attempt < 5) {
    await sleep(750 * 2 ** attempt);
    return fetchTeamRoster(team, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`NHL roster request failed for ${team}: ${res.status}`);
  }
  const data: RawRosterResponse = await res.json();
  return { team, players: [...data.forwards, ...data.defensemen, ...data.goalies] };
}

async function fetchAllRosters(): Promise<NhlRosterPlayer[]> {
  const out: NhlRosterPlayer[] = [];
  for (let i = 0; i < NHL_TEAMS.length; i += BATCH_SIZE) {
    const batch = NHL_TEAMS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((team) => fetchTeamRoster(team)));
    for (const { team, players } of batchResults) {
      for (const p of players) {
        const position = POSITION_CODE_MAP[p.positionCode];
        out.push({
          id: p.id,
          name: `${p.firstName.default} ${p.lastName.default}`,
          team,
          positions: position ? [position] : [],
          headshot: p.headshot,
        });
      }
    }
    if (i + BATCH_SIZE < NHL_TEAMS.length) await sleep(BATCH_DELAY_MS);
  }
  return out;
}

export async function getNhlRosterPlayers(forceRefresh = false): Promise<NhlRosterPlayer[]> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }
  const players = await fetchAllRosters();
  cache = { data: players, expiresAt: Date.now() + CACHE_TTL_MS };
  return players;
}
