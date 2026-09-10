"use client";

import { useMemo } from "react";
import { useDraftData } from "@/lib/use-draft-data";
import { useScheduleAnalysis } from "@/lib/use-schedule";
import { NHL_TEAMS } from "@/lib/schedule";
import {
  bucketConflictScores,
  computeCandidateConflict,
  CONFLICT_BADGE_CLASSES,
  CONFLICT_LABELS,
  type ConflictLevel,
} from "@/lib/schedule-conflict";
import type { Position } from "@/lib/types";

const POSITIONS: Position[] = ["C", "LW", "RW", "D", "G"];
const TEAM_ORDER = [...NHL_TEAMS].sort();

export function ScheduleOverlapMatrix() {
  const { myRosterSlots } = useDraftData();
  const { data: schedule, loading, error } = useScheduleAnalysis();

  const rosteredByPosition = useMemo(() => {
    const map = new Map<Position, { name: string; team: string }[]>();
    for (const pos of POSITIONS) {
      const seen = new Set<string>();
      const players = myRosterSlots
        .filter(
          (s) => s.position !== "BENCH" && s.player && s.player.positions.includes(pos)
        )
        .map((s) => ({ name: s.player!.name, team: s.player!.team }))
        .filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));
      map.set(pos, players);
    }
    return map;
  }, [myRosterSlots]);

  const cellsByTeam = useMemo(() => {
    const rows = new Map<string, Map<Position, { score: number; level: ConflictLevel }>>();
    if (!schedule) return rows;
    for (const team of TEAM_ORDER) rows.set(team, new Map());

    for (const pos of POSITIONS) {
      const scored = TEAM_ORDER.map((team) => ({
        team,
        score: computeCandidateConflict(
          { id: `${team}-${pos}`, team, positions: [pos] },
          myRosterSlots,
          schedule.overlapMatrix
        ).score,
      }));
      const levelByScore = bucketConflictScores(scored.map((s) => s.score));
      for (const { team, score } of scored) {
        rows.get(team)!.set(pos, { score, level: levelByScore.get(score)! });
      }
    }
    return rows;
  }, [schedule, myRosterSlots]);

  if (loading) return <p className="text-sm text-ink-dim">Loading schedule data&hellip;</p>;
  if (error) return <p className="text-sm text-rink-red">Couldn&apos;t load schedule data ({error}).</p>;
  if (!schedule) return null;

  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
        Schedule Fit by Position
      </h3>
      <p className="mt-1 text-xs text-ink-faint">
        For each position, how much a team&apos;s schedule overlaps with the players you&apos;ve
        already rostered there (including UTIL) &mdash;{" "}
        <span className="font-medium text-ink-dim">lower is better</span>: less overlap means
        more distinct game-days if you start multiple players at that spot.
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
        {POSITIONS.map((pos) => {
          const players = rosteredByPosition.get(pos) ?? [];
          return (
            <span key={pos}>
              <span className="font-semibold text-ink-dim">{pos}:</span>{" "}
              {players.length > 0
                ? players.map((p) => `${p.name} (${p.team})`).join(", ")
                : "none rostered yet"}
            </span>
          );
        })}
      </div>

      <div className="mt-4 max-h-[70vh] overflow-auto rounded border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-line bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              <th className="px-3 py-2">Team</th>
              {POSITIONS.map((pos) => (
                <th key={pos} className="px-3 py-2">
                  {pos}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAM_ORDER.map((team, i) => (
              <tr
                key={team}
                className={`border-b border-stripe ${i % 2 === 1 ? "bg-stripe/60" : ""}`}
              >
                <td className="px-3 py-1.5 font-semibold text-ink">{team}</td>
                {POSITIONS.map((pos) => {
                  const cell = cellsByTeam.get(team)?.get(pos);
                  return (
                    <td key={pos} className="px-3 py-1.5">
                      {cell && (
                        <span
                          title={`Overlap score ${cell.score}`}
                          className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${CONFLICT_BADGE_CLASSES[cell.level]}`}
                        >
                          {CONFLICT_LABELS[cell.level]}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
