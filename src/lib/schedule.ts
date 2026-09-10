// Server-only helpers for fetching the NHL schedule and computing which
// nights are "off nights" (few teams playing league-wide, so it's easy to
// stream/fit a player in around them) - useful for lineup/streaming value
// during a draft.
//
// "Off night" = a date where 10 or fewer teams are playing league-wide (not
// a relative/percentile cutoff - a fixed threshold that's held up well in
// practice for fitting streamers into a lineup).

export const NHL_TEAMS = [
  "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ",
  "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NSH",
  "NJD", "NYI", "NYR", "OTT", "PHI", "PIT", "SJS", "SEA",
  "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WSH", "WPG",
];

const OFF_NIGHT_MAX_TEAMS = 20;

interface NhlGame {
  id: number;
  gameDate: string;
  gameType: number;
  awayTeam: { abbrev: string };
  homeTeam: { abbrev: string };
}

interface ClubScheduleResponse {
  currentSeason: number;
  games: NhlGame[];
}

export interface TeamBucketStats {
  games: number;
  offNightGames: number;
}

/** Fantasy-relevant date buckets within a season, all computed against the
 *  same global off-night date set (see OFF_NIGHT_MAX_TEAMS above) - only
 *  the date range differs per bucket. */
export interface TeamScheduleSummary {
  team: string;
  regularSeason: TeamBucketStats;
  firstHalf: TeamBucketStats;
  secondHalf: TeamBucketStats;
  playoffs: TeamBucketStats;
  firstThreeWeeks: TeamBucketStats;
}

/** overlapMatrix[teamA][teamB] = number of dates both teams play (including
 *  teamA vs teamA, which is just that team's total game count). Useful for
 *  seeing how much two teams' schedules "compete" for the same days - e.g.
 *  when deciding between two players at the same roster position, the one
 *  whose team overlaps less with your other same-position players' teams
 *  covers more distinct game-days. */
export type OverlapMatrix = Record<string, Record<string, number>>;

export interface ScheduleAnalysis {
  season: string;
  computedAt: string;
  offNightDates: string[];
  bucketRanges: Record<keyof Omit<TeamScheduleSummary, "team">, { start: string; end: string }>;
  teams: TeamScheduleSummary[];
  overlapMatrix: OverlapMatrix;
}

let cache: { data: ScheduleAnalysis; expiresAt: number } | null = null;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function fetchTeamSchedule(
  team: string
): Promise<{ season: number; games: NhlGame[] }> {
  const res = await fetch(
    `https://api-web.nhle.com/v1/club-schedule-season/${team}/now`,
    { next: { revalidate: 43200 } }
  );
  if (!res.ok) {
    throw new Error(`NHL API request failed for ${team}: ${res.status}`);
  }
  const data: ClubScheduleResponse = await res.json();
  return { season: data.currentSeason, games: data.games.filter((g) => g.gameType === 2) };
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

export async function getScheduleAnalysis(
  forceRefresh = false
): Promise<ScheduleAnalysis> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const results = await Promise.all(
    NHL_TEAMS.map(async (team) => {
      const { season, games } = await fetchTeamSchedule(team);
      return { team, season, games };
    })
  );

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

  const season = results[0]?.season ?? 0;
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
    computedAt: new Date().toISOString(),
    offNightDates,
    bucketRanges,
    teams: teams.sort((a, b) => b.regularSeason.offNightGames - a.regularSeason.offNightGames),
    overlapMatrix,
  };

  cache = { data: analysis, expiresAt: Date.now() + CACHE_TTL_MS };
  return analysis;
}
