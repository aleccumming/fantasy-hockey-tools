"use client";

import { useMemo, useState } from "react";
import { computeCompositeRankingsByGroup } from "@/lib/streamer-stats";
import { SAMPLE_SKATER_STATS } from "@/lib/streamer-sample-data";
import { computeFitDays, computeMoveSummary, SAMPLE_ROSTER_SLOTS, type RosterFitPlayer } from "@/lib/roster-fit";
import type { RankedSkaterStats } from "@/lib/streamer-stats";
import { useMyRoster } from "@/lib/use-my-roster";
import { useYahooRoster } from "@/lib/use-yahoo-roster";
import { useYahooFreeAgents } from "@/lib/use-yahoo-free-agents";
import { normalizeName } from "@/lib/name-matching";
import { RosterEditor, type RosterPoolPlayer } from "@/components/roster-editor";
import type { SkaterPosition } from "@/lib/types";
import type { PlayerEvaluatorStats } from "@/lib/player-evaluator-service";
import { useScheduleRange } from "@/lib/use-schedule-range";
import { remainingWeekRange } from "@/lib/schedule";
import { SkaterRankingsTable, type ExtraColumn } from "@/components/skater-rankings-table";
import { PlayerHeadshot } from "@/components/player-headshot";
import { StagedMovePanel } from "@/components/staged-move-panel";
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

function toFitPlayer(p: RankedSkaterStats): RosterFitPlayer {
  return { name: p.name, team: p.team, positions: p.positions.filter((x): x is SkaterPosition => x !== "G") };
}

