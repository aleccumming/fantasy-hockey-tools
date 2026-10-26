"use client";

import { useMemo, useState } from "react";
import { computeCompositeRankingsByGroup, type RankedSkaterStats } from "@/lib/streamer-stats";
import { usePlayerEvaluatorStats } from "@/lib/use-player-evaluator-stats";
import { useYahooPlayerEligibility } from "@/lib/use-yahoo-player-eligibility";
import { useYahooLeagueRosters } from "@/lib/use-yahoo-league-rosters";
import { useHeadshots } from "@/lib/use-headshots";
import { applyEligibilityOverrides } from "@/lib/apply-eligibility-overrides";
import { playerIdentityKey, playerNameGroupKey } from "@/lib/player-identity-key";
import {
  computeBuyLowCandidates,
  computeTeamNeeds,
  evaluateTradeSide,
  fitIfAdded,
  luckIndex,
  MIN_GP_FOR_ON_ICE,
  MIN_SHOTS_FOR_SH_PCT,
  type BuyLowCandidate,
  type Fit,
  type TradeSideImpact,
} from "@/lib/trade-targets";
import type { RosterPosition, RosterSlotConfig } from "@/lib/roster-fit";
import type { EvaluatorWindow } from "@/lib/player-evaluator-service";
import type { YahooLeagueTeamRoster, YahooRosterPlayer } from "@/lib/yahoo-fantasy-client";
import type { HeadshotMap } from "@/lib/headshots";
import { PlayerHeadshot } from "@/components/player-headshot";
import { StatsRefresh } from "@/components/stats-refresh";
import {
  LUCK_COLUMNS,
  LuckLegend,
  abbreviateFirstName,
  formatLuckPct,
  luckCellStyle,
  luckCellTitle,
  luckValues,
  RINK_BLUE_RGB,
  RINK_RED_RGB,
} from "@/components/skater-rankings-table";

type SkaterGroup = "F" | "D";
type OwnershipFilter = "others" | "free" | "all";

type TargetWindow = Exclude<EvaluatorWindow, "last5">;

// No Last 5: oiS% and IPP need MIN_GP_FOR_ON_ICE games before they count,
// so a 5-game window could almost never show a luck signal. Last Season
// stays - a player who ran cold all last year is often still priced off
// those points now.
const WINDOW_TABS: { key: TargetWindow; label: string }[] = [
  { key: "last10", label: "Last 10 Games" },
  { key: "season", label: "Season" },
  { key: "lastSeason", label: "Last Season" },
];
const MIN_TOI_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 12, label: "12+ min/game" },
  { value: 15, label: "15+ min/game" },
  { value: 18, label: "18+ min/game" },
];
const PAGE_SIZE = 50;

interface Owner {
  team: YahooLeagueTeamRoster;
  player: YahooRosterPlayer;
}

/** Two-key lookup: name+team+F/D first, then name+F/D (catches a player
 *  traded since the stat snapshot). Not plain name - that would let one of
 *  a same-name pair (the VAN Petterssons) inherit the other's owner. */
function buildIndex<T>(entries: { name: string; team: string; positions: string[]; value: T }[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const e of entries) {
    map.set(playerIdentityKey(e.name, e.team, e.positions), e.value);
    const fallback = playerNameGroupKey(e.name, e.positions);
    if (!map.has(fallback)) map.set(fallback, e.value);
  }
  return map;
}

function lookup<T>(map: Map<string, T>, p: { name: string; team: string; positions: string[] }): T | undefined {
  return map.get(playerIdentityKey(p.name, p.team, p.positions)) ?? map.get(playerNameGroupKey(p.name, p.positions));
}

function isSkater(p: YahooRosterPlayer): boolean {
  return !p.isGoalie && !p.isOnIR && p.positions.length > 0;
}

function pointsPerGame(p: RankedSkaterStats): number {
  return p.gamesPlayed > 0 ? (p.goals + p.assists) / p.gamesPlayed : 0;
}

