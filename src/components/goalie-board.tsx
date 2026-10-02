"use client";

import { useMemo, useState } from "react";
import { useGoalieSpotStarts } from "@/lib/use-goalie-spot-starts";
import { useGoalieTracking } from "@/lib/use-goalie-tracking";
import type { GoalieStartTracking } from "@/lib/goalie-tracking-service";
import { useHeadshots } from "@/lib/use-headshots";
import { PlayerHeadshot } from "@/components/player-headshot";
import { currentWeekRange } from "@/lib/schedule";

type GoalieTab = "spot" | "tracker";

// Matches RECENT_WINDOW_TEAM_GAMES in goalie-tracking-service.ts - kept as a
// separate display string since the service doesn't export its constants.
const RECENT_WINDOW_LABEL = "10 games";

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" });
}

function winProbabilityColor(p: number): string {
  if (p >= 0.6) return "text-rink-green";
  if (p <= 0.4) return "text-rink-red";
  return "text-ink";
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_RANGE = currentWeekRange();

function SpotStartsTable() {
  const headshots = useHeadshots();
  const [rangeStart, setRangeStart] = useState(DEFAULT_RANGE.start);
  const [rangeEnd, setRangeEnd] = useState(DEFAULT_RANGE.end);
  const { spotStarts, error, loading } = useGoalieSpotStarts(rangeStart, rangeEnd);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function applyPreset(days: number) {
    setRangeStart(DEFAULT_RANGE.start);
    setRangeEnd(addDaysISO(DEFAULT_RANGE.start, days - 1));
    setSelectedDate(null);
  }

  function handleRangeStartChange(newStart: string) {
    setRangeStart(newStart);
    if (newStart > rangeEnd) setRangeEnd(addDaysISO(newStart, 6));
    setSelectedDate(null);
  }

  function handleRangeEndChange(newEnd: string) {
    setRangeEnd(newEnd);
    if (newEnd < rangeStart) setRangeStart(addDaysISO(newEnd, -6));
    setSelectedDate(null);
  }

  const availableDates = useMemo(
    () => Array.from(new Set((spotStarts ?? []).map((s) => s.date))).sort(),
    [spotStarts]
  );
  const effectiveDate = selectedDate ?? availableDates[0] ?? null;
  const ranked = (spotStarts ?? []).filter((r) => r.date === effectiveDate);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
          From
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => handleRangeStartChange(e.target.value)}
            className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
          To
          <input
            type="date"
            value={rangeEnd}
            onChange={(e) => handleRangeEndChange(e.target.value)}
            className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
          />
        </label>
        <div className="flex gap-1">
          <button
            onClick={() => applyPreset(7)}
            className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            This week
          </button>
          <button
            onClick={() => applyPreset(14)}
            className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            Next 2 weeks
          </button>
          <button
            onClick={() => applyPreset(28)}
            className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            Next 4 weeks
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-center text-sm text-ink-dim">Loading live goalie/schedule data...</p>
      ) : error ? (
        <p className="mt-3 text-center text-sm text-rink-red">{error}</p>
      ) : (
        <>
      <div className="mt-3 flex flex-wrap gap-1">
        {availableDates.map((date) => (
          <button
            key={date}
            onClick={() => setSelectedDate(date)}
            className={`rounded px-2 py-1 text-xs font-semibold ${
              effectiveDate === date
                ? "bg-rink-blue text-white"
                : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
            }`}
          >
            {formatDayLabel(date)}
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-hidden rounded-md border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Goalie</th>
            <th className="px-3 py-2">Matchup</th>
            <th className="px-3 py-2" title="Estimated probability this goalie's team wins - built from real season/home-road/last-10 win records via the log5 method, plus a small nudge for the goalie's own current form">
              Win Prob.
            </th>
            <th className="px-3 py-2">Recent SV%</th>
            <th className="px-3 py-2">Recent GAA</th>
            <th className="px-3 py-2" title="This goalie's save percentage over the full season, for comparison">
              Season SV%
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={`${r.name}-${r.date}`} className={`border-b border-stripe last:border-0 ${i % 2 === 1 ? "bg-stripe/60" : ""}`}>
              <td className="px-3 py-2 tabular-nums text-ink-dim">{i + 1}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <PlayerHeadshot name={r.name} team={r.team} positions={["G"]} headshots={headshots} size={30} />
                  <div>
                    <p className="font-semibold text-ink">{r.name}</p>
                    <p className="text-xs text-ink-faint">{r.team}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-ink-dim">
                <div>{r.isHome ? "vs" : "@"} {r.opponent}</div>
                <div className="text-xs text-ink-faint">{formatDayLabel(r.date)}</div>
              </td>
              <td className={`px-3 py-2 tabular-nums text-base font-bold ${winProbabilityColor(r.winProbability)}`}>
                {(r.winProbability * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2 tabular-nums text-ink-dim">{(r.recentSavePct * 100).toFixed(1)}%</td>
              <td className="px-3 py-2 tabular-nums text-ink-dim">{r.recentGaa.toFixed(2)}</td>
              <td className="px-3 py-2 tabular-nums text-ink-faint">{(r.seasonSavePct * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {availableDates.length === 0 ? (
        <p className="mt-3 text-center text-sm text-ink-dim">No games scheduled in this range.</p>
      ) : (
        ranked.length === 0 && (
          <p className="mt-3 text-center text-sm text-ink-dim">No projected starts on this day.</p>
        )
      )}
        </>
      )}
    </div>
  );
}

function ShareBar({ share, className }: { share: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-line ${className ?? ""}`}>
      <div
        className="h-full rounded-full bg-rink-blue"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%` }}
      />
    </div>
  );
}

function StartTrackerTable() {
  const headshots = useHeadshots();
  const { goalies, error, loading } = useGoalieTracking();

  const byTeam = useMemo(() => {
    const map = new Map<string, GoalieStartTracking[]>();
    for (const g of goalies ?? []) {
      const list = map.get(g.team) ?? [];
      list.push(g);
      map.set(g.team, list);
    }
    return map;
  }, [goalies]);

  if (loading) {
    return <p className="mt-3 text-center text-sm text-ink-dim">Loading live goalie stats...</p>;
  }
  if (error) {
    return <p className="mt-3 text-center text-sm text-rink-red">{error}</p>;
  }

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from(byTeam.entries()).map(([team, teamGoalies]) => (
        <div key={team} className="rounded-md border border-line bg-surface p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">{team}</p>
          <div className="mt-2 space-y-3">
            {teamGoalies.map((g) => (
              <div key={g.name}>
                <div className="flex items-center gap-2">
                  <PlayerHeadshot name={g.name} team={g.team} positions={["G"]} headshots={headshots} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-ink">{g.name}</p>
                      {g.isCurrentStarter && (
                        <span className="shrink-0 rounded bg-rink-blue-light px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rink-blue">
                          Starter
                        </span>
                      )}
                      {g.takingOver && (
                        <span className="shrink-0 rounded bg-rink-gold-light px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rink-gold">
                          Taking Over
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-faint">
                      {g.recentGp} of last {teamGoalies.reduce((s, x) => s + x.recentGp, 0)} tracked starts (
                      {(g.recentShare * 100).toFixed(0)}%) &middot; {(g.recentSavePct * 100).toFixed(1)}% SV%,{" "}
                      {g.recentGaa.toFixed(2)} GAA
                    </p>
                  </div>
                </div>
                <ShareBar share={g.recentShare} className="mt-1.5" />
                <p className="mt-1 text-[10.5px] text-ink-faint">
                  Season: {(g.seasonShare * 100).toFixed(0)}% share &middot; {(g.seasonSavePct * 100).toFixed(1)}%
                  SV%, {g.seasonGaa.toFixed(2)} GAA
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {byTeam.size === 0 && (
        <p className="col-span-full text-center text-sm text-ink-dim">No recent goalie data available.</p>
      )}
    </div>
  );
}

export function GoalieBoard() {
  const [tab, setTab] = useState<GoalieTab>("spot");

  return (
    <div>
      {tab === "spot" ? (
        <div className="rounded-md border-l-4 border-rink-blue bg-rink-blue-light px-4 py-2.5 text-sm text-ink">
          Live data: real win/loss records (NHL standings) and each team&apos;s presumed starter
          (Start Tracker&apos;s current-share leader) feed a genuine win-probability estimate via the
          log5 method - not a goal-differential proxy. &quot;Presumed starter&quot; isn&apos;t a
          confirmed lineup though - nobody publishes that for free, so a back-to-back or surprise
          rest day can differ from the projection.
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-rink-blue bg-rink-blue-light px-4 py-2.5 text-sm text-ink">
          Live data from Natural Stat Trick. &quot;Starts&quot; means games with recorded ice time
          over each team&apos;s last {" "}
          {RECENT_WINDOW_LABEL} - the closest real signal available without a per-game start log,
          so a relief appearance can very occasionally inflate a share slightly.
        </div>
      )}

      <div className="mt-4 flex gap-1 border-b border-line">
        <button
          onClick={() => setTab("spot")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${
            tab === "spot" ? "border-rink-blue text-ink" : "border-transparent text-ink-faint hover:text-ink-dim"
          }`}
        >
          Spot Starts
        </button>
        <button
          onClick={() => setTab("tracker")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${
            tab === "tracker" ? "border-rink-blue text-ink" : "border-transparent text-ink-faint hover:text-ink-dim"
          }`}
        >
          Start Tracker
        </button>
      </div>

      {tab === "spot" ? (
        <>
          <p className="mt-3 text-xs text-ink-dim">
            Ranked by estimated win probability - usually the single biggest chunk of a goalie&apos;s
            fantasy points on a given start.
          </p>
          <SpotStartsTable />
        </>
      ) : (
        <>
          <p className="mt-3 text-xs text-ink-dim">
            Who&apos;s actually getting the starts right now, by team - each goalie&apos;s share of
            recent starts vs. their season-long share, with a &quot;Taking Over&quot; flag when a
            backup&apos;s share has jumped enough to suggest they&apos;re claiming the net.
          </p>
          <StartTrackerTable />
        </>
      )}
    </div>
  );
}
