// Server-only. "Deployment Boost" - who's recently gotten meaningfully more
// ice time or power-play time than their established track record, the
// single biggest leading indicator of a fantasy breakout (production
// mostly follows opportunity, not the other way around).
//
// "Recent" is always the single most recent game - per explicit feedback,
// a real deployment bump is worth acting on as fast as possible, since
// once it's visible to anyone paying attention, everyone else is jumping
// on the player too. What's SELECTABLE is the baseline to compare that
// game against (see DEPLOYMENT_BASELINES below) - the previous game (the
// fastest, noisiest signal), the 3 games before that, this season so far,
// or last season (the most stable, least noisy baseline, and the only one
// that means anything in the season's first couple of weeks).
//
// Every baseline except "last season" is isolated by SUBTRACTION (a
// larger cumulative window minus the most recent game) rather than fetched
// directly, so the most recent game is never counted on both sides of its
// own comparison - e.g. "last 3 games" means the 3 games BEFORE the most
// recent one, not the most recent 3 including it.
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
import { buildPlayerIdentityMap, lookupPlayerIdentity } from "./player-identity-key";

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

// Selectable baselines to compare the most recent game against - see file
// header for why "recent" itself isn't selectable (always the most recent
// game) while the baseline is.
export const DEPLOYMENT_BASELINES = ["previousGame", "last3Games", "thisSeason", "lastSeason"] as const;
export type DeploymentBaseline = (typeof DEPLOYMENT_BASELINES)[number];
export const DEFAULT_DEPLOYMENT_BASELINE: DeploymentBaseline = "lastSeason";

export type DeploymentBoostsByBaseline = Record<DeploymentBaseline, RankedDeploymentPlayer[]>;

// The most recent game needs no floor beyond "played in it" - this tool's
// whole point is catching a role change as early as possible (caught live
// earlier: a flat floor of 3 excluded literally every player on opening
// week, including McDavid at 2 GP - the same class of early-season
// sample-size bug already hit twice elsewhere this session).
const MIN_RECENT_GP = 1;

// Per baseline: the isolated windows (previous game, last 3 games, this
// season so far) can't realistically clear a double-digit floor early in
// a season, so they just need SOME games to compare against. Last season
// is a full season, so it keeps the stricter floor - below it, the
// baseline itself is too thin to trust (also naturally excludes true
// rookies with no real prior-season track record, who have nothing to
// compare against yet).
const MIN_BASELINE_GP: Record<DeploymentBaseline, number> = {
  previousGame: 1,
  last3Games: 1,
  thisSeason: 1,
  lastSeason: 10,
};

function toiPerGame(row: NstIndividualRow | undefined): number {
  if (!row || row.gp <= 0) return 0;
  return row.toi / row.gp;
}

// Real NHL players can share an exact name (confirmed live: two Sebastian
// Ahos, and two Elias Petterssons who are even on the same team, one
// forward one defenseman) - a plain name-keyed Map silently drops one of
// them at construction (Map keys must be unique, so the later row in the
// array wins), and whichever player loses ends up looking up the OTHER
// player's stats everywhere this key is used. Shared name+team+position-
// group disambiguation (player-identity-key.ts, same scheme headshot
// lookups and the Yahoo eligibility override already use - this bug class
// turned out to need the same fix in all three places, not just here).
function byPlayerKey(rows: NstIndividualRow[]): Map<string, NstIndividualRow> {
  return buildPlayerIdentityMap(
    rows,
    (r) => r.name,
    (r) => r.team,
    (r) => [r.position]
  );
}

function lookupPlayer(
  map: Map<string, NstIndividualRow>,
  name: string,
  team: string,
  position: string
): NstIndividualRow | undefined {
  return lookupPlayerIdentity(map, name, team, [position]);
}

/** Isolates a middle stretch of games by subtracting a smaller cumulative
 *  window from a larger one that contains it (e.g. last 4 games minus the
 *  most recent 1 = the 3 games before that) - only gp/toi are subtracted
 *  correctly, since those are the only fields this tool reads from these
 *  rows; every other field is carried over from the larger window as-is
 *  and should be treated as meaningless on the result (not used anywhere
 *  here, but worth knowing if this gets reused for something else later).
 *  A player who didn't play in the isolated stretch (gp comes out <= 0)
 *  is dropped rather than kept at zero, same as "missing from the report
 *  entirely" elsewhere in this file. */
