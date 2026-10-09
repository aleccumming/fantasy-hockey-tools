"use client";

import { useMemo, useState } from "react";
import { computeCompositeRankingsByGroup, type RankedSkaterStats } from "@/lib/streamer-stats";
import { SAMPLE_SKATER_STATS } from "@/lib/streamer-sample-data";
import { useHeadshots } from "@/lib/use-headshots";
import { usePlayerEvaluatorStats } from "@/lib/use-player-evaluator-stats";
import type { EvaluatorWindow } from "@/lib/player-evaluator-service";
import { NHL_TEAMS } from "@/lib/schedule";
import { SkaterRankingsTable, LuckLegend } from "@/components/skater-rankings-table";
import { PlayerComparisonPanel, type ComparePlayerData } from "@/components/player-comparison-panel";
import { PlayerSearchPicker, type PickablePlayer } from "@/components/player-search-picker";
import { DropReplaceFlow } from "@/components/drop-replace-flow";
import { TeamMultiSelect } from "@/components/team-multi-select";
import { useMyRoster } from "@/lib/use-my-roster";
import { useYahooFreeAgents } from "@/lib/use-yahoo-free-agents";
import { useYahooPlayerEligibility } from "@/lib/use-yahoo-player-eligibility";
import { normalizeName } from "@/lib/name-matching";
import { applyEligibilityOverrides } from "@/lib/apply-eligibility-overrides";
import { dedupePlayersAcrossSources } from "@/lib/player-identity-key";
import type { Position } from "@/lib/types";

type PageTab = "rankings" | "compare";
type SkaterGroup = "F" | "D";
type OwnershipFilter = "all" | "unowned";

const WINDOW_TABS: { key: EvaluatorWindow; label: string; windowLabel: string }[] = [
  { key: "last5", label: "Last 5 Games", windowLabel: "last 5 games" },
  { key: "last10", label: "Last 10 Games", windowLabel: "last 10 games" },
  { key: "season", label: "Season", windowLabel: "this season" },
  { key: "lastSeason", label: "Last Season", windowLabel: "last season" },
];
const ALL_WINDOWS: EvaluatorWindow[] = ["last5", "last10", "season", "lastSeason"];
const SORTED_TEAMS = [...NHL_TEAMS].sort((a, b) => a.localeCompare(b));
const MIN_TOI_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 8, label: "8+ min/game" },
  { value: 12, label: "12+ min/game" },
  { value: 15, label: "15+ min/game" },
];
// Only meaningful for Season/Last Season - both are "full" season windows
// where a GP floor filters out real injury-shortened/limited-role players.
// Last 5/Last 10 already cap a player's possible GP at the window size, so
// a GP floor there would just duplicate "played every game" rather than
// filter out early-season noise.
const MIN_GP_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 5, label: "5+ GP" },
  { value: 10, label: "10+ GP" },
  { value: 20, label: "20+ GP" },
];

