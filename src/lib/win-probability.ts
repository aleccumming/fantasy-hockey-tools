// Pure win-probability estimation - no fetching, just the math, so it's
// easy to reason about (and test) independent of where the standings data
// comes from. For a goalie spot-start decision, the Win is usually the
// single biggest chunk of that start's fantasy points, so this is the
// headline number Spot Starts ranks by - not a vague "matchup score."
import type { TeamStanding } from "./nhl-standings";

// Small-sample shrinkage: blends a raw win pct toward .500 using a "phantom
// record" of 4-4 - enough to keep an early-season 3-0 team from reading as
// a 100% win probability, while barely moving a team with a full season of
// games behind it.
const SHRINKAGE_GAMES = 8;
const SHRINKAGE_WINS = 4;

function shrunkWinPct(wins: number, gamesPlayed: number): number {
  return (wins + SHRINKAGE_WINS) / (gamesPlayed + SHRINKAGE_GAMES);
}

/** A team's "current strength" as a single win-pct-like number: mostly the
 *  season record, with a meaningful nod to how they've been playing lately
 *  (last 10) and how they do in this specific venue (home/road split) -
 *  each shrunk toward .500 first so small samples don't dominate. */
function blendedTeamStrength(standing: TeamStanding, isHome: boolean): number {
  const season = shrunkWinPct(standing.wins, standing.gamesPlayed);
  const venue = isHome
    ? shrunkWinPct(standing.homeWins, standing.homeGamesPlayed)
    : shrunkWinPct(standing.roadWins, standing.roadGamesPlayed);
  const recent = shrunkWinPct(standing.l10Wins, standing.l10GamesPlayed);
  return 0.5 * season + 0.3 * venue + 0.2 * recent;
}

/** Bill James' log5 formula: the probability team A beats team B given each
 *  team's independent win-pct-like strength. */
function log5(pA: number, pB: number): number {
  const denominator = pA + pB - 2 * pA * pB;
  if (Math.abs(denominator) < 1e-9) return 0.5;
  return (pA - pA * pB) / denominator;
}

// A goalie who's running hotter (or colder) than their own season baseline
// nudges the estimate a little on top of the team-level number - the team's
// season goals-against already reflects this goalie's usual performance, so
// this only credits/blames them for CURRENT form relative to themselves,
// not double-counting their overall quality.
const GOALIE_FORM_NUDGE_SCALE = 1.5;
const MAX_GOALIE_FORM_NUDGE = 0.05;
const MIN_WIN_PROBABILITY = 0.05;
const MAX_WIN_PROBABILITY = 0.95;

/** Estimated probability the goalie's own team wins this game - the primary
 *  ranking signal for a spot start, since a Win is usually the biggest
 *  single chunk of a goalie's fantasy points for that game. Built from real
 *  win/loss records (season + home/road split + last 10), not a goal-
 *  differential stand-in, via the log5 method plus a small goalie-form
 *  nudge. */
export function estimateWinProbability(
  ownStanding: TeamStanding,
  opponentStanding: TeamStanding,
  isHome: boolean,
  goalieFormEdge = 0 // recentSavePct - seasonSavePct, e.g. 0.012
): number {
  const ownStrength = blendedTeamStrength(ownStanding, isHome);
  const opponentStrength = blendedTeamStrength(opponentStanding, !isHome);
  const base = log5(ownStrength, opponentStrength);

  const nudge = Math.max(
    -MAX_GOALIE_FORM_NUDGE,
    Math.min(MAX_GOALIE_FORM_NUDGE, goalieFormEdge * GOALIE_FORM_NUDGE_SCALE)
  );

  return Math.max(MIN_WIN_PROBABILITY, Math.min(MAX_WIN_PROBABILITY, base + nudge));
}
