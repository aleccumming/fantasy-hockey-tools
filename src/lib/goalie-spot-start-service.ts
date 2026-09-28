// Server-only. Real Spot Starts: for each team's games in a date range,
// projects that team's presumed starter (the Start Tracker's current-share
// leader - see goalie-tracking-service.ts) and ranks every one of those
// starts by estimated win probability, the single biggest driver of a
// goalie's fantasy points on a given night.
//
// Caveat worth keeping in mind: nobody publishes a free, reliable "who's
// actually starting tonight" feed. "Presumed starter" here means "whoever's
// gotten the most starts on this team lately," not a confirmed lineup - on
// a back-to-back or a surprise rest day, the real starter can differ.
import { getTeamStandings } from "./nhl-standings";
import { getUpcomingGamesByTeam } from "./schedule";
import { getGoalieStartTracking } from "./goalie-tracking-service";
import { estimateWinProbability } from "./win-probability";

export interface LiveSpotStart {
  name: string;
  team: string;
  opponent: string;
  isHome: boolean;
  date: string;
  winProbability: number; // 0-1, the primary ranking signal
  recentSavePct: number;
  recentGaa: number;
  seasonSavePct: number;
}

let cache: { data: LiveSpotStart[]; expiresAt: number; rangeKey: string } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getLiveSpotStarts(
  start: string,
  end: string,
  forceRefresh = false
): Promise<LiveSpotStart[]> {
  const rangeKey = `${start}:${end}`;
  if (!forceRefresh && cache && cache.rangeKey === rangeKey && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const [standings, gamesByTeam, tracking] = await Promise.all([
    getTeamStandings(),
    getUpcomingGamesByTeam(start, end),
    getGoalieStartTracking(),
  ]);

  const starterByTeam = new Map(tracking.filter((g) => g.isCurrentStarter).map((g) => [g.team, g]));

  const spotStarts: LiveSpotStart[] = [];
  for (const [team, games] of Object.entries(gamesByTeam)) {
    const starter = starterByTeam.get(team);
    const ownStanding = standings[team];
    if (!starter || !ownStanding) continue; // no presumed starter or no standings row - skip rather than guess

    for (const game of games) {
      const opponentStanding = standings[game.opponent];
      if (!opponentStanding) continue;

      const goalieFormEdge = starter.recentSavePct - starter.seasonSavePct;
      const winProbability = estimateWinProbability(ownStanding, opponentStanding, game.isHome, goalieFormEdge);

      spotStarts.push({
        name: starter.name,
        team,
        opponent: game.opponent,
        isHome: game.isHome,
        date: game.date,
        winProbability,
        recentSavePct: starter.recentSavePct,
        recentGaa: starter.recentGaa,
        seasonSavePct: starter.seasonSavePct,
      });
    }
  }

  const data = spotStarts.sort((a, b) => b.winProbability - a.winProbability);
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS, rangeKey };
  return data;
}
