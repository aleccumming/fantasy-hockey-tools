"use client";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draft-store";
import { useDraftData } from "@/lib/use-draft-data";
import { getSmartSuggestions } from "@/lib/draft-strategy";
import { useHeadshots } from "@/lib/use-headshots";
import { PlayerHeadshot } from "@/components/player-headshot";
import { DraftButton } from "@/components/draft-button";

export function PickSuggestions() {
  const { available, picks, byId, currentPick, hasProjections } = useDraftData();
  const draftPlayer = useDraftStore((s) => s.draftPlayer);
  const settings = useDraftStore((s) => s.settings);
  const headshots = useHeadshots();

  const suggestions = useMemo(
    () => getSmartSuggestions(available, picks, byId, settings, 10),
    [available, picks, byId, settings]
  );

  const isMyPick = currentPick?.teamIndex === settings.myTeamIndex;

  if (available.length === 0) {
    return (
      <p className="rounded-md border border-line bg-surface p-4 text-center text-sm text-ink-dim">
        No players loaded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col rounded-md border border-line bg-surface p-4 lg:h-full">
      <h3 className="shrink-0 font-display text-sm font-bold uppercase tracking-wide text-ink">
        Best Available {isMyPick && <span className="text-rink-blue">(your pick)</span>}
      </h3>
      <p className="mt-1 shrink-0 text-xs text-ink-faint">
        Ranked by {hasProjections ? "Value Over Replacement" : "your uploaded ranking"}, adjusted
        for how likely each player is to be gone before your next turn.
      </p>
      <ul className="mt-3 space-y-1 overflow-auto">
        {suggestions.map(({ player, fillsNeed, reasons }) => (
          <li
            key={player.id}
            className={`rounded px-2 py-2.5 text-sm ${fillsNeed ? "bg-rink-blue-light" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <DraftButton onClick={() => draftPlayer(player.id)} />
                <PlayerHeadshot name={player.name} team={player.team} positions={player.positions} headshots={headshots} size={34} />
                <div className="min-w-0">
                  <span className="font-semibold text-ink">{player.name}</span>{" "}
                  <span className="text-xs text-ink-faint">
                    {player.team} &middot; {player.positions.join("/")}
                  </span>
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-dim">
                {hasProjections
                  ? `${player.fantasyPoints.toFixed(1)} pts · VOR ${player.vor.toFixed(1)}`
                  : `Rank ${player.rank}`}
              </span>
            </div>
            <div className="mt-1 flex min-h-[19px] flex-wrap gap-1 pl-8">
              {reasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded bg-rink-gold-light px-1.5 py-0.5 text-[10.5px] font-medium text-rink-gold"
                >
                  {reason}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
