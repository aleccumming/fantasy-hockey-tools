// Server-only. "Deployment Boost" - who's recently gotten meaningfully more
// ice time or power-play time than their established track record, the
// single biggest leading indicator of a fantasy breakout (production
// mostly follows opportunity, not the other way around). Compares a short
// recent window against last season as the baseline - deliberately NOT
// "earlier this season," since this season is still too young for that to
// mean anything yet, and a new-season deployment change (trade, new
// linemates, a coaching change) is exactly the signal this is built to
// catch early.
//
// The recent window is selectable (see DEPLOYMENT_WINDOWS below), not one
// fixed size - per explicit feedback, a real deployment bump is worth
// acting on fast (ideally off a single game), but a single game is also
// noisier than a few, so this computes every window size up front and
// lets the viewer pick, same tab pattern as the Skaters page's Last
// 5/Last 10/Season. Defaults to the fastest (Last Game) given the stated
// priority: "we want to be very quick with these decisions."
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
import { headshotPositionGroup } from "./headshots";

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

// Selectable "recent window" sizes, in order of how many of a team's most
// recent games count as "recent" - started as one fixed 10-game window,
// shrunk to a fixed 3 per feedback (a 10-game window was reacting far
// slower than an attentive fan would), then made selectable with Last
// Game added per further feedback (PP-unit bumps especially are worth
// acting on fast, ideally off a single game - but a single game is also
// noisier, so Last 3/Last 5 stay available as steadier alternate views).
export const DEPLOYMENT_WINDOWS = [1, 3, 5] as const;
export type DeploymentWindow = (typeof DEPLOYMENT_WINDOWS)[number];
export const DEFAULT_DEPLOYMENT_WINDOW: DeploymentWindow = 1;

export type DeploymentBoostsByWindow = Record<DeploymentWindow, RankedDeploymentPlayer[]>;

// Deliberately just 1, not tied to whichever window is selected - this
// tool's whole point is catching a real role change as early as possible,
// and a window can't contain more than a couple of real games in the
// season's first week or two anyway (caught live: a flat MIN_RECENT_GP of
// 3 excluded literally every player on opening week, including McDavid at
// 2 GP - the same class of early-season sample-size bug already hit twice
// elsewhere this session). A single game's TOI is noisier than an average
// over several, but the baseline comparison is what actually filters out
// noise here, not this floor.
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

// Real NHL players can share an exact name (confirmed live: two Sebastian
// Ahos, and two Elias Petterssons who are even on the same team, one
// forward one defenseman) - a plain name-keyed Map silently drops one of
// them at construction (Map keys must be unique, so the later row in the
// array wins), and whichever player loses ends up looking up the OTHER
// player's stats everywhere this key is used. Same name+team+position-
// group disambiguation already used for headshot lookups (headshots.ts),
// reused here via headshotPositionGroup rather than a third
// reimplementation of the same idea.
function playerKey(name: string, team: string, position: string): string {
  return `${normalizeName(name)}|${team}|${headshotPositionGroup([position])}`;
}

/** Two-tier lookup, same idea as headshots.ts: the specific name+team+
 *  position key resolves a collision correctly as long as the player
 *  hasn't changed teams between the two rows being matched (recent vs.
 *  baseline/last season) - but a trade WOULD change the recent row's
 *  team out from under a specific key built against it, so a plain-name
 *  fallback (first-wins) stays available for the (much more common, and
 *  not a collision) case of a player who's just been traded since last
 *  season. */
function byPlayerKey(rows: NstIndividualRow[]): Map<string, NstIndividualRow> {
  const map = new Map<string, NstIndividualRow>();
  for (const r of rows) {
    map.set(playerKey(r.name, r.team, r.position), r);
    const fallback = normalizeName(r.name);
    if (!map.has(fallback)) map.set(fallback, r);
  }
  return map;
}