function FitDayIndicator({
  fitDates,
  rangeDays,
  countOnly = false,
}: {
  fitDates: string[];
  rangeDays: string[];
  /** Just the number after the dots ("3"), not "3 starts" - for the
   *  candidate table, whose column header already says "Starts". */
  countOnly?: boolean;
}) {
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
        {fitDates.length}
        {!countOnly && ` start${fitDates.length === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

// Starts today, not Monday - days already played can't be streamed, so
// counting them inflated both a candidate's Starts and a drop's "You lose".
const DEFAULT_RANGE = remainingWeekRange();
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
  // Adds being planned together as one move, in the order they were staged.
  // Kept across Forwards/Defense switches (a move can mix both) and across
  // drop changes - if a drop change leaves too little room, the panel warns
  // rather than silently discarding what was staged.
  const [staged, setStaged] = useState<RankedSkaterStats[]>([]);
  const [groupFilter, setGroupFilter] = useState<"F" | "D">("F");
  const [rangeStart, setRangeStart] = useState(DEFAULT_RANGE.start);
  const [rangeEnd, setRangeEnd] = useState(DEFAULT_RANGE.end);
  const [gamesFilter, setGamesFilter] = useState<number | null>(null);
  const [editingRoster, setEditingRoster] = useState(false);
  const { roster: manualRoster, setRoster: setManualRoster } = useMyRoster();
  const {
    roster: yahooRoster,
    slots: yahooSlots,
    capacity: yahooCapacity,
    loading: yahooRosterLoading,
  } = useYahooRoster(activeLeagueKey);
  const { freeAgents: yahooFreeAgents, loading: yahooFreeAgentsLoading } = useYahooFreeAgents(activeLeagueKey);
  const { data: schedule, loading: scheduleLoading, error: scheduleError } = useScheduleRange(rangeStart, rangeEnd);

  // A connected Yahoo league is the real roster/slots - the manual editor
  // is a fallback for when no league is connected yet, not something that
  // edits your actual Yahoo team.
  const usingYahoo = Boolean(activeLeagueKey);
  const roster = usingYahoo ? (yahooRoster ?? EMPTY_ROSTER) : manualRoster;
  const rosterSlots = yahooSlots ?? SAMPLE_ROSTER_SLOTS;
  const rosterLoading = usingYahoo && yahooRosterLoading;
  // Goalies are selectable as a drop (freeing roster space) but never part
  // of the skater roster-fit slot matching - an empty positions array would
  // otherwise look "eligible" for the universal UTIL slot. IR/IR+ players
  // are excluded too - they can never actually be placed in an active
  // lineup slot, so counting them as "competition" for a slot on days they
  // play was phantom competition that made the roster look fuller than it
  // really is (confirmed live: a player parked on IR who also plays on a
  // given day was blocking that day's slot in the fit-days matching below,
  // understating both candidates' "Starts" and a drop candidate's "games
  // you'd lose" - a real IR+ player never occupies that slot at all).
  const skaterRoster = useMemo(() => roster.filter((p) => !p.isGoalie && !p.isOnIR), [roster]);

  // A player parked on IR/IR+ doesn't count against the league's roster cap
  // - that's the whole point of the slot, and it's how a real Yahoo manager
  // can add a streamer without dropping anyone once someone's hurt. So
  // "do I have room to add" depends on real roster usage vs. capacity, not
  // on whether a drop is selected at all - and dropping an IR+ player
  // specifically doesn't free any of that capacity, since it was never
  // being used. Manual/sample mode has no real capacity model, so it keeps
  // the older "you must pick a drop" behavior.
  const droppingNonIRCount =
    usingYahoo && yahooRoster
      ? yahooRoster.filter((p) => dropCandidates.has(p.name) && !p.isOnIR).length
      : 0;
  const currentRosterUsage = usingYahoo && yahooRoster ? yahooRoster.filter((p) => !p.isOnIR).length : null;
  const projectedRosterUsage = currentRosterUsage !== null ? currentRosterUsage - droppingNonIRCount : null;
  const hasRoomToAdd = usingYahoo
    ? yahooCapacity !== null && projectedRosterUsage !== null && projectedRosterUsage < yahooCapacity
    : dropCandidates.size > 0;
  // How many adds the current drops make room for. Manual/sample mode has
  // no real capacity model, so it's one add per drop there.
  const maxAdds = usingYahoo
    ? yahooCapacity !== null && projectedRosterUsage !== null
      ? Math.max(0, yahooCapacity - projectedRosterUsage)
      : 0
    : dropCandidates.size;
  const droppingOnlyIRPlayers =
    usingYahoo &&
    dropCandidates.size > 0 &&
    droppingNonIRCount === 0 &&
    (yahooRoster?.some((p) => dropCandidates.has(p.name) && p.isOnIR) ?? false);

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

  function toggleStaged(p: RankedSkaterStats) {
    setStaged((prev) => (prev.some((s) => s.name === p.name) ? prev.filter((s) => s.name !== p.name) : [...prev, p]));
    setGamesFilter(null); // every other candidate's starts just changed
  }

  // Presets run from today to the end of this matchup week, or 1/3 weeks
  // past it - always ending on a Sunday so a range lines up with real
  // Monday-Sunday matchups.
  function applyPreset(extraWeeks: number) {
    setRangeStart(DEFAULT_RANGE.start);
    setRangeEnd(addDaysISO(DEFAULT_RANGE.end, extraWeeks * 7));
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

  // Full skater roster minus whoever you're dropping - all of them
  // genuinely compete for the active slots each day (lineups can be
  // reshuffled daily, so there's no fixed "these are always active"
  // subset - which players actually start on a given day is just whatever
  // that day's matching works out). Goalies never occupy a skater slot, so
  // dropping one doesn't change this set at all.
  const rosterForFit = useMemo(
    () => skaterRoster.filter((p) => !dropCandidates.has(p.name)),
    [dropCandidates, skaterRoster]
  );

  // With a Yahoo league connected, candidates are exactly that league's real
  // free agents, using Yahoo's own multi-position eligibility. Otherwise,
  // falls back to "anyone not on my roster."
  const candidates = useMemo(() => {
    const rosterSet = new Set(roster.map((p) => normalizeName(p.name)));
    const groupOk = (positions: string[]) => {
      const group = positions.includes("D") ? "D" : "F";
      return groupFilter === group;
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
  }, [allRanked, groupFilter, roster, yahooFreeAgents, usingYahoo]);

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

  const stagedFit = useMemo(() => staged.map(toFitPlayer), [staged]);

  // How many of the selected window's days each candidate could actually be
  // STARTED on your roster - not just how many games their team plays.
  // Staged adds count as already on the roster, so each candidate is only
  // credited with starts still open after them - two streamers fighting
  // over the same slot can't both claim it. (A staged player's own count is
  // against the OTHER staged adds, i.e. what they add to the rest of the
  // move.)
  const fitDaysByName = useMemo(() => {
    const map = new Map<string, string[]>();
    const gameDatesByTeam = schedule?.gameDatesByTeam ?? {};
    for (const p of candidates) {
      const roster = [...rosterForFit, ...stagedFit.filter((s) => s.name !== p.name)];
      map.set(p.name, computeFitDays(p.team, p.positions, rangeDays, gameDatesByTeam, roster, rosterSlots));
    }
    return map;
  }, [candidates, rangeDays, schedule, rosterForFit, stagedFit, rosterSlots]);

  const moveSummary = useMemo(() => {
    if (staged.length === 0 || !schedule) return null;
    return computeMoveSummary(skaterRoster, rosterForFit, stagedFit, rangeDays, schedule.gameDatesByTeam, rosterSlots);
  }, [staged.length, schedule, skaterRoster, rosterForFit, stagedFit, rangeDays, rosterSlots]);

  // The flip side of fitDaysByName - only computed for whichever player(s)
  // are actually selected to drop (not the whole roster at once), and only
  // for them: how many of the selected range's days they'd actually start
  // if kept, i.e. what you'd be giving up by dropping them.
  //
  // Deliberately NOT ranked by C-Score or TOI or anything else - an
  // earlier version tried sorting the roster by value to decide "who wins
  // a tight slot," but that requires picking a signal to judge every OTHER
  // rostered player by, which is exactly the kind of reactive, subjective
  // call (a star in a slump, a hot low-minute streamer) this app avoids
  // making on a user's behalf elsewhere too. Scoping this to only the
  // player being evaluated sidesteps the question entirely: it's the same
  // "does adding them back increase the headcount" test as fitDaysByName
  // uses for free agents, just run against the CURRENT roster instead of
  // one with a drop already applied. No ranking of teammates required.
  const lostGamesByName = useMemo(() => {
    const map = new Map<string, string[]>();
    if (dropCandidates.size === 0) return map;
    const gameDatesByTeam = schedule?.gameDatesByTeam ?? {};
    for (const p of skaterRoster) {
      if (!dropCandidates.has(p.name)) continue;
      const others = skaterRoster.filter((o) => o.name !== p.name);
      map.set(p.name, computeFitDays(p.team, p.positions, rangeDays, gameDatesByTeam, others, rosterSlots));
    }
    return map;
  }, [skaterRoster, dropCandidates, rangeDays, schedule, rosterSlots]);

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

  const stagedNames = new Set(staged.map((p) => p.name));
  const extraColumns: ExtraColumn[] = [
    {
      groupLabel: "Roster Fit",
      header: "Starts",
      widthPx: 112,
      center: true,
      render: (p) => <FitDayIndicator fitDates={fitDaysByName.get(p.name) ?? []} rangeDays={rangeDays} countOnly />,
      sortValue: (p) => fitDaysByName.get(p.name)?.length ?? 0,
    },
    {
      // Icon-only and narrow on purpose - the table is already wider than
      // most screens, and a text button here pushed it further.
      groupLabel: "",
      header: "Add",
      widthPx: 36,
      compact: true,
      render: (p) => {
        const isStaged = stagedNames.has(p.name);
        const full = !isStaged && staged.length >= maxAdds;
        return (
          <button
            onClick={() => toggleStaged(p)}
            disabled={full}
            aria-label={isStaged ? `Unstage ${p.name}` : `Stage ${p.name}`}
            title={
              isStaged
                ? "Staged - click to remove"
                : full
                  ? `Your drops only make room for ${maxAdds} add${maxAdds === 1 ? "" : "s"}`
                  : "Stage this add"
            }
            className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold leading-none ${
              isStaged
                ? "bg-rink-blue text-white hover:bg-rink-red"
                : full
                  ? "cursor-not-allowed border border-line text-ink-faint opacity-50"
                  : "border border-rink-blue text-rink-blue hover:bg-rink-blue-light"
            }`}
          >
            {isStaged ? "✓" : "+"}
          </button>
        );
      },
    },
  ];

  const step = hasRoomToAdd ? 2 : 1;
  const addingWithoutDropping = usingYahoo && dropCandidates.size === 0 && hasRoomToAdd;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-rink-blue-light px-2 py-1 text-xs font-bold text-rink-blue">
            Step {step} of 2
          </span>
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
            {step === 1
              ? "Select Player(s) to Drop"
              : addingWithoutDropping
                ? "Best Adds - You Have Roster Room"
                : "Best Replacements"}
          </h2>
        </div>
        <button onClick={onClose} className="text-xs font-medium text-ink-faint hover:text-rink-red">
          Cancel
        </button>
      </div>

      {usingYahoo && currentRosterUsage !== null && yahooCapacity !== null && (
        <p className="mt-1 text-xs text-ink-faint">
          Roster: {currentRosterUsage}/{yahooCapacity} spots used
          {addingWithoutDropping && " - you have IR+ room to add without dropping anyone"}
          {droppingOnlyIRPlayers &&
            " - the player(s) you've selected are on IR+ and don't free a roster spot, so pick a non-IR+ player too if you need the room"}
        </p>
      )}

      <div className="mt-1 rounded-md border-l-4 border-rink-gold bg-rink-gold-light px-4 py-2.5 text-sm text-ink">
        {usingYahoo
          ? `Your roster and free agents come from your connected Yahoo league (${rosterSlots.C}C/${rosterSlots.LW}LW/${rosterSlots.RW}RW/${rosterSlots.D}D/${rosterSlots.UTIL} Util active). `
          : `Treating everyone not on your roster as available - connect a Yahoo league for real free-agent data. Slots are set to ${rosterSlots.C}C/${rosterSlots.LW}LW/${rosterSlots.RW}RW/${rosterSlots.D}D/${rosterSlots.UTIL} Util. `}
        Starts account for daily lineup changes (who&apos;s active vs. benched can differ day to
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
                <PlayerHeadshot
                  name={p.name}
                  team={p.team}
                  positions={p.isGoalie ? ["G"] : p.positions}
                  headshots={headshots}
                  size={32}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                    {p.isOnIR && (
                      <span className="shrink-0 rounded bg-rink-gold-light px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rink-gold">
                        IR+
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {p.team} &middot; {p.isGoalie ? "G" : p.positions.join("/")}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-ink-dim">
                C-Score {stats ? stats.compositeRank.toFixed(1) : "N/A"}
              </div>
              {dropping && (
                <>
                  {!p.isGoalie && (
                    <div className="mt-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                        You lose
                      </span>
                      {scheduleLoading ? (
                        <p className="text-xs text-ink-faint">Loading schedule...</p>
                      ) : scheduleError ? (
                        <p className="text-xs text-rink-red" title={scheduleError}>
                          Schedule didn&apos;t load - unknown
                        </p>
                      ) : (
                        <div
                          title={`Games this player could start from ${rangeStart} to ${rangeEnd} if you kept them - 0 means dropping them costs nothing in this range (bye week, or no room in your lineup anyway)`}
                        >
                          <FitDayIndicator
                            fitDates={lostGamesByName.get(p.name) ?? []}
                            rangeDays={rangeDays}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 rounded bg-rink-red px-2 py-1 text-center text-xs font-bold text-white">
                    Dropping
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
      )}

      {staged.length > 0 && (
        <StagedMovePanel
          staged={staged}
          summary={moveSummary}
          maxAdds={maxAdds}
          scheduleReady={!scheduleLoading && !scheduleError && Boolean(schedule)}
          headshots={headshots}
          onUnstage={(name) => {
            setStaged((prev) => prev.filter((p) => p.name !== name));
            setGamesFilter(null);
          }}
          onClear={() => {
            setStaged([]);
            setGamesFilter(null);
          }}
        />
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
                onClick={() => applyPreset(0)}
                className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
              >
                This week
              </button>
              <button
                onClick={() => applyPreset(1)}
                className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
              >
                Next 2 weeks
              </button>
              <button
                onClick={() => applyPreset(3)}
                className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
              >
                Next 4 weeks
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
              Starts
              <select
                value={effectiveGamesFilter}
                onChange={(e) => setGamesFilter(Number(e.target.value))}
                className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
              >
                {gamesOptions.length === 0 ? (
                  <option value={0}>None in range</option>
                ) : (
                  gamesOptions.map((count) => (
                    <option key={count} value={count}>
                      {count} start{count === 1 ? "" : "s"}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="flex gap-1">
              {(["F", "D"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    groupFilter === g
                      ? "bg-rink-blue text-white"
                      : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                  }`}
                >
                  {g === "F" ? "Forwards" : "Defense"}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-faint">
              ranked by C-Score ({WINDOW_LABEL}) &middot; room for {maxAdds} add{maxAdds === 1 ? "" : "s"}
            </span>
          </div>

          {usingYahoo && yahooFreeAgentsLoading ? (
            <p className="mt-4 text-center text-sm text-ink-dim">Loading your league&apos;s free agents...</p>
          ) : scheduleLoading ? (
            <p className="mt-4 text-center text-sm text-ink-dim">Loading the NHL schedule for this range...</p>
          ) : scheduleError ? (
            <p className="mt-4 text-center text-sm text-rink-red">
              Couldn&apos;t load the schedule ({scheduleError}) - starts below aren&apos;t reliable until this
              loads. Try a different date range or refresh.
            </p>
          ) : (
            <>
              <SkaterRankingsTable
                ranked={results}
                headshots={headshots}
                windowLabel={WINDOW_LABEL}
                extraColumns={extraColumns}
              />

              {results.length === 0 && (
                <p className="mt-4 text-center text-sm text-ink-dim">
                  No free agents can start that many games in your lineup in this range.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
