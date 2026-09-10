"use client";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draft-store";
import { useDraftData } from "@/lib/use-draft-data";
import { useHeadshots } from "@/lib/use-headshots";
import { PlayerHeadshot } from "@/components/player-headshot";

const POSITION_COLORS: Record<string, string> = {
  C: "bg-pos-c text-white",
  LW: "bg-pos-lw text-white",
  RW: "bg-pos-rw text-white",
  D: "bg-pos-d text-white",
  G: "bg-pos-g text-ink",
};

/** "Nathan MacKinnon" -> "N. MacKinnon" - keeps the board narrow enough to
 *  see every team without scrolling. */
function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export function OnTheClockBanner() {
  const settings = useDraftStore((s) => s.settings);
  const teamNames = useDraftStore((s) => s.teamNames);
  const { currentPick } = useDraftData();

  if (!currentPick) return null;

  return (
    <p className="rounded-md border-l-4 border-rink-red bg-surface px-4 py-2.5 text-sm text-ink-dim shadow-sm">
      On the clock:{" "}
      <span className="font-semibold text-ink">{teamNames[currentPick.teamIndex]}</span>{" "}
      &mdash; Round {currentPick.round}, Pick {currentPick.pickNumber}
      {currentPick.teamIndex === settings.myTeamIndex && (
        <span className="ml-2 rounded bg-rink-blue px-1.5 py-0.5 text-xs font-semibold text-white">
          YOU
        </span>
      )}
    </p>
  );
}

export function DraftBoard() {
  const picks = useDraftStore((s) => s.picks);
  const settings = useDraftStore((s) => s.settings);
  const teamNames = useDraftStore((s) => s.teamNames);
  const undoPick = useDraftStore((s) => s.undoPick);
  const { byId, currentPick } = useDraftData();
  const headshots = useHeadshots();

  const rounds = useMemo(() => {
    const map = new Map<number, typeof picks>();
    for (const pick of picks) {
      if (!map.has(pick.round)) map.set(pick.round, []);
      map.get(pick.round)!.push(pick);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [picks]);

  if (picks.length === 0) return null;

  return (
    <div className="max-h-[460px] overflow-auto rounded-md border border-line bg-surface">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-10" />
          {teamNames.map((_, i) => (
            <col key={i} className="w-28" />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            <th className="sticky top-0 left-0 z-20 bg-surface px-2 py-2">Rd</th>
            {teamNames.map((name, i) => (
              <th
                key={i}
                title={name}
                className={`sticky top-0 z-10 truncate bg-surface px-1.5 py-2 ${
                  i === settings.myTeamIndex ? "text-rink-blue" : ""
                }`}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map(([round, roundPicks], ri) => {
            const byTeam = new Map(roundPicks.map((p) => [p.teamIndex, p]));
            return (
              <tr
                key={round}
                className={`border-b border-stripe ${ri % 2 === 1 ? "bg-stripe/60" : ""}`}
              >
                <td className="sticky left-0 z-10 bg-inherit px-2 py-1 text-ink-faint">
                  {round}
                </td>
                {teamNames.map((_, teamIndex) => {
                  const pick = byTeam.get(teamIndex);
                  const player = pick?.playerId ? byId.get(pick.playerId) : undefined;
                  const isCurrent = currentPick?.pickNumber === pick?.pickNumber;
                  return (
                    <td key={teamIndex} className={`p-1 ${isCurrent ? "ring-2 ring-inset ring-rink-blue" : ""}`}>
                      {player ? (
                        <div
                          title={player.name}
                          className={`group relative flex w-full items-center gap-1.5 rounded-md px-1.5 py-2 text-left ${
                            POSITION_COLORS[player.positions[0]] ?? "bg-ice text-ink"
                          }`}
                        >
                          <PlayerHeadshot name={player.name} headshots={headshots} size={28} />
                          <span className="min-w-0 leading-tight">
                            <span className="block truncate text-[11px] font-semibold">
                              {abbreviateName(player.name)}
                            </span>
                            <span className="block truncate text-[9px] opacity-85">
                              {player.positions.join("/")}
                            </span>
                          </span>
                          <button
                            type="button"
                            title={`Undo ${player.name}'s pick`}
                            onClick={() => {
                              if (confirm(`Undo this pick? ${player.name} will be removed from ${teamNames[pick!.teamIndex]}.`)) {
                                undoPick(pick!.pickNumber);
                              }
                            }}
                            className="absolute right-1 top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/35 text-[10px] leading-none text-white hover:bg-black/55 group-hover:flex"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <span className="block px-1.5 py-1.5 text-ink-faint">#{pick?.pickNumber}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
