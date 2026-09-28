"use client";

import { useMemo, useState } from "react";
import { computeCompositeRankingsByGroup } from "@/lib/streamer-stats";
import { SAMPLE_SKATER_STATS } from "@/lib/streamer-sample-data";
import { computeFitDays, SAMPLE_ROSTER_SLOTS } from "@/lib/roster-fit";
import { useMyRoster } from "@/lib/use-my-roster";
import { useYahooRoster } from "@/lib/use-yahoo-roster";
import { useYahooFreeAgents } from "@/lib/use-yahoo-free-agents";
import { normalizeName } from "@/lib/name-matching";
import { RosterEditor, type RosterPoolPlayer } from "@/components/roster-editor";
import type { SkaterPosition } from "@/lib/types";
import type { PlayerEvaluatorStats } from "@/lib/player-evaluator-service";
import { useScheduleRange } from "@/lib/use-schedule-range";
import { currentWeekRange } from "@/lib/schedule";
import { SkaterRankingsTable, type ExtraColumn } from "@/components/skater-rankings-table";
import { PlayerHeadshot } from "@/components/player-headshot";
import type { HeadshotMap } from "@/lib/headshots";

// Drop & Replace always ranks by the last-5-games window - it's a "who do I
// stream this week" decision, not a season-long evaluation, so the shorter
// window is the relevant one (matching what the original Streamer
// Suggestions tool always used).
const WINDOW_LABEL = "last 5 games";

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function datesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) dates.push(d);
  return dates;
}

const MAX_DAY_BOXES = 7;

