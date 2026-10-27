// Shared types/constants for the Deployment tool - split out from
// deployment-service.ts specifically so client components (deployment-
// board.tsx) can import DEPLOYMENT_BASELINES/DEFAULT_DEPLOYMENT_BASELINE as
// real values without dragging deployment-service.ts's server-only DB
// dependency (nst-data-cache.ts -> @/db -> pg, which doesn't bundle for the
// browser) into the client bundle.
import type { Position } from "./types";

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

// Selectable baselines to compare the most recent game against - "recent"
// itself isn't selectable (always the most recent game) while the baseline
// is - see deployment-service.ts's file header for why.
export const DEPLOYMENT_BASELINES = ["previousGame", "last3Games", "thisSeason", "lastSeason"] as const;
export type DeploymentBaseline = (typeof DEPLOYMENT_BASELINES)[number];
export const DEFAULT_DEPLOYMENT_BASELINE: DeploymentBaseline = "lastSeason";

export type DeploymentBoostsByBaseline = Record<DeploymentBaseline, RankedDeploymentPlayer[]>;

/** Where a player's deployment stands in one window - no baseline, no
 *  delta. For scanning (e.g. free agents) by raw role, including players a
 *  change-based list misses because nothing changed lately or they sat out
 *  the most recent game. */
export interface DeploymentRolePlayer {
  name: string;
  team: string;
  positions: Position[];
  gamesPlayed: number;
  toiPerGame: number;
  ppToiPerGame: number;
  /** Same share-of-team-PP-time as DeploymentPlayer.recentPpShare. */
  ppShare: number;
}

export const DEPLOYMENT_ROLE_WINDOWS = ["lastGame", "last3Games", "last5Games", "last10Games", "thisSeason"] as const;
export type DeploymentRoleWindow = (typeof DEPLOYMENT_ROLE_WINDOWS)[number];
export const DEFAULT_DEPLOYMENT_ROLE_WINDOW: DeploymentRoleWindow = "thisSeason";

export type DeploymentRolesByWindow = Record<DeploymentRoleWindow, DeploymentRolePlayer[]>;

/** A skater's on-ice results at 5v5 in one game - for and against while
 *  they were out there. 5v5 rather than all situations so a PP1 role's
 *  power-play shifts don't inflate the "for" side. */
export interface DeploymentOnIceLine {
  toi: number;
  cf: number;
  ca: number;
  sf: number;
  sa: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  scf: number;
  sca: number;
  hdcf: number;
  hdca: number;
  ozStarts: number;
  dzStarts: number;
}

/** One skater's raw box score from their team's most recent game - what
 *  they actually did with a new role, without a Last 5 window diluting it
 *  with games played under the old one. Totals, not per-game rates. */
export interface DeploymentGameLine {
  name: string;
  team: string;
  positions: Position[];
  toi: number;
  ppToi: number;
  goals: number;
  assists: number;
  ppGoals: number;
  ppAssists: number;
  shots: number;
  icf: number;
  iff: number;
  iscf: number;
  ihdcf: number;
  ixg: number;
  hits: number;
  blocks: number;
  pim: number;
  /** Null if they had no 5v5 time in the game. */
  onIce5v5: DeploymentOnIceLine | null;
}

/** What the "deployment" cache row holds. Rows written before roles
 *  existed are the bare DeploymentBoostsByBaseline record; rows written
 *  before last-game lines existed have no lastGame. */
export interface DeploymentCacheData {
  baselines: DeploymentBoostsByBaseline;
  roles: DeploymentRolesByWindow;
  lastGame?: DeploymentGameLine[];
}
