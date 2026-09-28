// Server-only. Real team win/loss records from the NHL's own standings
// endpoint - the basis for a genuine win-probability estimate (see
// win-probability.ts), not a goal-differential proxy. Team abbreviations
// here already match NHL_TEAMS (schedule.ts) exactly, no normalization
// needed like NST's three-word codes require.
export interface TeamStanding {
  team: string;
  gamesPlayed: number;
  wins: number;
  homeGamesPlayed: number;
  homeWins: number;
  roadGamesPlayed: number;
  roadWins: number;
  l10GamesPlayed: number;
  l10Wins: number;
}

interface NhlStandingsRow {
  teamAbbrev: { default: string };
  gamesPlayed: number;
  wins: number;
  homeGamesPlayed: number;
  homeWins: number;
  roadGamesPlayed: number;
  roadWins: number;
  l10GamesPlayed: number;
  l10Wins: number;
}

interface NhlStandingsResponse {
  standings: NhlStandingsRow[];
}

let cache: { data: Record<string, TeamStanding>; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour - standings update after every game

/** Every team's current win/loss record (season, home/road split, and last
 *  10 games), keyed by team abbreviation. Before the new season has games,
 *  the NHL's own "/now" endpoint keeps returning the just-completed
 *  season's final standings - same graceful fallback behavior NST's season
 *  code already has (see nst-client.ts's currentNstSeason), so this stays
 *  meaningful instead of returning all-zero records in the preseason. */
export async function getTeamStandings(forceRefresh = false): Promise<Record<string, TeamStanding>> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const res = await fetch("https://api-web.nhle.com/v1/standings/now", {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`NHL standings request failed: ${res.status}`);
  const json: NhlStandingsResponse = await res.json();

  const data: Record<string, TeamStanding> = {};
  for (const row of json.standings) {
    const team = row.teamAbbrev.default;
    data[team] = {
      team,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      homeGamesPlayed: row.homeGamesPlayed,
      homeWins: row.homeWins,
      roadGamesPlayed: row.roadGamesPlayed,
      roadWins: row.roadWins,
      l10GamesPlayed: row.l10GamesPlayed,
      l10Wins: row.l10Wins,
    };
  }

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
