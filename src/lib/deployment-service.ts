// Server-only. "Deployment Boost" - who's recently gotten meaningfully more
// ice time or power-play time than their established track record, the
// single biggest leading indicator of a fantasy breakout (production
// mostly follows opportunity, not the other way around). Compares a short
// recent window against last season as the baseline - deliberately NOT
// "earlier this season," since this season is still too young for that to
// mean anything yet, and a new-season deployment change (trade, new
// linemates, a coaching change) is exactly the signal this is built to
// catch early. The recent window itself is intentionally short (see
// RECENT_GAMES below) - a real deployment change is usually obvious to
// anyone paying attention within a game or two, so the tool should be at
// least that responsive, not slower.
//
// Scoped to ice-time signals only (5v5+PP TOI), not linemate identity -
// NST's public bot API (the same one this app already uses everywhere
// else) doesn't expose line-combination data, only aggregate ice time per
// situation. A real PP-unit promotion or 5v5 role change is a strong
// proxy for "better linemates" even without naming them. (Looked into
// gamedaytweets.com and frozenpool.dobbersports.com's "Last Game Lines"
// report as real confirmed-line sources - gamedaytweets is blocked from
// Vercel's IPs, see ROADMAP.md; frozenpool's actual line data never
// appeared in a plain unauthenticated fetch, which points to it being
// gated behind their paid "Frozen Tools" subscription rather than being
// a scrapeable public page - not pursued further for that reason.)
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
  /** Raw PP minutes/game delta - shown for context, but NOT what the
   *  composite score ranks on (see ppShareDelta for why). */
  ppToiDelta: number;
  /** This player's share of their OWN TEAM's total PP ice time in the
   *  window (0-1) - what actually answers "are they on PP1," unlike raw
   *  PP minutes, which is confounded by how many power plays the team
   *  even got that window (a team that drew few penalties gives everyone
   *  low raw PP TOI regardless of unit, while a true PP1 player still
   *  claims the same large SHARE of whatever PP time existed). Same
   *  share-of-team-total pattern already used for goalie starts
   *  (recentShare in goalie-tracking-service.ts). */
  recentPpShare: number;
  baselinePpShare: number;
  /** recentPpShare - baselinePpShare, in share points (e.g. 0.15 = moved
   *  up 15 percentage points of the team's PP pie) - the real PP1-vs-PP2
   *  signal, and what the composite score ranks on. */
  ppShareDelta: number;
}

export interface RankedDeploymentPlayer extends DeploymentPlayer {
  toiDeltaRank: number;
  ppShareDeltaRank: number;
  /** Average of the two deltas' ranks - lower is a bigger boost, same
   *  "lower is better" convention as C-Score elsewhere in this app. */
  deploymentScore: number;
}

// How many of a team's most recent games count as "recent" - short on
// purpose (shrunk from an initial 10, per explicit feedback: a real
// deployment change is obvious to an attentive fan within a game or two,
// so a 10-game window was reacting far slower than a human would).
export const RECENT_GAMES = 3;

// Deliberately just 1, not RECENT_GAMES itself - this tool's whole point
// is catching a real role change as early as possible, and the window
// can't contain more than a couple of real games in the season's first
// week or two anyway (caught live: a flat MIN_RECENT_GP of 3 excluded
// literally every player on opening week, including McDavid at 2 GP - the
// same class of early-season sample-size bug already hit twice elsewhere
// this session). A single game's TOI is noisier than an average over
// several, but the baseline comparison is what actually filters out noise
// here, not this floor.
// Below this many games LAST season, the baseline itself is too thin to
// trust (also naturally excludes true rookies with no real prior-season
// track record, who have nothing to compare against yet) - this one isn't
// subject to the early-season problem since last season is already over.
const MIN_RECENT_GP = 1;
const MIN_BASELINE_GP = 10;

function toiPerGame(row: NstIndividualRow | undefined): number {
  if (!row || row.gp <= 0) return 0;
  return row.toi / row.gp;
}

function byName(rows: NstIndividualRow[]): Map<string, NstIndividualRow> {
  return new Map(rows.map((r) => [normalizeName(r.name), r]));
}

/** Sums every tracked player's PP TOI per team, from the same rows already
 *  being fetched - the denominator for "share of the team's PP time,"
 *  no separate team-level fetch needed. */
function ppToiByTeam(rows: NstIndividualRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.team, (totals.get(r.team) ?? 0) + r.toi);
  }
  return totals;
}

function ppShare(row: NstIndividualRow | undefined, teamTotals: Map<string, number>): number {
  if (!row) return 0;
  const teamTotal = teamTotals.get(row.team) ?? 0;
  if (teamTotal <= 0) return 0;
  return row.toi / teamTotal;
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
      gameRange: { type: "teamGames", games: RECENT_GAMES },
      situation: "all",
    }),
    fetchIndividualStats({
      fromSeason: season,
      thruSeason: season,
      gameRange: { type: "teamGames", games: RECENT_GAMES },
      situation: "pp",
    }),
    fetchIndividualStats({ fromSeason: lastSeason, thruSeason: lastSeason, gameRange: { type: "none" }, situation: "all" }),
    fetchIndividualStats({ fromSeason: lastSeason, thruSeason: lastSeason, gameRange: { type: "none" }, situation: "pp" }),
  ]);

  const recentPpByName = byName(recentPpRows);
  const baselineToiByName = byName(baselineToiRows);
  const baselinePpByName = byName(baselinePpRows);
  const recentPpTeamTotals = ppToiByTeam(recentPpRows);
  const baselinePpTeamTotals = ppToiByTeam(baselinePpRows);

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
    const recentPpShare = ppShare(recentPp, recentPpTeamTotals);
    const baselinePpShare = ppShare(baselinePp, baselinePpTeamTotals);

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
      recentPpShare,
      baselinePpShare,
      ppShareDelta: recentPpShare - baselinePpShare,
    });
  }

  // Rank by each delta separately (bigger positive delta = rank 1), same
  // "average several underlying metric ranks" approach as C-Score, so the
  // composite score reads the same way (lower = better/bigger boost). Uses
  // ppShareDelta, not raw ppToiDelta, as the PP signal - see ppShareDelta's
  // doc comment for why share is the real PP1-vs-PP2 signal and raw
  // minutes isn't.
  const byToiDelta = [...players].sort((a, b) => b.toiDelta - a.toiDelta);
  const toiDeltaRanks = new Map<DeploymentPlayer, number>();
  byToiDelta.forEach((p, i) => toiDeltaRanks.set(p, i + 1));

  const byPpShareDelta = [...players].sort((a, b) => b.ppShareDelta - a.ppShareDelta);
  const ppShareDeltaRanks = new Map<DeploymentPlayer, number>();
  byPpShareDelta.forEach((p, i) => ppShareDeltaRanks.set(p, i + 1));

  const ranked: RankedDeploymentPlayer[] = players.map((p) => {
    const toiDeltaRank = toiDeltaRanks.get(p)!;
    const ppShareDeltaRank = ppShareDeltaRanks.get(p)!;
    return { ...p, toiDeltaRank, ppShareDeltaRank, deploymentScore: (toiDeltaRank + ppShareDeltaRank) / 2 };
  });

  const data = ranked.sort((a, b) => a.deploymentScore - b.deploymentScore);
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
