// NHL schedule constants, shared types and date-range helpers - safe to
// import from client components. The server side (fetching, storing and
// reading the season schedule) lives in nhl-schedule-service.ts, kept
// separate so this file never pulls database code into a browser bundle.
//
// "Off night" = a date where few teams are playing league-wide, so it's
// easy to stream/fit a player in around them (see OFF_NIGHT_MAX_TEAMS in
// nhl-schedule-service.ts).

export const NHL_TEAMS = [
  "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ",
  "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NSH",
  "NJD", "NYI", "NYR", "OTT", "PHI", "PIT", "SJS", "SEA",
  "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WSH", "WPG",
];

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

export interface UpcomingGame {
  date: string;
  opponent: string;
  isHome: boolean;
}

/** Monday-Sunday week containing `referenceDate` (defaults to today), as
 *  "YYYY-MM-DD" bounds - a reasonable default weekly-matchup period until a
 *  specific league's actual scoring-period dates are available (e.g. via a
 *  Yahoo league integration). */
export function currentWeekRange(referenceDate = new Date()): { start: string; end: string } {
  const day = referenceDate.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

/** Today through this week's Sunday - the part of the current matchup week
 *  that can still be played. Formatted from LOCAL date parts, not
 *  toISOString (UTC), so an evening visit in North America doesn't roll
 *  "today" over to tomorrow. */
export function remainingWeekRange(referenceDate = new Date()): { start: string; end: string } {
  const day = referenceDate.getDay(); // 0 = Sunday .. 6 = Saturday
  const sunday = new Date(referenceDate);
  sunday.setDate(referenceDate.getDate() + (day === 0 ? 0 : 7 - day));
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(referenceDate), end: fmt(sunday) };
}