function subtractRows(larger: NstIndividualRow[], smaller: NstIndividualRow[]): NstIndividualRow[] {
  const smallerByKey = byPlayerKey(smaller);
  const result: NstIndividualRow[] = [];
  for (const row of larger) {
    const sub = lookupPlayer(smallerByKey, row.name, row.team, row.position);
    const gp = row.gp - (sub?.gp ?? 0);
    const toi = row.toi - (sub?.toi ?? 0);
    if (gp <= 0) continue;
    result.push({ ...row, gp, toi });
  }
  return result;
}

// A power play is skated 5-on-4 (or 5-on-3) the overwhelming majority of
// the time - the advantaged team deploys 5 skaters either way, since more
// room is a reason to keep all 5 out, not fewer. So summing every
// individual skater's PP TOI for a team and dividing by 5 gives an
// accurate stand-in for the team's real wall-clock PP time, matching how
// a real line-combination report computes "% of team PP time" (looked
// into pulling that number directly from NST's team-level report
// instead, which does exist - but live testing showed it's flaky
// (intermittent empty responses) and repeatedly retrying it risked
// tripping NST's abuse detection on the API key this whole app depends
// on, for a number this approximation already gets right without an
// extra fetch or that risk).
const SKATERS_ON_ICE_DURING_PP = 5;

/** Sums every tracked skater's PP TOI per team (not yet divided by 5 -
 *  see ppShare for why the /5 happens per-player instead, scaled to how
 *  many games THAT player actually appeared in). */
function summedPpToiByTeam(rows: NstIndividualRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.team, (totals.get(r.team) ?? 0) + r.toi);
  }
  return totals;
}

/** Each team's games played in the window, via the highest single
 *  player's GP seen on that team - same proxy approach used elsewhere in
 *  this app (e.g. seasonMinToi in player-evaluator-service.ts) rather
 *  than a separate schedule lookup. */
function teamGamesByTeam(rows: NstIndividualRow[]): Map<string, number> {
  const games = new Map<string, number>();
  for (const r of rows) {
    if (r.gp > (games.get(r.team) ?? 0)) games.set(r.team, r.gp);
  }
  return games;
}

/** This player's share of their team's PP time - but the team total is
 *  scaled down to just the games THIS player actually appeared in
 *  (playerGp / team's games), not the team's full window total. Without
 *  that scaling, a player who missed a chunk of the window (injury,
 *  trade, healthy scratch) reads as having a much smaller share than
 *  they really did when active, since the denominator still includes all
 *  the PP time their replacement racked up while they were out -
 *  confirmed live with a real case: Matthew Tkachuk played only 31 of
 *  FLA's 80 games last season (missed significant time to injury, per a
 *  user report), and came out to a 26% PP share against the unscaled
 *  full-season denominator vs. a real 67% once scaled to just his own 31
 *  games - 26% doesn't pass the smell test for a top-pairing PP1 forward,
 *  67% does. */
function ppShare(
  row: NstIndividualRow | undefined,
  playerGp: number,
  summedTeamPpToi: Map<string, number>,
  teamGames: Map<string, number>
): number {
  if (!row || playerGp <= 0) return 0;
  const summedTotal = summedTeamPpToi.get(row.team) ?? 0;
  const gamesForTeam = teamGames.get(row.team) ?? 0;
  if (summedTotal <= 0 || gamesForTeam <= 0) return 0;
  const scaledTeamTotal = (summedTotal * (playerGp / gamesForTeam)) / SKATERS_ON_ICE_DURING_PP;
  if (scaledTeamTotal <= 0) return 0;
  return row.toi / scaledTeamTotal;
}

interface SituationRows {
  toiRows: NstIndividualRow[];
  ppRows: NstIndividualRow[];
}

