// Server-only. Real, live "who's actually getting the starts" tracking -
// replaces the old sample-data "Long-Term Holds" heuristics with numbers
// pulled from Natural Stat Trick.
//
// NST doesn't publish a per-game start log, so "starts" here is really
// "games with any recorded ice time" over a trailing window of each team's
// own last N games (via NST's team-games filter) - almost always the same
// thing as a true start, except on the rare game where a pulled starter is
// relieved and both goalies pick up an appearance. That's a known, small
// source of noise, not something this app can see around without a real
// game-log source.
//
// Start share is computed relative to the OTHER rostered goalies who also
// appear in the same window for that team (own GP / sum of every goalie's
// GP on that team in the window) - a "share of this team's tracked goalie
// appearances," not literally "share of the team's games," since teams that
// played fewer games than the window size still divide out correctly either
// way.
import { fetchGoalieStats, currentNstSeason, type NstGoalieRow } from "./nst-client";
import { normalizeName } from "./name-matching";

export interface GoalieStartTracking {
  name: string;
  team: string;
  recentGp: number;
  recentShare: number; // 0-1
  recentSavePct: number;
  recentGaa: number;
  seasonGp: number;
  seasonShare: number; // 0-1
  seasonSavePct: number;
  seasonGaa: number;
  /** True for whichever goalie holds the largest recent-window share on
   *  their team - the team's current de facto #1. */
  isCurrentStarter: boolean;
  /** A backup (or previously-shared) goalie whose share has jumped enough
   *  in the recent window to suggest they may be taking over the net. */
  takingOver: boolean;
}

// A trailing window of each team's last 10 games - long enough to smooth
// out one bad/good start, short enough to actually reflect "who's playing
// right now" rather than a season-long average.
const RECENT_WINDOW_TEAM_GAMES = 10;

// How much higher the recent share has to run above the season share, while
// also being the current majority holder, to call it "taking over" rather
// than just short-term timeshare noise.
const TAKING_OVER_SHARE_GAIN = 0.2;
const TAKING_OVER_MIN_RECENT_SHARE = 0.5;

function groupByTeam(rows: NstGoalieRow[]): Map<string, NstGoalieRow[]> {
  const byTeam = new Map<string, NstGoalieRow[]>();
  for (const row of rows) {
    const list = byTeam.get(row.team) ?? [];
    list.push(row);
    byTeam.set(row.team, list);
  }
  return byTeam;
}

function shareByName(rows: NstGoalieRow[]): Map<string, number> {
  const byTeam = groupByTeam(rows);
  const shares = new Map<string, number>();
  for (const teamRows of byTeam.values()) {
    const teamTotalGp = teamRows.reduce((sum, r) => sum + r.gp, 0);
    for (const r of teamRows) {
      shares.set(normalizeName(r.name), teamTotalGp > 0 ? r.gp / teamTotalGp : 0);
    }
  }
  return shares;
}

let cache: { data: GoalieStartTracking[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export async function getGoalieStartTracking(forceRefresh = false): Promise<GoalieStartTracking[]> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const season = currentNstSeason();
  const [recentRows, seasonRows] = await Promise.all([
    fetchGoalieStats({
      fromSeason: season,
      thruSeason: season,
      gameRange: { type: "teamGames", games: RECENT_WINDOW_TEAM_GAMES },
      situation: "all",
    }),
    fetchGoalieStats({
      fromSeason: season,
      thruSeason: season,
      gameRange: { type: "none" },
      situation: "all",
    }),
  ]);

  const recentShares = shareByName(recentRows);
  const seasonShares = shareByName(seasonRows);
  const seasonByName = new Map(seasonRows.map((r) => [normalizeName(r.name), r]));

  // Only goalies who've actually played recently belong on the tracker -
  // someone who last played a month ago isn't "getting starts" right now.
  const tracked = recentRows
    .filter((r) => r.gp > 0)
    .map((r) => {
      const key = normalizeName(r.name);
      const seasonRow = seasonByName.get(key);
      const recentShare = recentShares.get(key) ?? 0;
      const seasonShare = seasonShares.get(key) ?? 0;
      return {
        name: r.name,
        team: r.team,
        recentGp: r.gp,
        recentShare,
        recentSavePct: r.savePct,
        recentGaa: r.gaa,
        seasonGp: seasonRow?.gp ?? 0,
        seasonShare,
        seasonSavePct: seasonRow?.savePct ?? r.savePct,
        seasonGaa: seasonRow?.gaa ?? r.gaa,
        isCurrentStarter: false,
        takingOver:
          recentShare >= TAKING_OVER_MIN_RECENT_SHARE && recentShare - seasonShare >= TAKING_OVER_SHARE_GAIN,
      };
    });

  const byTeam = groupByTeam(recentRows);
  for (const [team, teamRows] of byTeam) {
    if (teamRows.length === 0) continue;
    const topGp = Math.max(...teamRows.map((r) => r.gp));
    for (const t of tracked) {
      if (t.team === team && t.recentGp === topGp) t.isCurrentStarter = true;
    }
  }

  const data = tracked.sort((a, b) => {
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    return b.recentShare - a.recentShare;
  });

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