function formatLuck(index: number): string {
  const pct = Math.round(index * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function LuckChip({ index }: { index: number | null }) {
  if (index === null) {
    return (
      <span className="text-xs text-ink-faint" title="Not enough games/shots yet to judge luck">
        -
      </span>
    );
  }
  // 10%+ either way reads as a real hot/cold run, not noise.
  const cold = index <= -0.1;
  const hot = index >= 0.1;
  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
      style={
        cold
          ? { backgroundColor: `rgba(${RINK_BLUE_RGB}, 0.15)`, color: `rgb(${RINK_BLUE_RGB})` }
          : hot
            ? { backgroundColor: `rgba(${RINK_RED_RGB}, 0.15)`, color: `rgb(${RINK_RED_RGB})` }
            : undefined
      }
      title="Average of S%, oiS% and IPP vs. their career baseline"
    >
      {formatLuck(index)}
    </span>
  );
}

export function TradeTargetsBoard({ activeLeagueKey }: { activeLeagueKey: string | null }) {
  const [chosenWindow, setChosenWindow] = useState<TargetWindow | null>(null);
  const [group, setGroup] = useState<SkaterGroup>("F");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("others");
  const [minToi, setMinToi] = useState(12);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const headshots = useHeadshots();
  const { byName: eligibilityByName } = useYahooPlayerEligibility();
  const {
    windows,
    computedAt,
    error: statsError,
    loading: statsLoading,
    reload: reloadStats,
  } = usePlayerEvaluatorStats();
  const { teams, slots, error: rostersError, loading: rostersLoading } = useYahooLeagueRosters(activeLeagueKey);

  // Until picked, open on Season once it has enough games for a luck
  // signal, otherwise Last Season (early in a new season).
  const seasonHasSample = windows?.season.some((p) => p.gamesPlayed >= MIN_GP_FOR_ON_ICE) ?? false;
  const windowKey: TargetWindow = chosenWindow ?? (seasonHasSample ? "season" : "lastSeason");

  const rankedByGroup = useMemo(() => {
    if (!windows) return null;
    return computeCompositeRankingsByGroup(applyEligibilityOverrides(windows[windowKey], eligibilityByName));
  }, [windows, windowKey, eligibilityByName]);

  const ownerIndex = useMemo(() => {
    if (!teams) return null;
    return buildIndex<Owner>(
      teams.flatMap((team) =>
        team.roster
          .filter((p) => !p.isGoalie && p.positions.length > 0)
          .map((player) => ({ name: player.name, team: player.team, positions: player.positions, value: { team, player } }))
      )
    );
  }, [teams]);

  const candidates = useMemo(() => {
    if (!rankedByGroup) return [];
    return computeBuyLowCandidates(group === "F" ? rankedByGroup.forwards : rankedByGroup.defense);
  }, [rankedByGroup, group]);

  const filtered = useMemo(() => {
    return candidates.filter((p) => {
      if (p.toiPerGame < minToi) return false;
      if (!ownerIndex) return true;
      const owner = lookup(ownerIndex, p);
      if (ownershipFilter === "others") return Boolean(owner && !owner.team.isMine);
      if (ownershipFilter === "free") return !owner;
      return true;
    });
  }, [candidates, minToi, ownerIndex, ownershipFilter]);

  const selectedTarget = selectedTargetKey
    ? (filtered.find((p) => playerIdentityKey(p.name, p.team, p.positions) === selectedTargetKey) ?? null)
    : null;
  const selectedOwner = selectedTarget && ownerIndex ? lookup(ownerIndex, selectedTarget) : undefined;

  return (
    <div>
      {statsLoading ? (
        <div className="rounded-md border-l-4 border-rink-gold bg-rink-gold-light px-4 py-2.5 text-sm text-ink">
          Loading live stats from Natural Stat Trick...
        </div>
      ) : statsError ? (
        <div className="rounded-md border-l-4 border-rink-gold bg-rink-gold-light px-4 py-2.5 text-sm text-ink">
          Couldn&apos;t load live stats from Natural Stat Trick ({statsError}).
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-rink-blue bg-rink-blue-light px-4 py-2.5 text-sm text-ink">
          Live stats from Natural Stat Trick. Luck always compares against a 3-season baseline.{" "}
          <StatsRefresh dataset="playerEvaluator" computedAt={computedAt} onRefreshed={reloadStats} />
        </div>
      )}

      {!activeLeagueKey ? (
        <p className="mt-3 text-sm text-ink-dim">
          Connect Yahoo and pick a league (top of the page) to see who owns each target and build
          trade offers that fit their roster. Until then this lists every buy-low skater.
        </p>
      ) : rostersLoading ? (
        <p className="mt-3 text-sm text-ink-dim">Loading every team&apos;s roster in your league...</p>
      ) : rostersError ? (
        <p className="mt-3 text-sm text-rink-red">{rostersError} - showing every buy-low skater without owners.</p>
      ) : null}

      <p className="mt-3 text-xs text-ink-dim">
        <span className="font-semibold text-ink">Buy-Low</span> averages two ranks within the
        position group: C-Score (underlying process) and how far below their own career S%, oiS%
        and IPP a player is running. Only players currently running cold are listed - lower is
        better. A luck metric only counts once it has a real sample ({MIN_SHOTS_FOR_SH_PCT}+ shots
        for S%, {MIN_GP_FOR_ON_ICE}+ games for oiS% and IPP).
      </p>

      <div className="mt-4 flex flex-wrap gap-1">
        {WINDOW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setChosenWindow(tab.key);
              setVisibleCount(PAGE_SIZE);
            }}
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
        {(["F", "D"] as const).map((g) => (
          <button
            key={g}
            onClick={() => {
              setGroup(g);
              setVisibleCount(PAGE_SIZE);
            }}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${
              group === g ? "border-rink-blue text-ink" : "border-transparent text-ink-faint hover:text-ink-dim"
            }`}
          >
            {g === "F" ? "Forwards" : "Defense"}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {ownerIndex && (
          <div className="flex gap-1">
            {(
              [
                ["others", "Other Teams"],
                ["free", "Free Agents"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setOwnershipFilter(key);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${
                  ownershipFilter === key
                    ? "bg-rink-blue text-white"
                    : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
          Min TOI
          <select
            value={minToi}
            onChange={(e) => {
              setMinToi(Number(e.target.value));
              setVisibleCount(PAGE_SIZE);
            }}
            className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
          >
            {MIN_TOI_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedTarget && selectedOwner && !selectedOwner.team.isMine && teams && slots && rankedByGroup && (
        <OfferBuilder
          key={selectedTargetKey}
          target={selectedTarget}
          owner={selectedOwner}
          myTeam={teams.find((t) => t.isMine) ?? null}
          slots={slots}
          allRanked={[...rankedByGroup.forwards, ...rankedByGroup.defense]}
          headshots={headshots}
          onClose={() => setSelectedTargetKey(null)}
        />
      )}

      <LuckLegend />

      <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm" style={{ minWidth: 760 }}>
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2" title="Average of process rank and cold rank - lower is better">
                Buy-Low
              </th>
              <th className="px-2 py-2">Player</th>
              {ownerIndex && <th className="px-2 py-2">Owner</th>}
              <th className="px-2 py-2 normal-case">GP</th>
              <th className="px-2 py-2 normal-case">PTS</th>
              <th className="px-2 py-2" title="C-Score, with its rank in this position group">
                C-Score
              </th>
              {LUCK_COLUMNS.map((m) => (
                <th key={m.key} className="px-2 py-2 text-center normal-case" title={m.title}>
                  {m.label}
                </th>
              ))}
              {ownerIndex && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visibleCount).map((p, i) => {
              const key = playerIdentityKey(p.name, p.team, p.positions);
              const owner = ownerIndex ? lookup(ownerIndex, p) : undefined;
              return (
                <tr
                  key={key}
                  className={`border-b border-stripe last:border-0 ${
                    key === selectedTargetKey ? "bg-rink-blue-light" : i % 2 === 1 ? "bg-stripe/60" : ""
                  }`}
                >
                  <td className="px-2 py-2 tabular-nums text-ink-dim">{i + 1}</td>
                  <td className="px-2 py-2 tabular-nums font-semibold text-ink">{p.buyLowScore.toFixed(1)}</td>
                  <td className="px-2 py-2">
                    <PlayerCell player={p} headshots={headshots} />
                  </td>
                  {ownerIndex && (
                    <td className="max-w-[140px] truncate px-2 py-2 text-xs text-ink-dim" title={owner?.team.name}>
                      {owner ? (owner.team.isMine ? "You" : owner.team.name) : "Free agent"}
                    </td>
                  )}
                  <td className="px-2 py-2 tabular-nums text-ink-dim">{p.gamesPlayed}</td>
                  <td className="px-2 py-2 tabular-nums font-semibold text-ink">{p.goals + p.assists}</td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums text-ink">
                    {p.compositeRank.toFixed(1)} <span className="text-xs text-ink-faint">#{p.processRank}</span>
                  </td>
                  {LUCK_COLUMNS.map((m) => {
                    const values = luckValues(p, m);
                    return (
                      <td
                        key={m.key}
                        className="whitespace-nowrap px-2 py-2 text-center tabular-nums font-medium text-ink-dim"
                        style={values ? luckCellStyle(values.value - values.baseline) : undefined}
                        title={values ? luckCellTitle(p, m, values.value, values.baseline) : "Available after the next stats refresh"}
                      >
                        {values ? formatLuckPct(values.value) : "-"}
                      </td>
                    );
                  })}
                  {ownerIndex && (
                    <td className="px-2 py-2 text-right">
                      {owner && !owner.team.isMine && (
                        <button
                          onClick={() => setSelectedTargetKey(key === selectedTargetKey ? null : key)}
                          className="whitespace-nowrap rounded border border-rink-blue px-2 py-1 text-xs font-semibold text-rink-blue hover:bg-rink-blue hover:text-white"
                        >
                          {key === selectedTargetKey ? "Close" : "Build Offer"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && !statsLoading && (
        <p className="mt-4 text-center text-sm text-ink-dim">
          {candidates.length === 0
            ? "Not enough games in this window yet to judge anyone's luck - try Last Season."
            : "No buy-low players match those filters."}
        </p>
      )}
      {filtered.length > visibleCount && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="rounded border border-line bg-surface px-4 py-1.5 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            Show more ({filtered.length - visibleCount} left)
          </button>
        </div>
      )}
    </div>
  );
}

function PlayerCell({
  player,
  headshots,
}: {
  player: { name: string; team: string; positions: string[] };
  headshots: HeadshotMap;
}) {
  return (
    <div className="flex items-center gap-2">
      <PlayerHeadshot
        name={player.name}
        team={player.team}
        positions={player.positions}
        headshots={headshots}
        size={30}
      />
      <div className="min-w-0">
        <div className="truncate font-semibold text-ink" title={player.name}>
          {abbreviateFirstName(player.name)}
        </div>
        <div className="truncate text-xs text-ink-faint">
          {player.positions.join("/")} - {player.team}
        </div>
      </div>
    </div>
  );
}

function playerKey(p: YahooRosterPlayer): string {
  return `${p.name}|${p.team}|${p.positions.join(",")}|${p.isGoalie}`;
}

function sumPointsPerGame(players: YahooRosterPlayer[], statsIndex: Map<string, RankedSkaterStats>): number {
  return players.reduce((sum, p) => {
    const stats = p.isGoalie ? undefined : lookup(statsIndex, p);
    return sum + (stats ? pointsPerGame(stats) : 0);
  }, 0);
}

function FitChip({ fit, positions, who }: { fit: Fit; positions: RosterPosition[]; who: "them" | "you" }) {
  if (fit === "fills-hole") {
    return (
      <span className="whitespace-nowrap rounded bg-rink-green-light px-1.5 py-0.5 text-[11px] font-semibold text-rink-green">
        Fills {who === "them" ? "their" : "your"} {positions.join("/")}
      </span>
    );
  }
  if (fit === "adds-depth") {
    return (
      <span className="whitespace-nowrap rounded bg-rink-blue-light px-1.5 py-0.5 text-[11px] font-semibold text-rink-blue">
        {positions.join("/")} depth for {who}
      </span>
    );
  }
  return null;
}

/** "Can't fill C, no backup at LW" style summary of one team's lineup after
 *  the deal, with what changed vs. today called out. */
function LineupImpactLine({ label, impact }: { label: string; impact: TradeSideImpact }) {
  const { before, after } = impact;
  const opened = after.unfilled.length > before.unfilled.length;
  return (
    <p className="text-xs text-ink-dim">
      <span className="font-semibold text-ink">{label}:</span>{" "}
      {after.unfilled.length > 0 ? (
        <span className={opened ? "font-semibold text-rink-red" : "text-ink"}>
          can&apos;t fill {after.unfilled.join(", ")}
          {opened && " (new hole)"}
        </span>
      ) : (
        <span className={before.unfilled.length > 0 ? "font-semibold text-rink-green" : "text-ink"}>
          full lineup{before.unfilled.length > 0 && " (fills today's hole)"}
        </span>
      )}
      {after.thin.length > 0 && <> &middot; no backup at {after.thin.join(", ")}</>}
    </p>
  );
}

function DealSide({
  title,
  players,
  statsIndex,
  emptyText,
  onRemove,
}: {
  title: string;
  players: YahooRosterPlayer[];
  statsIndex: Map<string, RankedSkaterStats>;
  emptyText: string;
  onRemove: (p: YahooRosterPlayer) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{title}</span>
        {players.length > 0 && (
          <span className="text-xs tabular-nums text-ink-dim" title="Combined points per game">
            {sumPointsPerGame(players, statsIndex).toFixed(2)} P/GP
          </span>
        )}
      </div>
      {players.length === 0 ? (
        <p className="mt-1.5 text-xs text-ink-faint">{emptyText}</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {players.map((p) => (
            <span
              key={playerKey(p)}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pl-2.5 pr-1 text-xs text-ink"
            >
              <span className="font-semibold">{abbreviateFirstName(p.name)}</span>
              <span className="text-ink-faint">{p.isGoalie ? "G" : p.positions.join("/")}</span>
              <button
                onClick={() => onRemove(p)}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-ink-faint hover:bg-rink-red-light hover:text-rink-red"
                aria-label={`Remove ${p.name} from the deal`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferBuilder({
  target,
  owner,
  myTeam,
  slots,
  allRanked,
  headshots,
  onClose,
}: {
  target: BuyLowCandidate;
  owner: Owner;
  myTeam: YahooLeagueTeamRoster | null;
  slots: RosterSlotConfig;
  allRanked: RankedSkaterStats[];
  headshots: HeadshotMap;
  onClose: () => void;
}) {
  // Remounted per target (keyed by the caller), so the deal starts fresh
  // with just the target on their side.
  const [sendKeys, setSendKeys] = useState<Set<string>>(() => new Set());
  const [getKeys, setGetKeys] = useState<Set<string>>(() => new Set([playerKey(owner.player)]));

  const statsIndex = useMemo(
    () => buildIndex(allRanked.map((p) => ({ name: p.name, team: p.team, positions: p.positions, value: p }))),
    [allRanked]
  );

  const myRoster = useMemo(() => myTeam?.roster ?? [], [myTeam]);
  const theirRoster = owner.team.roster;
  const sending = myRoster.filter((p) => sendKeys.has(playerKey(p)));
  const receiving = theirRoster.filter((p) => getKeys.has(playerKey(p)));

  // Lineup math: skaters only, IR excluded (they don't start).
  const mySkaters = useMemo(() => myRoster.filter(isSkater), [myRoster]);
  const theirSkaters = useMemo(() => theirRoster.filter(isSkater), [theirRoster]);
  const myImpact = evaluateTradeSide(mySkaters, sending.filter(isSkater), receiving.filter(isSkater), slots);
  const theirImpact = evaluateTradeSide(theirSkaters, receiving.filter(isSkater), sending.filter(isSkater), slots);

  function toggle(setter: typeof setSendKeys, p: YahooRosterPlayer) {
    setter((prev) => {
      const next = new Set(prev);
      const key = playerKey(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** For a player not yet in the deal: what adding them would do for the
   *  other team's lineup (given the deal so far), and whether losing them
   *  would leave their own team short. */
  function fitLabels(p: YahooRosterPlayer, side: "mine" | "theirs") {
    if (!isSkater(p)) return null;
    const own = side === "mine" ? myImpact : theirImpact;
    const other = side === "mine" ? theirImpact : myImpact;
    const forOther = fitIfAdded(other.rosterAfter, other.after, p, slots);
    const ownWithout = computeTeamNeeds(
      own.rosterAfter.filter((x) => x !== p),
      slots
    );
    const opensHole = ownWithout.unfilled.length > own.after.unfilled.length;
    return (
      <div className="flex flex-col items-start gap-0.5">
        <FitChip fit={forOther.fit} positions={forOther.positions} who={side === "mine" ? "them" : "you"} />
        {opensHole && (
          <span className="whitespace-nowrap text-[11px] font-semibold text-rink-red">
            {side === "mine" ? "Leaves you short" : "Leaves them short"}
          </span>
        )}
      </div>
    );
  }

  const net = receiving.length - sending.length;

  return (
    <div className="mt-4 rounded-md border border-rink-blue bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Build an offer</div>
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
            {target.name} <span className="text-ink-faint">from {owner.team.name}</span>
          </h2>
        </div>
        <button onClick={onClose} className="text-sm font-medium text-ink-faint hover:text-rink-blue">
          Close
        </button>
      </div>

      {!myTeam ? (
        <p className="mt-3 text-sm text-ink-dim">Couldn&apos;t find your team in this league.</p>
      ) : (
        <>
          <div className="mt-3 rounded-md border border-line bg-ice-2/40 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Proposed trade</div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <DealSide
                title="You send"
                players={sending}
                statsIndex={statsIndex}
                emptyText="Click players on your roster below to add them."
                onRemove={(p) => toggle(setSendKeys, p)}
              />
              <DealSide
                title="You get"
                players={receiving}
                statsIndex={statsIndex}
                emptyText="Click players on their roster below to add them."
                onRemove={(p) => toggle(setGetKeys, p)}
              />
            </div>
            <div className="mt-3 space-y-1 border-t border-stripe pt-2">
              <LineupImpactLine label="Your lineup after" impact={myImpact} />
              <LineupImpactLine label={`${owner.team.name} after`} impact={theirImpact} />
              {net !== 0 && (
                <p className="text-xs text-ink-dim">
                  {net > 0
                    ? `You take on ${net} more player${net === 1 ? "" : "s"} than you send - you'll need ${net === 1 ? "an open roster spot" : `${net} open roster spots`} or a drop.`
                    : `They take on ${-net} more player${net === -1 ? "" : "s"} than they send - they'll need room or a drop.`}
                </p>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-faint">
            Click players to add or remove them. The Fits column says what adding a player would do for
            the other team&apos;s lineup (given the deal so far), and flags anyone whose departure leaves
            their own team short. A red (hot) Luck chip marks a sell-high piece: points outrunning the
            underlying process. Lineup math is season-level and leaves out IR players and goalies.
          </p>

          <div className="mt-2 grid gap-4 xl:grid-cols-2">
            <RosterPanel
              title={`${myTeam.name} (you)`}
              roster={myRoster}
              statsIndex={statsIndex}
              headshots={headshots}
              selectedKeys={sendKeys}
              onToggle={(p) => toggle(setSendKeys, p)}
              fitHeader="Fits them"
              renderFit={(p) => fitLabels(p, "mine")}
            />
            <RosterPanel
              title={owner.team.name}
              roster={theirRoster}
              statsIndex={statsIndex}
              headshots={headshots}
              selectedKeys={getKeys}
              onToggle={(p) => toggle(setGetKeys, p)}
              fitHeader="Fits you"
              renderFit={(p) => fitLabels(p, "theirs")}
              highlightKey={playerKey(owner.player)}
            />
          </div>
        </>
      )}
    </div>
  );
}

