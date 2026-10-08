"use client";

import type { MoveSummary } from "@/lib/roster-fit";
import type { RankedSkaterStats } from "@/lib/streamer-stats";
import type { HeadshotMap } from "@/lib/headshots";
import { PlayerHeadshot } from "@/components/player-headshot";
import { abbreviateFirstName } from "@/components/skater-rankings-table";

function dayLabel(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).slice(0, 2),
    day: String(d.getUTCDate()),
  };
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** The "whole move" view for Drop & Replace's multi-add staging: every
 *  staged add's day-by-day starts, solved jointly (computeMoveSummary) so
 *  two adds competing for one open slot show up as a conflict instead of
 *  both being counted - plus the net value of the entire move, drops
 *  included. */
export function StagedMovePanel({
  staged,
  summary,
  maxAdds,
  scheduleReady,
  headshots,
  onUnstage,
  onClear,
}: {
  /** In staging order - on a conflict day, the earlier-staged add is the
   *  one shown starting (see computeMoveSummary). */
  staged: RankedSkaterStats[];
  summary: MoveSummary | null;
  /** How many adds the current drops make room for. */
  maxAdds: number;
  scheduleReady: boolean;
  headshots: HeadshotMap;
  onUnstage: (name: string) => void;
  onClear: () => void;
}) {
  const overCapacity = staged.length > maxAdds;
  const startsByName = new Map<string, number>();
  for (const day of summary?.days ?? []) {
    for (const name of day.addsStarting) startsByName.set(name, (startsByName.get(name) ?? 0) + 1);
  }
  const conflictDays = (summary?.days ?? []).filter((d) => d.addsBenched.length > 0);

  return (
    <div className="mt-6 rounded-md border border-rink-blue bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
            Staged Adds ({staged.length}/{maxAdds})
          </h3>
          {summary && scheduleReady && !overCapacity && (
            <span className="text-sm text-ink-dim">
              This move:{" "}
              <span
                className={`font-bold ${
                  summary.netStarts > 0 ? "text-rink-green" : summary.netStarts < 0 ? "text-rink-red" : "text-ink"
                }`}
              >
                {signed(summary.netStarts)} net start{Math.abs(summary.netStarts) === 1 ? "" : "s"}
              </span>{" "}
              <span className="text-xs text-ink-faint">
                (adds gain {summary.startsGained}, drops cost {summary.startsLost})
              </span>
            </span>
          )}
        </div>
        <button onClick={onClear} className="text-xs font-medium text-ink-faint hover:text-rink-red">
          Clear all
        </button>
      </div>

      {overCapacity && (
        <p className="mt-2 rounded border-l-4 border-rink-red bg-rink-red-light px-3 py-1.5 text-xs text-ink">
          You&apos;ve staged {staged.length} adds but your drops only make room for {maxAdds}. Drop another
          player or unstage {staged.length - maxAdds} - the numbers below assume a roster you can&apos;t actually
          have.
        </p>
      )}

      {!scheduleReady || !summary ? (
        <p className="mt-3 text-sm text-ink-dim">Waiting on the schedule for this range...</p>
      ) : (
        <>
          <div className={`mt-3 overflow-x-auto ${overCapacity ? "opacity-50" : ""}`}>
            <table className="text-xs">
              <thead>
                <tr className="text-ink-faint">
                  <th className="pr-3 text-left font-semibold uppercase tracking-wide">Player</th>
                  {summary.days.map((d) => {
                    const { weekday, day } = dayLabel(d.date);
                    return (
                      <th key={d.date} className="w-7 px-0.5 text-center font-medium" title={d.date}>
                        <div>{weekday}</div>
                        <div className="tabular-nums">{day}</div>
                      </th>
                    );
                  })}
                  <th className="pl-3 text-right font-semibold uppercase tracking-wide">Starts</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staged.map((p) => (
                  <tr key={p.name} className="border-t border-stripe">
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <PlayerHeadshot
                          name={p.name}
                          team={p.team}
                          positions={p.positions}
                          headshots={headshots}
                          size={24}
                        />
                        <span className="font-semibold text-ink" title={p.name}>
                          {abbreviateFirstName(p.name)}
                        </span>
                        <span className="text-ink-faint">
                          {p.positions.join("/")} - {p.team}
                        </span>
                      </div>
                    </td>
                    {summary.days.map((d) => {
                      const starts = d.addsStarting.includes(p.name);
                      const benched = d.addsBenched.includes(p.name);
                      return (
                        <td key={d.date} className="px-0.5 text-center">
                          <span
                            title={
                              starts
                                ? `${d.date} - starts`
                                : benched
                                  ? `${d.date} - plays, but no open slot for them`
                                  : `${d.date} - no game`
                            }
                            className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                              starts
                                ? "bg-rink-blue text-white"
                                : benched
                                  ? "border border-rink-red bg-rink-red-light text-rink-red"
                                  : "bg-line/50"
                            }`}
                          >
                            {benched ? "×" : ""}
                          </span>
                        </td>
                      );
                    })}
                    <td className="pl-3 text-right font-semibold tabular-nums text-ink">
                      {startsByName.get(p.name) ?? 0}
                    </td>
                    <td className="pl-3">
                      <button
                        onClick={() => onUnstage(p.name)}
                        className="text-[11px] font-medium text-ink-faint hover:text-rink-red"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <td className="py-1.5 pr-3 font-semibold text-ink-dim">Net vs. current roster</td>
                  {summary.days.map((d) => {
                    const net = d.startsAfter - d.startsBefore;
                    return (
                      <td
                        key={d.date}
                        className={`px-0.5 text-center font-semibold tabular-nums ${
                          net > 0 ? "text-rink-green" : net < 0 ? "text-rink-red" : "text-ink-faint"
                        }`}
                      >
                        {net === 0 ? "·" : signed(net)}
                      </td>
                    );
                  })}
                  <td className="pl-3 text-right font-bold tabular-nums text-ink">{signed(summary.netStarts)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {conflictDays.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ink-dim">
              {conflictDays.map((d) => {
                const playing = [...d.addsStarting, ...d.addsBenched].map(abbreviateFirstName);
                return (
                  <li key={d.date}>
                    <span className="font-semibold text-ink">{d.date}:</span>{" "}
                    {d.addsStarting.length === 0
                      ? `${playing.join(", ")} ${playing.length === 1 ? "plays" : "play"}, but your lineup has no open slot that day.`
                      : `${playing.join(", ")} all play, but there's only room for ${d.addsStarting.length} - you pick who starts.`}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
