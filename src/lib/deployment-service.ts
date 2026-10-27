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
import {
  fetchIndividualStats,
  fetchOnIceStats,
  currentNstSeason,
  previousNstSeason,
  type NstIndividualRow,
  type NstOnIceRow,
} from "./nst-client";
import { playerIdentityKey, playerNameGroupKey } from "./player-identity-key";
import { getNstCached, saveNstCached, type NstCached } from "./nst-data-cache";
import { DEPLOYMENT_ROLE_WINDOWS } from "./deployment-types";
import type {
  DeploymentPlayer,
  RankedDeploymentPlayer,
  DeploymentBaseline,
  DeploymentBoostsByBaseline,
  DeploymentRolePlayer,
  DeploymentRolesByWindow,
  DeploymentCacheData,
  DeploymentGameLine,
} from "./deployment-types";

// Re-exported so existing server-side imports from "./deployment-service"
// (the API route, the cron) keep working - client code should import these
// from "./deployment-types" directly instead, to avoid pulling this
// module's DB dependency (nst-data-cache.ts -> @/db -> pg) into the
// browser bundle.
export { DEPLOYMENT_BASELINES, DEFAULT_DEPLOYMENT_BASELINE } from "./deployment-types";
export type { DeploymentPlayer, RankedDeploymentPlayer, DeploymentBaseline, DeploymentBoostsByBaseline } from "./deployment-types";

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
// The fallback (a player traded between windows) is name+F/D rather than
// plain name: a player missing from a window - didn't play in it - must
// not pick up their same-name teammate's row instead (the VAN Petterssons
// split on F vs D).
function byPlayerKey(rows: NstIndividualRow[]): Map<string, NstIndividualRow> {
  const map = new Map<string, NstIndividualRow>();
  for (const r of rows) {
    map.set(playerIdentityKey(r.name, r.team, [r.position]), r);
    const fallback = playerNameGroupKey(r.name, [r.position]);
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
  return map.get(playerIdentityKey(name, team, [position])) ?? map.get(playerNameGroupKey(name, [position]));
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
 *  67% does.
 *
 *  Still an estimate - it assumes the team's PP time was spread evenly
 *  across its games, which can overshoot when a player happened to play
 *  the PP-heavy ones, so it's capped at 100%. The short role windows use
 *  the exact teamPpInPlayedGames below instead. */
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
  return Math.min(1, row.toi / scaledTeamTotal);
}

/** The exact PP-share denominator for a short window: the team's real PP
 *  time in just the games this player played, instead of ppShare's
 *  evenly-spread estimate - over 3 games that estimate was badly off
 *  (caught live: Wyatt Johnston played only the one DAL game holding most
 *  of the team's 3-game PP time, and read as 137%). cumulative[i] is the
 *  last i+1 team games, so differencing neighbours recovers game i on its
 *  own: the team's PP time in it, and whether the player's GP went up
 *  (they played it). */
function teamPpInPlayedGames(cumulative: SituationRows[]): (r: NstIndividualRow) => number {
  const toiByKey = cumulative.map((w) => byPlayerKey(w.toiRows));
  const ppTotals = cumulative.map((w) => summedPpToiByTeam(w.ppRows));
  return (r) => {
    let total = 0;
    for (let i = 0; i < cumulative.length; i++) {
      const gp = lookupPlayer(toiByKey[i], r.name, r.team, r.position)?.gp ?? 0;
      const prevGp = i > 0 ? (lookupPlayer(toiByKey[i - 1], r.name, r.team, r.position)?.gp ?? 0) : 0;
      if (gp <= prevGp) continue;
      const prevTeamPp = i > 0 ? (ppTotals[i - 1].get(r.team) ?? 0) : 0;
      total += ((ppTotals[i].get(r.team) ?? 0) - prevTeamPp) / SKATERS_ON_ICE_DURING_PP;
    }
    return total;
  };
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

/** Every skater who played in the window, at their raw deployment level
 *  there - no baseline floor, since this is for finding who's being used
 *  now, not who changed. exactTeamPp, when given, replaces ppShare's
 *  estimated denominator (see teamPpInPlayedGames). */
function computeRoles(
  rows: SituationRows,
  exactTeamPp?: (r: NstIndividualRow) => number
): DeploymentRolePlayer[] {
  const ppByName = byPlayerKey(rows.ppRows);
  const ppTeamTotals = summedPpToiByTeam(rows.ppRows);
  const teamGames = teamGamesByTeam(rows.toiRows);

  return rows.toiRows
    .filter((r) => r.gp > 0)
    .map((r) => {
      const pp = lookupPlayer(ppByName, r.name, r.team, r.position);
      let share: number;
      if (exactTeamPp) {
        const teamPp = exactTeamPp(r);
        share = pp && teamPp > 0 ? Math.min(1, pp.toi / teamPp) : 0;
      } else {
        share = ppShare(pp, r.gp, ppTeamTotals, teamGames);
      }
      return {
        name: r.name,
        team: r.team,
        positions: [r.position],
        gamesPlayed: r.gp,
        toiPerGame: toiPerGame(r),
        ppToiPerGame: toiPerGame(pp),
        ppShare: share,
      };
    });
}

/** Every skater's box score from the team's most recent game - the same
 *  last-1-game reports the deployment comparisons already fetch, plus a
 *  5v5 on-ice report for that game. Missing from the PP report means no PP
 *  time (and so no PP points), same as computeDeployment. */
function computeGameLines(rows: SituationRows, onIce5v5Rows: NstOnIceRow[]): DeploymentGameLine[] {
  const ppByName = byPlayerKey(rows.ppRows);
  const onIceByKey = new Map<string, NstOnIceRow>();
  for (const r of onIce5v5Rows) onIceByKey.set(playerIdentityKey(r.name, r.team, [r.position]), r);
  return rows.toiRows
    .filter((r) => r.gp > 0)
    .map((r) => {
      const pp = lookupPlayer(ppByName, r.name, r.team, r.position);
      // Same report, same game, so team+position always line up - no
      // traded-player fallback needed.
      const oi = onIceByKey.get(playerIdentityKey(r.name, r.team, [r.position]));
      return {
        name: r.name,
        team: r.team,
        positions: [r.position],
        toi: r.toi,
        ppToi: pp?.toi ?? 0,
        goals: r.goals,
        assists: r.assists,
        ppGoals: pp?.goals ?? 0,
        ppAssists: pp?.assists ?? 0,
        shots: r.shots,
        icf: r.icf,
        iff: r.iff,
        iscf: r.iscf,
        ihdcf: r.ihdcf,
        ixg: r.ixg,
        hits: r.hits,
        blocks: r.blocks,
        pim: r.pim,
        onIce5v5: oi
          ? {
              toi: oi.toi,
              cf: oi.cf,
              ca: oi.ca,
              sf: oi.sf,
              sa: oi.sa,
              gf: oi.gf,
              ga: oi.ga,
              xgf: oi.xgf,
              xga: oi.xga,
              scf: oi.scf,
              sca: oi.sca,
              hdcf: oi.hdcf,
              hdca: oi.hdca,
              ozStarts: oi.ozStarts,
              dzStarts: oi.dzStarts,
            }
          : null,
      };
    });
}

/** What every page request calls - never talks to NST directly. Reads the
 *  DB row the daily cron (or the Refresh button) last wrote; only falls
 *  back to a live fetch if that row has genuinely never been seeded yet.
 *  roles is null for a row written before roles (or the current role
 *  windows) existed, until the next refresh rewrites it - lastGame the
 *  same for rows written before game lines existed. */
export async function getDeploymentBoosts(): Promise<
  NstCached<{
    baselines: DeploymentBoostsByBaseline;
    roles: DeploymentRolesByWindow | null;
    lastGame: DeploymentGameLine[] | null;
  }>
> {
  const { data, updatedAt } = await getNstCached<DeploymentCacheData | DeploymentBoostsByBaseline>(
    "deployment",
    refreshDeploymentCache
  );
  if ("baselines" in data) {
    // A row written before the current set of role windows reads as "no
    // roles yet" until the next refresh, rather than a window with no rows.
    const rolesCurrent = data.roles && DEPLOYMENT_ROLE_WINDOWS.every((w) => Array.isArray(data.roles[w]));
    return {
      data: { baselines: data.baselines, roles: rolesCurrent ? data.roles : null, lastGame: data.lastGame ?? null },
      updatedAt,
    };
  }
  return { data: { baselines: data, roles: null, lastGame: null }, updatedAt };
}

/** The real live NST fetch + computation - only the cron, the Refresh button
 *  (/api/refresh-stats) and the bootstrap fallback above call this. */
export async function refreshDeploymentCache(): Promise<NstCached<DeploymentCacheData>> {
  const season = await currentNstSeason();
  const lastSeason = previousNstSeason(season);

  function fetchGames(games: number | null, fromSeason: string, thruSeason: string): Promise<SituationRows> {
    const gameRange = games === null ? ({ type: "none" } as const) : ({ type: "teamGames", games } as const);
    return Promise.all([
      fetchIndividualStats({ fromSeason, thruSeason, gameRange, situation: "all" }),
      fetchIndividualStats({ fromSeason, thruSeason, gameRange, situation: "pp" }),
    ]).then(([toiRows, ppRows]) => ({ toiRows, ppRows }));
  }

  const [window1, window2, window3, window4, window5, window10, thisSeasonFull, lastSeasonFull, onIce1] = await Promise.all([
    fetchGames(1, season, season),
    fetchGames(2, season, season),
    fetchGames(3, season, season), // roles only
    fetchGames(4, season, season),
    fetchGames(5, season, season), // roles only
    fetchGames(10, season, season), // roles only
    fetchGames(null, season, season),
    fetchGames(null, lastSeason, lastSeason),
    // Game lines only.
    fetchOnIceStats({ fromSeason: season, thruSeason: season, gameRange: { type: "teamGames", games: 1 }, situation: "5v5" }),
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

  const baselines: DeploymentBoostsByBaseline = {
    previousGame: computeDeployment(recent, baselinesBySource.previousGame, MIN_BASELINE_GP.previousGame),
    last3Games: computeDeployment(recent, baselinesBySource.last3Games, MIN_BASELINE_GP.last3Games),
    thisSeason: computeDeployment(recent, baselinesBySource.thisSeason, MIN_BASELINE_GP.thisSeason),
    // A separate season entirely - no subtraction needed, the most recent
    // game can't double-count against a different season's totals.
    lastSeason: computeDeployment(recent, lastSeasonFull, MIN_BASELINE_GP.lastSeason),
  };

  // Unsubtracted windows - a role is a level, not a comparison, so the
  // most recent game belongs in every one of them. Last 1-5 have every
  // cumulative window fetched, so their PP share is exact; Last 10 and
  // This Season keep ppShare's estimate, which evens out over more games.
  const roles: DeploymentRolesByWindow = {
    lastGame: computeRoles(window1, teamPpInPlayedGames([window1])),
    last3Games: computeRoles(window3, teamPpInPlayedGames([window1, window2, window3])),
    last5Games: computeRoles(window5, teamPpInPlayedGames([window1, window2, window3, window4, window5])),
    last10Games: computeRoles(window10),
    thisSeason: computeRoles(thisSeasonFull),
  };

  return saveNstCached("deployment", { baselines, roles, lastGame: computeGameLines(window1, onIce1) });
}
