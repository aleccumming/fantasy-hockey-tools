"use client";

import { useDraftData } from "@/lib/use-draft-data";
import { useHeadshots } from "@/lib/use-headshots";
import { PlayerHeadshot } from "@/components/player-headshot";

export function MyTeam() {
  const { myRosterSlots, hasProjections } = useDraftData();
  const headshots = useHeadshots();

  if (myRosterSlots.length === 0) {
    return (
      <p className="rounded-md border border-line bg-surface p-6 text-center text-sm text-ink-dim">
        No roster slots configured. Check League Settings.
      </p>
    );
  }

  return (
    <div className="flex flex-col rounded-md border border-line bg-surface p-4 lg:h-full">
      <h3 className="shrink-0 font-display text-sm font-bold uppercase tracking-wide text-ink">
        My Team
      </h3>
      <div className="mt-3 overflow-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <tbody>
            {myRosterSlots.map((slot) => (
              <tr key={slot.slot} className="border-b border-stripe last:border-0">
                <td className="w-16 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {slot.slot}
                </td>
                <td className="px-3 py-2.5">
                  {slot.player ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <PlayerHeadshot name={slot.player.name} headshots={headshots} size={34} />
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate font-semibold text-ink">
                            {slot.player.name}
                          </span>
                          <span className="block truncate text-[11px] text-ink-faint">
                            {slot.player.positions.join("/")}
                          </span>
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-ink-faint">
                        {slot.player.team}
                        {hasProjections && ` · ${slot.player.fantasyPoints.toFixed(1)} pts`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-ink-faint">Empty</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
