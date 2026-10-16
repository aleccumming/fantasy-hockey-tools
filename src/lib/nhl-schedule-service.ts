// Server-only. The NHL regular-season schedule, stored in our own DB
// (nst_data_cache row "nhlSchedule") instead of fetched from the NHL on
// page requests. Fetching it live meant two NHL API requests per team (a
// redirect from /now, then the season), and that 64-request burst got
// rate-limited - "Couldn't load schedule" in Streamer Finder (prod logs,
// 2026-10-16; reproduced locally too, still 429 after batching and 5
// retries). The schedule barely changes, but it CAN (postponements,
// rescheduled games), so the daily refresh-nst-caches cron re-pulls it -
// now from the NHL stats API, which returns the whole league's season in
// ONE request (verified identical, date for date, to the per-team data for
// all 32 teams). Pages only ever read the stored row.
import { NHL_TEAMS, type OverlapMatrix, type ScheduleAnalysis, type TeamBucketStats, type TeamScheduleSummary, type UpcomingGame } from "./schedule";
import { fetchNhlJson } from "./nhl-api";
import { getCurrentNhlSeasonId } from "./nhl-standings";
import { getNstCached, saveNstCached, type NstCached } from "./nst-data-cache";

const OFF_NIGHT_MAX_TEAMS = 20;

interface NhlGame {
  id: number;
  gameDate: string;
  gameType: number;
  awayTeam: { abbrev: string };
  homeTeam: { abbrev: string };
}


interface StoredSchedule {
  season: number;
  /** Every regular-season game once (not once per team), slimmed to the
   *  fields used here - keeps the stored row small. */
  games: NhlGame[];
}

interface TeamSchedule {
  team: string;
  games: NhlGame[];
}

interface StatsApiGame {
  id: number;
  gameDate: string;
  gameType: number;
  homeTeamId: number;
  visitingTeamId: number;
}

interface StatsApiTeam {
  id: number;
  triCode: string;
}

/** The live pull from the NHL - only the cron and the bootstrap fallback
 *  below call this. Throws rather than storing anything incomplete, so a
 *  bad pull can never overwrite a good schedule. No Next fetch cache (0):
 *  both callers want the NHL's current schedule. */
export async function refreshNhlScheduleCache(): Promise<NstCached<StoredSchedule>> {
  const season = await getCurrentNhlSeasonId();
  const [gamesJson, teamsJson] = await Promise.all([
    fetchNhlJson<{ data: StatsApiGame[] }>(
      `https://api.nhle.com/stats/rest/en/game?cayenneExp=${encodeURIComponent(`season=${season} and gameType=2`)}`,
      0
    ),
    fetchNhlJson<{ data: StatsApiTeam[] }>("https://api.nhle.com/stats/rest/en/team", 0),
  ]);

  const abbrevById = new Map(teamsJson.data.map((t) => [t.id, t.triCode]));
  const games: NhlGame[] = gamesJson.data.map((g) => {
    const home = abbrevById.get(g.homeTeamId);
    const away = abbrevById.get(g.visitingTeamId);
    if (!home || !away) throw new Error(`NHL schedule: unknown team id in game ${g.id}`);
    return { id: g.id, gameDate: g.gameDate, gameType: g.gameType, homeTeam: { abbrev: home }, awayTeam: { abbrev: away } };
  });
  games.sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.id - b.id);

  // Every team should be in it - a missing one means a renamed/relocated
  // team code (or a bad response), which would silently zero out that
  // team's games everywhere.
  const teamsSeen = new Set(games.flatMap((g) => [g.homeTeam.abbrev, g.awayTeam.abbrev]));
  const missing = NHL_TEAMS.filter((t) => !teamsSeen.has(t));
  if (missing.length > 0) throw new Error(`NHL schedule: no games for ${missing.join(", ")}`);

  return saveNstCached("nhlSchedule", { season: Number(season), games });
}

// Per-team view of the stored schedule, rebuilt only when the row changes.
let perTeamMemo: { updatedAt: number; season: number; teams: TeamSchedule[] } | null = null;

async function loadTeamSchedules(): Promise<{ season: number; teams: TeamSchedule[]; updatedAt: number }> {
  const { data, updatedAt } = await getNstCached("nhlSchedule", refreshNhlScheduleCache);
  if (perTeamMemo && perTeamMemo.updatedAt === updatedAt.getTime()) return perTeamMemo;
  const teams = NHL_TEAMS.map((team) => ({
    team,
    games: data.games.filter((g) => g.homeTeam.abbrev === team || g.awayTeam.abbrev === team),
  }));
  perTeamMemo = { updatedAt: updatedAt.getTime(), season: data.season, teams };
  return perTeamMemo;
}

/** ISO date range [start, end] inclusive, both as "YYYY-MM-DD" strings. */
function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function bucketRangesForSeason(currentSeason: number) {
  const startYear = Math.floor(currentSeason / 10000);
  const endYear = currentSeason % 10000;
  return {
    regularSeason: { start: `${startYear}-09-29`, end: `${endYear}-03-07` },
    firstHalf: { start: `${startYear}-09-29`, end: `${startYear}-12-13` },
    secondHalf: { start: `${startYear}-12-14`, end: `${endYear}-03-07` },
    playoffs: { start: `${endYear}-03-08`, end: `${endYear}-03-28` },
    firstThreeWeeks: { start: `${startYear}-09-29`, end: `${startYear}-10-18` },
  };
}