function lookupPlayer(
  map: Map<string, NstIndividualRow>,
  name: string,
  team: string,
  position: string
): NstIndividualRow | undefined {
  return map.get(playerKey(name, team, position)) ?? map.get(normalizeName(name));
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

interface WindowRows {
  recentToiRows: NstIndividualRow[];
  recentPpRows: NstIndividualRow[];
}

/** Everything that doesn't depend on which recent window is selected -
 *  fetched once and reused across all of DEPLOYMENT_WINDOWS. */
interface BaselineData {
  baselineToiByName: Map<string, NstIndividualRow>;
  baselinePpByName: Map<string, NstIndividualRow>;
  baselinePpTeamTotals: Map<string, number>;
  baselineTeamGames: Map<string, number>;
}

function computeWindow(
  { recentToiRows, recentPpRows }: WindowRows,
  { baselineToiByName, baselinePpByName, baselinePpTeamTotals, baselineTeamGames }: BaselineData
): RankedDeploymentPlayer[] {
  const recentPpByName = byPlayerKey(recentPpRows);
  const recentPpTeamTotals = summedPpToiByTeam(recentPpRows);
  const recentTeamGames = teamGamesByTeam(recentToiRows);

  const players: DeploymentPlayer[] = [];
  for (const recent of recentToiRows) {
    if (recent.gp < MIN_RECENT_GP) continue;
    const baseline = lookupPlayer(baselineToiByName, recent.name, recent.team, recent.position);
    if (!baseline || baseline.gp < MIN_BASELINE_GP) continue; // no real last-season track record to compare against

    // Missing from the PP report entirely means real 0 PP time, not
    // missing data - a player who went from 0 PP time to getting some is
    // exactly the kind of boost this tool exists to catch. Looked up
    // using each row's OWN team/position (recent's for the recent PP
    // report, baseline's for the baseline PP report) rather than always
    // recent's, since a traded player's last-season team can differ from
    // their current one.
    const recentPp = lookupPlayer(recentPpByName, recent.name, recent.team, recent.position);
    const baselinePp = lookupPlayer(baselinePpByName, baseline.name, baseline.team, baseline.position);

    const recentToiPerGame = toiPerGame(recent);
    const baselineToiPerGame = toiPerGame(baseline);
    const recentPpToiPerGame = toiPerGame(recentPp);
    const baselinePpToiPerGame = toiPerGame(baselinePp);
    const recentPpShare = ppShare(recentPp, recent.gp, recentPpTeamTotals, recentTeamGames);
    const baselinePpShare = ppShare(baselinePp, baseline.gp, baselinePpTeamTotals, baselineTeamGames);

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

  return ranked.sort((a, b) => a.deploymentScore - b.deploymentScore);
}

let cache: { data: DeploymentBoostsByWindow; expiresAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours - same cadence as the other NST-backed tools

export async function getDeploymentBoosts(forceRefresh = false): Promise<DeploymentBoostsByWindow> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const season = await currentNstSeason();
  const lastSeason = previousNstSeason(season);

  const windowFetches = DEPLOYMENT_WINDOWS.map(
    async (games): Promise<[DeploymentWindow, WindowRows]> => {
      const [recentToiRows, recentPpRows] = await Promise.all([
        fetchIndividualStats({
          fromSeason: season,
          thruSeason: season,
          gameRange: { type: "teamGames", games },
          situation: "all",
        }),
        fetchIndividualStats({
          fromSeason: season,
          thruSeason: season,
          gameRange: { type: "teamGames", games },
          situation: "pp",
        }),
      ]);
      return [games, { recentToiRows, recentPpRows }];
    }
  );

  const [windowResults, baselineToiRows, baselinePpRows] = await Promise.all([
    Promise.all(windowFetches),
    fetchIndividualStats({ fromSeason: lastSeason, thruSeason: lastSeason, gameRange: { type: "none" }, situation: "all" }),
    fetchIndividualStats({ fromSeason: lastSeason, thruSeason: lastSeason, gameRange: { type: "none" }, situation: "pp" }),
  ]);

  const baselineData: BaselineData = {
    baselineToiByName: byPlayerKey(baselineToiRows),
    baselinePpByName: byPlayerKey(baselinePpRows),
    baselinePpTeamTotals: summedPpToiByTeam(baselinePpRows),
    baselineTeamGames: teamGamesByTeam(baselineToiRows),
  };

  const data = Object.fromEntries(
    windowResults.map(([games, rows]) => [games, computeWindow(rows, baselineData)])
  ) as DeploymentBoostsByWindow;

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