function FitDayIndicator({ fitDates, rangeDays }: { fitDates: string[]; rangeDays: string[] }) {
  const fitSet = new Set(fitDates);
  const showDots = rangeDays.length <= MAX_DAY_BOXES;
  return (
    <div className="flex flex-nowrap items-center gap-2">
      {showDots && (
        <div className="flex flex-nowrap items-center gap-[3px]">
          {rangeDays.map((date) => (
            <span
              key={date}
              title={`${date}${fitSet.has(date) ? " - startable" : ""}`}
              className={`h-2 w-2 shrink-0 rounded-full ${fitSet.has(date) ? "bg-rink-blue" : "bg-line"}`}
            />
          ))}
        </div>
      )}
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-ink-dim">
        {fitDates.length} fit{fitDates.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

const DEFAULT_RANGE = currentWeekRange();
// Stable reference (not a fresh [] literal every render) so useMemo hooks
// keyed on `roster` don't think it changed every render while it's loading.
const EMPTY_ROSTER: never[] = [];

export function DropReplaceFlow({
  liveWindows,
  headshots,
  activeLeagueKey,
  onClose,
}: {
  liveWindows: PlayerEvaluatorStats | null;
  headshots: HeadshotMap;
  activeLeagueKey: string | null;
  onClose: () => void;
}) {
  const [dropCandidates, setDropCandidates] = useState<Set<string>>(new Set());
  const [rangeStart, setRangeStart] = useState(DEFAULT_RANGE.start);
  const [rangeEnd, setRangeEnd] = useState(DEFAULT_RANGE.end);
  const [gamesFilter, setGamesFilter] = useState<number | null>(null);
  const [editingRoster, setEditingRoster] = useState(false);
  const { roster: manualRoster, setRoster: setManualRoster } = useMyRoster();
  const { roster: yahooRoster, slots: yahooSlots, loading: yahooRosterLoading } = useYahooRoster(activeLeagueKey);
  const { freeAgents: yahooFreeAgents, loading: yahooFreeAgentsLoading } = useYahooFreeAgents(activeLeagueKey);
  const { data: schedule } = useScheduleRange(rangeStart, rangeEnd);

  // A connected Yahoo league is the real roster/slots - the manual editor
  // is a fallback for when no league is connected yet, not something that
  // edits your actual Yahoo team.
  const usingYahoo = Boolean(activeLeagueKey);
  const roster = usingYahoo ? (yahooRoster ?? EMPTY_ROSTER) : manualRoster;
  const rosterSlots = yahooSlots ?? SAMPLE_ROSTER_SLOTS;
  const rosterLoading = usingYahoo && yahooRosterLoading;

  const statSource = liveWindows ? liveWindows.last5 : SAMPLE_SKATER_STATS;
  const byGroup = useMemo(() => computeCompositeRankingsByGroup(statSource), [statSource]);
  const allRanked = useMemo(() => [...byGroup.forwards, ...byGroup.defense], [byGroup]);
  const byName = useMemo(() => new Map(allRanked.map((p) => [p.name, p])), [allRanked]);

  // The roster picker always shows all 14 real roster players, even ones
  // currently missing from the live last-5-games pool (hurt, scratched, a
  // callup too new to qualify) - they still occupy their slot regardless
  // of whether they cleared a stats pool, so C-Score just shows "N/A" for
  // them rather than silently vanishing from the list.

  function toggleDropCandidate(name: string) {
    setDropCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setGamesFilter(null); // re-adopt the dynamic default once the roster changes
  }

  function applyPreset(days: number) {
    setRangeStart(DEFAULT_RANGE.start);
    setRangeEnd(addDaysISO(DEFAULT_RANGE.start, days - 1));
  }

  function handleRangeStartChange(newStart: string) {
    setRangeStart(newStart);
    if (newStart > rangeEnd) setRangeEnd(addDaysISO(newStart, 6));
  }

  function handleRangeEndChange(newEnd: string) {
    setRangeEnd(newEnd);
    if (newEnd < rangeStart) setRangeStart(addDaysISO(newEnd, -6));
  }

  const rangeDays = useMemo(() => datesInRange(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  const droppedGroups = useMemo(
    () =>
      new Set(
        roster.filter((p) => dropCandidates.has(p.name)).map((p) => (p.positions.includes("D") ? "D" : "F"))
      ),
    [dropCandidates, roster]
  );

  // Full roster minus whoever you're dropping - all 18 genuinely compete
  // for the active slots each day (lineups can be reshuffled daily, so
  // there's no fixed "these 14 are always active" subset - which players
  // actually start on a given day is just whatever that day's matching
  // works out).
  const rosterForFit = useMemo(
    () => roster.filter((p) => !dropCandidates.has(p.name)),
    [dropCandidates, roster]
  );

  // With a Yahoo league connected, candidates are exactly that league's real
  // free agents, using Yahoo's own multi-position eligibility. Otherwise,
  // falls back to "anyone not on my roster."
  const candidates = useMemo(() => {
    const rosterSet = new Set(roster.map((p) => normalizeName(p.name)));
    const groupOk = (positions: string[]) => {
      const group = positions.includes("D") ? "D" : "F";
      return droppedGroups.size === 0 || droppedGroups.has(group);
    };

    if (usingYahoo && !yahooFreeAgents) return []; // still loading - don't flash "everyone" as a candidate

    if (yahooFreeAgents) {
      const rankIndex = new Map(allRanked.map((p, i) => [normalizeName(p.name), i]));
      return yahooFreeAgents
        .filter((fa) => !rosterSet.has(normalizeName(fa.name)) && groupOk(fa.positions))
        .flatMap((fa) => {
          const i = rankIndex.get(normalizeName(fa.name));
          if (i === undefined) return []; // no stats in this window, so nothing to rank
          return [{ index: i, player: { ...allRanked[i], team: fa.team, positions: fa.positions } }];
        })
        .sort((a, b) => a.index - b.index)
        .map((x) => x.player);
    }

    return allRanked.filter((p) => !rosterSet.has(normalizeName(p.name)) && groupOk(p.positions));
  }, [allRanked, droppedGroups, roster, yahooFreeAgents, usingYahoo]);

  // Search pool for the roster editor: everyone in the stat windows.
  const rosterPool = useMemo(() => {
    const pool = new Map<string, RosterPoolPlayer>();
    const sources = liveWindows ? [liveWindows.season, liveWindows.last10, liveWindows.last5] : [SAMPLE_SKATER_STATS];
    for (const source of sources) {
      for (const s of source) {
        const key = normalizeName(s.name);
        if (pool.has(key)) continue;
        const positions = s.positions.filter((x): x is SkaterPosition => x !== "G");
        if (positions.length > 0) pool.set(key, { name: s.name, team: s.team, positions });
      }
    }
    return Array.from(pool.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [liveWindows]);

  // How many of the selected window's days each candidate could actually be
  // STARTED on your roster - not just how many games their team plays.
  const fitDaysByName = useMemo(() => {
    const map = new Map<string, string[]>();
    const gameDatesByTeam = schedule?.gameDatesByTeam ?? {};
    for (const p of candidates) {
      map.set(p.name, computeFitDays(p.team, p.positions, rangeDays, gameDatesByTeam, rosterForFit, rosterSlots));
    }
    return map;
  }, [candidates, rangeDays, schedule, rosterForFit, rosterSlots]);

  const gamesOptions = useMemo(() => {
    const counts = new Set<number>();
    for (const fits of fitDaysByName.values()) {
      if (fits.length > 0) counts.add(fits.length);
    }
    return Array.from(counts).sort((a, b) => b - a);
  }, [fitDaysByName]);

  const effectiveGamesFilter = gamesFilter ?? gamesOptions[0] ?? 0;

  const results = useMemo(
    () => candidates.filter((p) => (fitDaysByName.get(p.name)?.length ?? 0) === effectiveGamesFilter),
    [candidates, fitDaysByName, effectiveGamesFilter]
  );

  const scheduleColumn: ExtraColumn = {
    groupLabel: "Roster Fit",
    header: "Fits",
    widthPercent: 11,
    render: (p) => <FitDayIndicator fitDates={fitDaysByName.get(p.name) ?? []} rangeDays={rangeDays} />,
    sortValue: (p) => fitDaysByName.get(p.name)?.length ?? 0,
  };

  const step = dropCandidates.size === 0 ? 1 : 2;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-rink-blue-light px-2 py-1 text-xs font-bold text-rink-blue">
            Step {step} of 2
          </span>
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
            {step === 1 ? "Select Player(s) to Drop" : "Best Replacements"}
          </h2>
        </div>
        <button onClick={onClose} className="text-xs font-medium text-ink-faint hover:text-rink-red">
          Cancel
        </button>
      </div>

      <div className="mt-1 rounded-md border-l-4 border-rink-gold bg-rink-gold-light px-4 py-2.5 text-sm text-ink">
        {usingYahoo
          ? `Your roster and free agents come from your connected Yahoo league (${rosterSlots.C}C/${rosterSlots.LW}LW/${rosterSlots.RW}RW/${rosterSlots.D}D/${rosterSlots.UTIL} Util active). `
          : `Treating everyone not on your roster as available - connect a Yahoo league for real free-agent data. Slots are set to ${rosterSlots.C}C/${rosterSlots.LW}LW/${rosterSlots.RW}RW/${rosterSlots.D}D/${rosterSlots.UTIL} Util. `}
        Days-fit accounts for daily lineup changes (who&apos;s active vs. benched can differ day to
        day). C-Score is live data.
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Your roster ({roster.length})
        </span>
        {!usingYahoo && (
          <button
            onClick={() => setEditingRoster((v) => !v)}
            className="text-xs font-semibold text-rink-blue hover:underline"
          >
            {editingRoster ? "Done editing" : "Edit roster"}
          </button>
        )}
      </div>
      {editingRoster && !usingYahoo && (
        <div className="mt-2">
          <RosterEditor roster={manualRoster} onChange={setManualRoster} pool={rosterPool} />
        </div>
      )}

      {rosterLoading ? (
        <p className="mt-3 text-sm text-ink-dim">Loading your Yahoo roster...</p>
      ) : (
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {roster.map((p) => {
          const dropping = dropCandidates.has(p.name);
          const stats = byName.get(p.name);
          return (
            <button
              key={p.name}
              onClick={() => toggleDropCandidate(p.name)}
              className={`rounded-md border p-3 text-left ${
                dropping ? "border-2 border-rink-red bg-rink-red-light" : "border-line bg-surface"
              }`}
            >
              <div className="flex items-center gap-2">
                <PlayerHeadshot name={p.name} headshots={headshots} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{p.name}</div>
                  <div className="text-xs text-ink-faint">
                    {p.team} &middot; {p.positions.join("/")}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-ink-dim">
                C-Score {stats ? stats.compositeRank.toFixed(1) : "N/A"}
              </div>
              {dropping && (
                <div className="mt-2 rounded bg-rink-red px-2 py-1 text-center text-xs font-bold text-white">
                  Dropping
                </div>
              )}
            </button>
          );
        })}
      </div>
      )}

      {step === 2 && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
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
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
              Roster fits
              <select
                value={effectiveGamesFilter}
                onChange={(e) => setGamesFilter(Number(e.target.value))}
                className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
              >
                {gamesOptions.length === 0 ? (
                  <option value={0}>No fits in range</option>
                ) : (
                  gamesOptions.map((count) => (
                    <option key={count} value={count}>
                      {count} game{count === 1 ? "" : "s"}
                    </option>
                  ))
                )}
              </select>
            </label>
            <span className="text-xs text-ink-faint">
              Filtered to {droppedGroups.has("F") && droppedGroups.has("D") ? "forwards and defense" : droppedGroups.has("D") ? "defense" : "forwards"}
              , ranked by C-Score ({WINDOW_LABEL})
            </span>
          </div>

          {usingYahoo && yahooFreeAgentsLoading ? (
            <p className="mt-4 text-center text-sm text-ink-dim">Loading your league&apos;s free agents...</p>
          ) : (
            <>
              <SkaterRankingsTable
                ranked={results}
                headshots={headshots}
                windowLabel={WINDOW_LABEL}
                extraColumn={scheduleColumn}
                abbreviateNames={false}
              />

              {results.length === 0 && (
                <p className="mt-4 text-center text-sm text-ink-dim">
                  No free agents fit that many games in your roster this window.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
