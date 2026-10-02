// Server-only. "Deployment Boost" - who's recently gotten meaningfully more
// ice time or power-play time than their established track record, the
// single biggest leading indicator of a fantasy breakout (production
// mostly follows opportunity, not the other way around). Compares a
// recent window (Last 10 Games) against last season as the baseline -
// deliberately NOT "earlier this season," since this season is still too
// young for that to mean anything yet, and a new-season deployment change
// (trade, new linemates, a coaching change) is exactly the signal this is
// built to catch early.
//
// Scoped to ice-time signals only (5v5+PP TOI), not linemate identity -
// NST's public bot API (the same one this app already uses everywhere
// else) doesn't expose line-combination data, only aggregate ice time per
// situation. A real PP-unit promotion or 5v5 role change is a strong
// proxy for "better linemates" even without naming them.
import type { Position } from "./types";
import { fetchIndividualStats, currentNstSeason, previousNstSeason, type NstIndividualRow } from "./nst-client";
import { normalizeName } from "./name-matching";

export interface DeploymentPlayer {
  name: string;
  team: string;
  positions: Position[];
  recentGamesPlayed: number;
  recentToiPerGame: number;
  recentPpToiPerGame: number;
  baselineGamesPlayed: number;
  baselineToiPerGame: number;
  baselinePpToiPerGame: number;
  /** recent - baseline, in minutes/game. Positive = more trusted now. */
  toiDelta: number;
  ppToiDelta: number;
}

export interface RankedDeploymentPlayer extends DeploymentPlayer {
  toiDeltaRank: number;
  ppToiDeltaRank: number;
  /** Average of the two deltas' ranks - lower is a bigger boost, same
   *  "lower is better" convention as C-Score elsewhere in this app. */
  deploymentScore: number;
}

// Below this many games in the recent window, a single emergency call-up
// or a couple of late-season appearances isn't a real deployment signal -
// just noise. Below this many games LAST season, the baseline itself is
// too thin to trust (also naturally excludes true rookies with no real
// prior-season track record, who have nothing to compare against yet).
const MIN_RECENT_GP = 3;
const MIN_BASELINE_GP = 10;

function toiPerGame(row: NstIndividualRow | undefined): number {
  if (!row || row.gp <= 0) return 0;
  return row.toi / row.gp;
}

function byName(rows: NstIndividualRow[]): Map<string, NstIndividualRow> {
  return new Map(rows.map((r) => [normalizeName(r.name), r]));
}

let cache: { data: RankedDeploymentPlayer[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours - same cadence as the other NST-backed tools

export async function getDeploymentBoosts(forceRefresh = false): Promise<RankedDeploymentPlayer[]> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const season = await currentNstSeason();
  const lastSeason = previousNstSeason(season);

  const [recentToiRows, recentPpRows, baselineToiRows, baselinePpRows] = await Promise.all([
    fetchIndividualStats({
      fromSeason: season,
      thruSeason: season,
      gameRange: { type: "teamGames", games: 10 },
      situation: "all",
    }),
    fetchIndividualStats({
      fromSeason: season,
      thruSeason: season,
      gameRange: { type: "teamGames", games: 10 },
      situation: "pp",
    }),
    fetchIndividualStats({ fromSeason: lastSeason, thruSeason: lastSeason, gameRange: { type: "none" }, situation: "all" }),
    fetchIndividualStats({ fromSeason: lastSeason, thruSeason: lastSeason, gameRange: { type: "none" }, situation: "pp" }),
  ]);

  const recentPpByName = byName(recentPpRows);
  const baselineToiByName = byName(baselineToiRows);
  const baselinePpByName = byName(baselinePpRows);

  const players: DeploymentPlayer[] = [];
  for (const recent of recentToiRows) {
    if (recent.gp < MIN_RECENT_GP) continue;
    const key = normalizeName(recent.name);
    const baseline = baselineToiByName.get(key);
    if (!baseline || baseline.gp < MIN_BASELINE_GP) continue; // no real last-season track record to compare against

    // Missing from the PP report entirely means real 0 PP time, not
    // missing data - a player who went from 0 PP time to getting some is
    // exactly the kind of boost this tool exists to catch.
    const recentPp = recentPpByName.get(key);
    const baselinePp = baselinePpByName.get(key);

    const recentToiPerGame = toiPerGame(recent);
    const baselineToiPerGame = toiPerGame(baseline);
    const recentPpToiPerGame = toiPerGame(recentPp);
    const baselinePpToiPerGame = toiPerGame(baselinePp);

    players.push({
      name: recent.name,
      team: recent.team,
      positions: [recent.position],
      recentGamesPlayed: recent.gp,
      recentToiPerGame,
      recentPpToiPerGame,
      baselineGamesPlayed: baseline.gp,
      baselineToiPerGame,
      baselinePpToiPerGame,
      toiDelta: recentToiPerGame - baselineToiPerGame,
      ppToiDelta: recentPpToiPerGame - baselinePpToiPerGame,
    });
  }

  // Rank by each delta separately (bigger positive delta = rank 1), same
  // "average several underlying metric ranks" approach as C-Score, so the
  // composite score reads the same way (lower = better/bigger boost).
  const byToiDelta = [...players].sort((a, b) => b.toiDelta - a.toiDelta);
  const toiDeltaRanks = new Map<DeploymentPlayer, number>();
  byToiDelta.forEach((p, i) => toiDeltaRanks.set(p, i + 1));

  const byPpToiDelta = [...players].sort((a, b) => b.ppToiDelta - a.ppToiDelta);
  const ppToiDeltaRanks = new Map<DeploymentPlayer, number>();
  byPpToiDelta.forEach((p, i) => ppToiDeltaRanks.set(p, i + 1));

  const ranked: RankedDeploymentPlayer[] = players.map((p) => {
    const toiDeltaRank = toiDeltaRanks.get(p)!;
    const ppToiDeltaRank = ppToiDeltaRanks.get(p)!;
    return { ...p, toiDeltaRank, ppToiDeltaRank, deploymentScore: (toiDeltaRank + ppToiDeltaRank) / 2 };
  });

  const data = ranked.sort((a, b) => a.deploymentScore - b.deploymentScore);
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