const POSITION_ORDER: Record<string, number> = { C: 0, LW: 1, RW: 2, D: 3 };

/** One team's full roster (incl. IR and goalies), forwards then D then
 *  goalies, best P/GP first within each. Click a row to add/remove that
 *  player from the deal. */
function RosterPanel({
  title,
  roster,
  statsIndex,
  headshots,
  selectedKeys,
  onToggle,
  fitHeader,
  renderFit,
  highlightKey,
}: {
  title: string;
  roster: YahooRosterPlayer[];
  statsIndex: Map<string, RankedSkaterStats>;
  headshots: HeadshotMap;
  selectedKeys: Set<string>;
  onToggle: (p: YahooRosterPlayer) => void;
  fitHeader: string;
  renderFit: (p: YahooRosterPlayer) => React.ReactNode;
  highlightKey?: string;
}) {
  const rows = roster
    .map((player) => {
      const stats = player.isGoalie ? null : (lookup(statsIndex, player) ?? null);
      // Goalies have no skater positions; sort them last.
      const order = player.isGoalie ? 9 : Math.min(...player.positions.map((pos) => POSITION_ORDER[pos] ?? 9));
      // Forwards (C/LW/RW) share one group so multi-position players don't split it up.
      return { player, stats, group: order <= 2 ? 0 : order };
    })
    .sort((a, b) => {
      if (a.group !== b.group) return a.group - b.group;
      return (b.stats ? pointsPerGame(b.stats) : -1) - (a.stats ? pointsPerGame(a.stats) : -1);
    });

  return (
    <div className="min-w-0">
      <h3 className="truncate text-sm font-semibold text-ink" title={title}>
        {title}
      </h3>
      <div className="mt-1.5 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm" style={{ minWidth: 560 }}>
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              <th className="w-8 px-2 py-1.5" />
              <th className="px-2 py-1.5">Player</th>
              <th className="px-2 py-1.5 normal-case">P/GP</th>
              <th className="px-2 py-1.5">C-Score</th>
              <th className="px-2 py-1.5">Luck</th>
              <th className="px-2 py-1.5">{fitHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, stats, group }, i) => {
              const key = playerKey(player);
              const selected = selectedKeys.has(key);
              return (
                <tr
                  key={key}
                  onClick={() => onToggle(player)}
                  className={`cursor-pointer border-b border-stripe last:border-b-0 hover:bg-rink-blue-light/60 ${
                    i > 0 && rows[i - 1].group !== group ? "border-t-2 border-t-line" : ""
                  } ${selected ? "bg-rink-blue-light" : i % 2 === 1 ? "bg-stripe/60" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle(player)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${selected ? "Remove" : "Add"} ${player.name} ${selected ? "from" : "to"} the deal`}
                      className="h-4 w-4 cursor-pointer accent-rink-blue"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <PlayerCell
                        player={{
                          name: player.name,
                          team: player.team,
                          positions: player.isGoalie ? ["G"] : player.positions,
                        }}
                        headshots={headshots}
                      />
                      {player.isOnIR && (
                        <span className="shrink-0 rounded bg-rink-red/10 px-1 py-0.5 text-[10px] font-bold text-rink-red">
                          IR
                        </span>
                      )}
                      {key === highlightKey && (
                        <span className="shrink-0 rounded bg-rink-gold-light px-1 py-0.5 text-[10px] font-bold uppercase text-rink-gold">
                          Target
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-ink">{stats ? pointsPerGame(stats).toFixed(2) : "-"}</td>
                  <td className="px-2 py-1.5 tabular-nums text-ink">{stats ? stats.compositeRank.toFixed(1) : "-"}</td>
                  <td className="px-2 py-1.5">
                    {player.isGoalie ? (
                      <span className="text-xs text-ink-faint">-</span>
                    ) : (
                      <LuckChip index={stats ? luckIndex(stats) : null} />
                    )}
                  </td>
                  <td className="px-2 py-1.5">{selected ? null : renderFit(player)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
