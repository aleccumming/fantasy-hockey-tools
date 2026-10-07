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
