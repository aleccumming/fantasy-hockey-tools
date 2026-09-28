// Server-only. Fetches one Natural Stat Trick window (individual + on-ice,
// merged by player) - the shared building block behind both the Streamer
// Suggestions "last 5 games" window and the Player Evaluator's multiple
// windows (last 5 / last 10 / season).
import { fetchIndividualStats, fetchOnIceStats, type NstQueryOptions } from "./nst-client";
import { normalizeName } from "./name-matching";
import type { SkaterPosition } from "./types";
import type { SkaterRateStats } from "./streamer-stats";

export interface SkaterWindowRow {
  name: string;
  team: string;
  position: SkaterPosition;
  gp: number;
  goals: number;
  assists: number;
  toi: number;
  shots: number;
  icf: number;
  iscf: number;
  ixg: number;
  shPct: number;
  ipp: number;
  cf: number;
  scf: number;
  xgf: number;
  onIceShPct: number;
}

/** Fetches one window's individual + on-ice stats and merges them by
 *  normalized name, keyed the same way for easy lookup. Players with no
 *  on-ice match (rare) are dropped - oiCF/oiSCF/oixG can't be computed for
 *  them anyway. */
export async function fetchSkaterWindow(opts: NstQueryOptions): Promise<Map<string, SkaterWindowRow>> {
  const [individual, onIce] = await Promise.all([fetchIndividualStats(opts), fetchOnIceStats(opts)]);
  const onIceByName = new Map(onIce.map((r) => [normalizeName(r.name), r]));

  const rows = new Map<string, SkaterWindowRow>();
  for (const ind of individual) {
    const key = normalizeName(ind.name);
    const oi = onIceByName.get(key);
    if (!oi) continue;
    rows.set(key, {
      name: ind.name,
      team: ind.team,
      position: ind.position,
      gp: ind.gp,
      goals: ind.goals,
      assists: ind.assists,
      toi: ind.toi,
      shots: ind.shots,
      icf: ind.icf,
      iscf: ind.iscf,
      ixg: ind.ixg,
      shPct: ind.shPct,
      ipp: ind.ipp,
      cf: oi.cf,
      scf: oi.scf,
      xgf: oi.xgf,
      onIceShPct: oi.onIceShPct,
    });
  }
  return rows;
}

function toPer60(total: number, toiMinutes: number): number {
  if (toiMinutes <= 0) return 0;
  return total / (toiMinutes / 60);
}

/** Builds a SkaterRateStats-shaped record from one window's row plus a
 *  baseline row for the luck/regression comparison (career-ish, from a
 *  separate multi-season window - never the same window being displayed,
 *  so a stat is never compared against itself). */
export function toSkaterRateStats(
  row: SkaterWindowRow,
  baseline: SkaterWindowRow | undefined
): SkaterRateStats {
  return {
    name: row.name,
    team: row.team,
    positions: [row.position],
    gamesPlayed: row.gp,
    goals: row.goals,
    assists: row.assists,
    toiPerGame: row.gp > 0 ? row.toi / row.gp : 0,
    shotsPer60: toPer60(row.shots, row.toi),
    iCFPer60: toPer60(row.icf, row.toi),
    iSCFPer60: toPer60(row.iscf, row.toi),
    ixGPer60: toPer60(row.ixg, row.toi),
    oiCFPer60: toPer60(row.cf, row.toi),
    oiSCFPer60: toPer60(row.scf, row.toi),
    oixGPer60: toPer60(row.xgf, row.toi),
    shootingPct: row.shPct,
    onIceShPct: row.onIceShPct,
    ipp: row.ipp,
    // Falls back to the row's own value (no hot/cold signal) if a player
    // has no baseline row for some reason, rather than crashing.
    baselineShootingPct: baseline?.shPct ?? row.shPct,
    baselineOnIceShPct: baseline?.onIceShPct ?? row.onIceShPct,
    baselineIpp: baseline?.ipp ?? row.ipp,
  };
}