export function PlayerEvaluatorBoard({ activeLeagueKey }: { activeLeagueKey: string | null }) {
  const [pageTab, setPageTab] = useState<PageTab>("rankings");
  const [windowKey, setWindowKey] = useState<EvaluatorWindow>("last5");
  const [group, setGroup] = useState<SkaterGroup>("F");
  const [positionFilters, setPositionFilters] = useState<Set<Position>>(new Set());
  const [teamFilters, setTeamFilters] = useState<Set<string>>(new Set());
  const [minToi, setMinToi] = useState(0);
  const [minGp, setMinGp] = useState(0);
  const [nameQuery, setNameQuery] = useState("");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [player1, setPlayer1] = useState<string | null>(null);
  const [player2, setPlayer2] = useState<string | null>(null);
  const [dropReplaceOpen, setDropReplaceOpen] = useState(false);
  const headshots = useHeadshots();
  const { roster } = useMyRoster();
  const { freeAgents: yahooFreeAgents } = useYahooFreeAgents(activeLeagueKey);
  const { byName: yahooEligibilityByName } = useYahooPlayerEligibility();
  const { windows: liveWindows, computedAt, error: statsError, loading: statsLoading } = usePlayerEvaluatorStats();
  const usingSampleData = !liveWindows;
  // Season and Last Season are both "full" season windows (as opposed to
  // Last 5/Last 10, which cap GP at the window size by definition) - see
  // MIN_GP_OPTIONS comment.
  const isFullSeasonWindow = windowKey === "season" || windowKey === "lastSeason";

  // Rankings tab: ranked by whichever window is currently selected there.
  const statSource = liveWindows ? liveWindows[windowKey] : SAMPLE_SKATER_STATS;
  const byGroup = useMemo(() => {
    const corrected = applyEligibilityOverrides(statSource, yahooEligibilityByName);
    return computeCompositeRankingsByGroup(corrected);
  }, [statSource, yahooEligibilityByName]);
  const ranked = group === "F" ? byGroup.forwards : byGroup.defense;

  const filtered = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    // "Unowned" = actually available per the connected Yahoo league when
    // one's active; otherwise just "not on my (sample/manual) roster."
    const availableSet = yahooFreeAgents ? new Set(yahooFreeAgents.map((fa) => normalizeName(fa.name))) : null;
    const rosterSet = new Set(roster.map((p) => normalizeName(p.name)));
    return ranked.filter((p) => {
      if (group === "F" && positionFilters.size > 0 && !p.positions.some((pos) => positionFilters.has(pos))) {
        return false;
      }
      if (teamFilters.size > 0 && !teamFilters.has(p.team)) return false;
      if (p.toiPerGame < minToi) return false;
      if (isFullSeasonWindow && p.gamesPlayed < minGp) return false;
      if (query && !p.name.toLowerCase().includes(query)) return false;
      if (ownershipFilter === "unowned") {
        const key = normalizeName(p.name);
        if (availableSet ? !availableSet.has(key) : rosterSet.has(key)) return false;
      }
      return true;
    });
  }, [
    ranked,
    group,
    positionFilters,
    teamFilters,
    minToi,
    minGp,
    isFullSeasonWindow,
    nameQuery,
    ownershipFilter,
    roster,
    yahooFreeAgents,
  ]);

  // Compare tab: independent of Rankings' filters/window - ranks all four
  // windows up front so a player picked here shows Last 5 / Last 10 /
  // Season / Last Season side by side, regardless of what Rankings
  // currently has active.
  const rankingsByWindow = useMemo(() => {
    const result = {} as Record<EvaluatorWindow, { forwards: RankedSkaterStats[]; defense: RankedSkaterStats[] }>;
    for (const w of ALL_WINDOWS) {
      const source = liveWindows ? liveWindows[w] : SAMPLE_SKATER_STATS;
      const corrected = applyEligibilityOverrides(source, yahooEligibilityByName);
      result[w] = computeCompositeRankingsByGroup(corrected);
    }
    return result;
  }, [liveWindows, yahooEligibilityByName]);

  // Keyed by playerNameGroupKey, not bare name - a name-keyed Map would
  // silently keep only one of each real collision pair (Aho, Pettersson).
  const byIdByWindow = useMemo(() => {
    const result = {} as Record<EvaluatorWindow, Map<string, RankedSkaterStats>>;
    for (const w of ALL_WINDOWS) {
      result[w] = dedupePlayersAcrossSources(
        [[...rankingsByWindow[w].forwards, ...rankingsByWindow[w].defense]],
        (p) => p.name,
        (p) => p.positions
      );
    }
    return result;
  }, [rankingsByWindow]);

  const pickablePlayers: PickablePlayer[] = useMemo(() => {
    // Prefer the season window's team (most likely to be their current
    // team), then the shorter windows, then last season.
    const sources = (["season", "last10", "last5", "lastSeason"] as const).map((w) => [...byIdByWindow[w].values()]);
    const byId = dedupePlayersAcrossSources(sources, (p) => p.name, (p) => p.positions);
    return Array.from(byId, ([id, p]) => ({ id, name: p.name, team: p.team, positions: p.positions })).sort(
      (a, b) => a.name.localeCompare(b.name)
    );
  }, [byIdByWindow]);

  function buildCompareData(id: string): ComparePlayerData | null {
    const windows = {} as ComparePlayerData["windows"];
    let name = "";
    let team = "";
    let positions: string[] = [];
    for (const w of ALL_WINDOWS) {
      const stats = byIdByWindow[w].get(id) ?? null;
      windows[w] = stats;
      // First (most recent) window wins, so a traded player shows their
      // current team.
      if (stats && !team) {
        name = stats.name;
        team = stats.team;
        positions = stats.positions;
      }
    }
    if (!team) return null;
    return { name, team, positions, windows };
  }

  const compareLeft = player1 ? buildCompareData(player1) : null;
  const compareRight = player2 ? buildCompareData(player2) : null;

  return (
    <div>
      {usingSampleData ? (
        <div className="rounded-md border-l-4 border-rink-gold bg-rink-gold-light px-4 py-2.5 text-sm text-ink">
          {statsLoading
            ? "Loading live stats from Natural Stat Trick..."
            : `Couldn't load live stats from Natural Stat Trick${
                statsError ? ` (${statsError})` : ""
              } - showing sample data instead.`}
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-rink-blue bg-rink-blue-light px-4 py-2.5 text-sm text-ink">
          Live stats from Natural Stat Trick{computedAt ? ` - updated ${new Date(computedAt).toLocaleString()}` : ""}.
          Luck/Regression columns always compare against a 3-season baseline.
        </div>
      )}

      {!dropReplaceOpen && (
        <>
          <p className="mt-3 text-xs text-ink-dim">
            <span className="font-semibold text-ink">C-Score</span> (composite score) is the
            average of a player&apos;s rank across 7 underlying shot- and chance-generation
            metrics over the selected window - lower is better.
          </p>

          <button
            onClick={() => setDropReplaceOpen(true)}
            className="mt-4 flex w-full flex-col gap-4 rounded-lg bg-gradient-to-br from-rink-blue to-rink-blue-dark px-6 py-4 text-left sm:flex-row sm:items-center"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                <path d="M4 4v6h6" />
                <path d="M20 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 7" />
                <path d="M3.51 15A9 9 0 0 0 18.36 18.36L20 17" />
              </svg>
            </span>
            <span className="flex-1">
              <span className="block font-display text-lg font-extrabold uppercase tracking-wide text-white">
                Streamer Finder
              </span>
              <span className="mt-0.5 block text-sm text-rink-blue-light">
                Find a short-term add to cover a drop for a week or two - we surface who&apos;s
                playing the most games in your window, then rank them by C-Score.
              </span>
            </span>
            <span className="block w-full shrink-0 rounded-md bg-rink-gold px-5 py-2.5 text-center text-sm font-bold uppercase tracking-wide text-white sm:w-auto">
              Find My Streamer &rarr;
            </span>
          </button>
        </>
      )}

      <div className="mt-4 flex items-center border-b border-line">
        <div className="flex gap-1">
          <button
            onClick={() => {
              setPageTab("rankings");
              setDropReplaceOpen(false);
            }}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${
              pageTab === "rankings" && !dropReplaceOpen
                ? "border-rink-blue text-ink"
                : "border-transparent text-ink-faint hover:text-ink-dim"
            }`}
          >
            Rankings
          </button>
          <button
            onClick={() => {
              setPageTab("compare");
              setDropReplaceOpen(false);
            }}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${
              pageTab === "compare" && !dropReplaceOpen
                ? "border-rink-blue text-ink"
                : "border-transparent text-ink-faint hover:text-ink-dim"
            }`}
          >
            Compare
          </button>
        </div>
      </div>

      {dropReplaceOpen ? (
        <div className="mt-4">
          <DropReplaceFlow
            liveWindows={liveWindows}
            headshots={headshots}
            activeLeagueKey={activeLeagueKey}
            onClose={() => setDropReplaceOpen(false)}
          />
        </div>
      ) : pageTab === "compare" ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PlayerSearchPicker label="Search player 1..." players={pickablePlayers} value={player1} onChange={setPlayer1} />
            <PlayerSearchPicker label="Search player 2..." players={pickablePlayers} value={player2} onChange={setPlayer2} />
          </div>

          {compareLeft && compareRight ? (
            <PlayerComparisonPanel left={compareLeft} right={compareRight} headshots={headshots} />
          ) : (
            <p className="mt-6 text-center text-sm text-ink-dim">
              Pick two players above to compare their Last 5 Games, Last 10 Games, and Season
              stats side by side.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mt-4 flex gap-1">
            {WINDOW_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setWindowKey(tab.key)}
                className={`rounded px-3 py-1.5 text-xs font-semibold ${
                  windowKey === tab.key
                    ? "bg-rink-blue text-white"
                    : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-1 border-b border-line">
            <button
              onClick={() => setGroup("F")}
              className={`border-b-2 px-4 py-2 text-sm font-semibold ${
                group === "F"
                  ? "border-rink-blue text-ink"
                  : "border-transparent text-ink-faint hover:text-ink-dim"
              }`}
            >
              Forwards
            </button>
            <button
              onClick={() => setGroup("D")}
              className={`border-b-2 px-4 py-2 text-sm font-semibold ${
                group === "D"
                  ? "border-rink-blue text-ink"
                  : "border-transparent text-ink-faint hover:text-ink-dim"
              }`}
            >
              Defense
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div
              className="flex gap-1"
              title={
                yahooFreeAgents
                  ? "Unowned reflects your connected Yahoo league's real free agents"
                  : "Unowned uses a sample/manual roster until a Yahoo league is connected"
              }
            >
              <button
                onClick={() => setOwnershipFilter("all")}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${
                  ownershipFilter === "all"
                    ? "bg-rink-blue text-white"
                    : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                }`}
              >
                All Skaters
              </button>
              <button
                onClick={() => setOwnershipFilter("unowned")}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${
                  ownershipFilter === "unowned"
                    ? "bg-rink-blue text-white"
                    : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                }`}
              >
                Unowned
              </button>
            </div>
            {group === "F" && (
              <div className="flex gap-1">
                <button
                  onClick={() => setPositionFilters(new Set())}
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    positionFilters.size === 0
                      ? "bg-rink-blue text-white"
                      : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                  }`}
                >
                  ALL
                </button>
                {(["C", "LW", "RW"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() =>
                      setPositionFilters((prev) => {
                        const next = new Set(prev);
                        if (next.has(pos)) next.delete(pos);
                        else next.add(pos);
                        return next;
                      })
                    }
                    className={`rounded px-2 py-1 text-xs font-semibold ${
                      positionFilters.has(pos)
                        ? "bg-rink-blue text-white"
                        : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Search player..."
              className="w-48 rounded border border-line bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
            />
            <TeamMultiSelect teams={SORTED_TEAMS} selected={teamFilters} onChange={setTeamFilters} />
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
              Min TOI
              <select
                value={minToi}
                onChange={(e) => setMinToi(Number(e.target.value))}
                className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
              >
                {MIN_TOI_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {isFullSeasonWindow && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
                Min GP
                <select
                  value={minGp}
                  onChange={(e) => setMinGp(Number(e.target.value))}
                  className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
                >
                  {MIN_GP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {ownershipFilter === "unowned" && !yahooFreeAgents && (
            <p className="mt-2 text-xs text-ink-faint">
              Filtered against a sample/manual roster - connect a Yahoo league for real ownership data.
            </p>
          )}

          <LuckLegend />

          <SkaterRankingsTable
            ranked={filtered}
            headshots={headshots}
            windowLabel={WINDOW_TABS.find((w) => w.key === windowKey)!.windowLabel}
          />

          {filtered.length === 0 && (
            <p className="mt-4 text-center text-sm text-ink-dim">No players match those filters.</p>
          )}
        </>
      )}
    </div>
  );
}