function computeDeployment(
  recent: SituationRows,
  baseline: SituationRows,
  minBaselineGp: number
): RankedDeploymentPlayer[] {
  const baselineToiByName = byPlayerKey(baseline.toiRows);
  const baselinePpByName = byPlayerKey(baseline.ppRows);
  const baselinePpTeamTotals = summedPpToiByTeam(baseline.ppRows);
  const baselineTeamGames = teamGamesByTeam(baseline.toiRows);

  const recentPpByName = byPlayerKey(recent.ppRows);
  const recentPpTeamTotals = summedPpToiByTeam(recent.ppRows);
  const recentTeamGames = teamGamesByTeam(recent.toiRows);

  const players: DeploymentPlayer[] = [];
  for (const r of recent.toiRows) {
    if (r.gp < MIN_RECENT_GP) continue;
    const b = lookupPlayer(baselineToiByName, r.name, r.team, r.position);
    if (!b || b.gp < minBaselineGp) continue; // no real baseline track record to compare against

    // Missing from the PP report entirely means real 0 PP time, not
    // missing data - a player who went from 0 PP time to getting some is
    // exactly the kind of boost this tool exists to catch. Looked up
    // using each row's OWN team/position (recent's for the recent PP
    // report, baseline's for the baseline PP report) rather than always
    // recent's, since a traded player's baseline-window team can differ
    // from their current one.
    const recentPp = lookupPlayer(recentPpByName, r.name, r.team, r.position);
    const baselinePp = lookupPlayer(baselinePpByName, b.name, b.team, b.position);

    const recentToiPerGame = toiPerGame(r);
    const baselineToiPerGame = toiPerGame(b);
    const recentPpToiPerGame = toiPerGame(recentPp);
    const baselinePpToiPerGame = toiPerGame(baselinePp);
    const recentPpShare = ppShare(recentPp, r.gp, recentPpTeamTotals, recentTeamGames);
    const baselinePpShare = ppShare(baselinePp, b.gp, baselinePpTeamTotals, baselineTeamGames);

    players.push({
      name: r.name,
      team: r.team,
      positions: [r.position],
      recentGamesPlayed: r.gp,
      recentToiPerGame,
      recentPpToiPerGame,
      baselineGamesPlayed: b.gp,
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

  return ranked.sort((a, b) => a.deploymentScore - b.deploymentScore);
}

let cache: { data: DeploymentBoostsByBaseline; expiresAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours - same cadence as the other NST-backed tools

export async function getDeploymentBoosts(forceRefresh = false): Promise<DeploymentBoostsByBaseline> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const season = await currentNstSeason();
  const lastSeason = previousNstSeason(season);

  function fetchGames(games: number | null, fromSeason: string, thruSeason: string): Promise<SituationRows> {
    const gameRange = games === null ? ({ type: "none" } as const) : ({ type: "teamGames", games } as const);
    return Promise.all([
      fetchIndividualStats({ fromSeason, thruSeason, gameRange, situation: "all" }),
      fetchIndividualStats({ fromSeason, thruSeason, gameRange, situation: "pp" }),
    ]).then(([toiRows, ppRows]) => ({ toiRows, ppRows }));
  }

  const [window1, window2, window4, thisSeasonFull, lastSeasonFull] = await Promise.all([
    fetchGames(1, season, season),
    fetchGames(2, season, season),
    fetchGames(4, season, season),
    fetchGames(null, season, season),
    fetchGames(null, lastSeason, lastSeason),
  ]);

  const recent = window1; // always the single most recent game

  const baselinesBySource: Record<Exclude<DeploymentBaseline, "lastSeason">, SituationRows> = {
    // The game right before the most recent one: window(2) contains both,
    // subtracting window(1) isolates just the earlier of the two.
    previousGame: {
      toiRows: subtractRows(window2.toiRows, window1.toiRows),
      ppRows: subtractRows(window2.ppRows, window1.ppRows),
    },
    // The 3 games before the most recent one: window(4) contains all 4,
    // subtracting window(1) leaves the 3 before it.
    last3Games: {
      toiRows: subtractRows(window4.toiRows, window1.toiRows),
      ppRows: subtractRows(window4.ppRows, window1.ppRows),
    },
    // This season so far, EXCLUDING the most recent game - otherwise the
    // most recent game would be compared partly against itself.
    thisSeason: {
      toiRows: subtractRows(thisSeasonFull.toiRows, window1.toiRows),
      ppRows: subtractRows(thisSeasonFull.ppRows, window1.ppRows),
    },
  };

  const data: DeploymentBoostsByBaseline = {
    previousGame: computeDeployment(recent, baselinesBySource.previousGame, MIN_BASELINE_GP.previousGame),
    last3Games: computeDeployment(recent, baselinesBySource.last3Games, MIN_BASELINE_GP.last3Games),
    thisSeason: computeDeployment(recent, baselinesBySource.thisSeason, MIN_BASELINE_GP.thisSeason),
    // A separate season entirely - no subtraction needed, the most recent
    // game can't double-count against a different season's totals.
    lastSeason: computeDeployment(recent, lastSeasonFull, MIN_BASELINE_GP.lastSeason),
  };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