/** Every game date (sorted) each team plays within an arbitrary date range -
 *  the basis for "which streamer fits the most games into your roster this
 *  week" (games.length gives the count; the dates themselves let the UI
 *  show which specific days a team plays). Reads the stored
 *  schedule - never calls the NHL. */
export async function getGameDatesInRangeByTeam(
  start: string,
  end: string
): Promise<Record<string, string[]>> {
  const { teams } = await loadTeamSchedules();
  return Object.fromEntries(
    teams.map(({ team, games }) => [
      team,
      games
        .filter((g) => inRange(g.gameDate, start, end))
        .map((g) => g.gameDate)
        .sort(),
    ])
  );
}

/** Every team's games (sorted by date) within a date range, with opponent
 *  and home/away - the richer counterpart to getGameDatesInRangeByTeam
 *  above, needed anywhere a matchup itself matters (e.g. goalie spot-start
 *  win probability), not just the game count. */
export async function getUpcomingGamesByTeam(
  start: string,
  end: string
): Promise<Record<string, UpcomingGame[]>> {
  const { teams } = await loadTeamSchedules();
  return Object.fromEntries(
    teams.map(({ team, games }) => [
      team,
      games
        .filter((g) => inRange(g.gameDate, start, end))
        .map((g) => ({
          date: g.gameDate,
          opponent: g.homeTeam.abbrev === team ? g.awayTeam.abbrev : g.homeTeam.abbrev,
          isHome: g.homeTeam.abbrev === team,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    ])
  );
}

// Derived from the stored schedule, so it's only recomputed when that row
// changes (keyed by its updatedAt).
let analysisMemo: { updatedAt: number; data: ScheduleAnalysis } | null = null;

export async function getScheduleAnalysis(): Promise<ScheduleAnalysis> {
  const { season, teams: results, updatedAt } = await loadTeamSchedules();
  if (analysisMemo && analysisMemo.updatedAt === updatedAt) return analysisMemo.data;

  const gamesById = new Map<number, NhlGame>();
  for (const { games } of results) {
    for (const game of games) {
      gamesById.set(game.id, game);
    }
  }

  const teamsPlayingByDate = new Map<string, Set<string>>();
  for (const game of gamesById.values()) {
    const teams = teamsPlayingByDate.get(game.gameDate) ?? new Set<string>();
    teams.add(game.homeTeam.abbrev);
    teams.add(game.awayTeam.abbrev);
    teamsPlayingByDate.set(game.gameDate, teams);
  }

  const offNightDates = Array.from(teamsPlayingByDate.entries())
    .filter(([, teams]) => teams.size <= OFF_NIGHT_MAX_TEAMS)
    .map(([date]) => date)
    .sort();
  const offNightSet = new Set(offNightDates);

  const bucketRanges = bucketRangesForSeason(season);

  function statsForRange(games: NhlGame[], start: string, end: string): TeamBucketStats {
    const inWindow = games.filter((g) => inRange(g.gameDate, start, end));
    return {
      games: inWindow.length,
      offNightGames: inWindow.filter((g) => offNightSet.has(g.gameDate)).length,
    };
  }

  const teams: TeamScheduleSummary[] = results.map(({ team, games }) => ({
    team,
    regularSeason: statsForRange(games, bucketRanges.regularSeason.start, bucketRanges.regularSeason.end),
    firstHalf: statsForRange(games, bucketRanges.firstHalf.start, bucketRanges.firstHalf.end),
    secondHalf: statsForRange(games, bucketRanges.secondHalf.start, bucketRanges.secondHalf.end),
    playoffs: statsForRange(games, bucketRanges.playoffs.start, bucketRanges.playoffs.end),
    firstThreeWeeks: statsForRange(
      games,
      bucketRanges.firstThreeWeeks.start,
      bucketRanges.firstThreeWeeks.end
    ),
  }));

  const teamDates: Record<string, Set<string>> = {};
  for (const { team, games } of results) {
    teamDates[team] = new Set(games.map((g) => g.gameDate));
  }

  const overlapMatrix: OverlapMatrix = {};
  for (const teamA of NHL_TEAMS) {
    overlapMatrix[teamA] = {};
    for (const teamB of NHL_TEAMS) {
      let count = 0;
      for (const date of teamDates[teamA] ?? []) {
        if (teamDates[teamB]?.has(date)) count++;
      }
      overlapMatrix[teamA][teamB] = count;
    }
  }

  const analysis: ScheduleAnalysis = {
    season: String(season),
    computedAt: new Date(updatedAt).toISOString(),
    offNightDates,
    bucketRanges,
    teams: teams.sort((a, b) => b.regularSeason.offNightGames - a.regularSeason.offNightGames),
    overlapMatrix,
  };

  analysisMemo = { updatedAt, data: analysis };
  return analysis;
}
