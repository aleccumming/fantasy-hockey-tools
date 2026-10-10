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
  evaluateOffer,
  luckIndex,
  MIN_GP_FOR_ON_ICE,
  MIN_SHOTS_FOR_SH_PCT,
  type BuyLowCandidate,
  type OfferFit,
} from "@/lib/trade-targets";
import type { RosterSlotConfig } from "@/lib/roster-fit";
import type { EvaluatorWindow } from "@/lib/player-evaluator-service";
import type { YahooLeagueTeamRoster, YahooRosterPlayer } from "@/lib/yahoo-fantasy-client";
import type { HeadshotMap } from "@/lib/headshots";
import { PlayerHeadshot } from "@/components/player-headshot";
import {
  LUCK_COLUMNS,
  LuckLegend,
  abbreviateFirstName,
  luckCellStyle,
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
  const { windows, computedAt, error: statsError, loading: statsLoading } = usePlayerEvaluatorStats();
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
          Live stats from Natural Stat Trick{computedAt ? ` - updated ${new Date(computedAt).toLocaleString()}` : ""}.
          Luck always compares against a 3-season baseline.
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
                    const delta = p[m.key] - p[m.baselineKey];
                    return (
                      <td
                        key={m.key}
                        className="whitespace-nowrap px-2 py-2 text-center tabular-nums font-medium text-ink-dim"
                        style={luckCellStyle(delta)}
                        title={`Career baseline ${p[m.baselineKey].toFixed(1)}% - ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`}
                      >
                        {p[m.key] >= 100 ? p[m.key].toFixed(0) : p[m.key].toFixed(1)}%
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

const FIT_ORDER: Record<OfferFit["theirFit"], number> = { "fills-hole": 0, "adds-depth": 1, none: 2 };

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
  const statsIndex = useMemo(
    () => buildIndex(allRanked.map((p) => ({ name: p.name, team: p.team, positions: p.positions, value: p }))),
    [allRanked]
  );

  // Rosters for lineup math: skaters only, IR excluded (they don't start).
  const theirWithoutTarget = useMemo(
    () => owner.team.roster.filter((p) => isSkater(p) && p !== owner.player),
    [owner]
  );
  const theirNeeds = useMemo(() => computeTeamNeeds(theirWithoutTarget, slots), [theirWithoutTarget, slots]);

  const targetPpg = pointsPerGame(target);
  const offers = useMemo(() => {
    if (!myTeam) return [];
    const mine = myTeam.roster.filter(isSkater);
    return mine
      .map((offer) => {
        const stats = lookup(statsIndex, offer) ?? null;
        const fit = evaluateOffer({
          theirWithoutTarget,
          theirNeeds,
          myWithoutOffer: mine.filter((p) => p !== offer),
          offer,
          target: owner.player,
          slots,
        });
        return {
          offer,
          stats,
          fit,
          luck: stats ? luckIndex(stats) : null,
          ppgGap: stats ? Math.abs(pointsPerGame(stats) - targetPpg) : Infinity,
        };
      })
      .sort((a, b) => {
        const byFit = FIT_ORDER[a.fit.theirFit] - FIT_ORDER[b.fit.theirFit];
        if (byFit !== 0) return byFit;
        if (a.fit.costsYouAStarter !== b.fit.costsYouAStarter) return a.fit.costsYouAStarter ? 1 : -1;
        // Then closest to the target's points per game - what the other
        // manager actually sees - so the top rows are realistic offers, not
        // a superstar for a slumping middle-sixer. Luck stays visible as
        // the sell-high hint rather than driving the order.
        return a.ppgGap - b.ppgGap;
      });
  }, [myTeam, statsIndex, theirWithoutTarget, theirNeeds, owner, slots, targetPpg]);

  return (
    <div className="mt-4 rounded-md border border-rink-blue bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Build an offer</div>
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
            {target.name} <span className="text-ink-faint">from {owner.team.name}</span>
          </h2>
        </div>
        <button onClick={onClose} className="text-sm font-medium text-ink-faint hover:text-rink-blue">
          Close
        </button>
      </div>

      <div className="mt-3 text-sm text-ink-dim">
        Without {abbreviateFirstName(target.name)}, {owner.team.name}{" "}
        {theirNeeds.unfilled.length > 0 ? (
          <>
            can&apos;t fill{" "}
            <span className="font-semibold text-rink-red">{theirNeeds.unfilled.join(", ")}</span> in their
            starting lineup
            {theirNeeds.thin.length > 0 ? " and " : "."}
          </>
        ) : null}
        {theirNeeds.thin.length > 0 ? (
          <>
            {theirNeeds.unfilled.length === 0 && "fills every starting slot but "}has no backup at{" "}
            <span className="font-semibold text-ink">{theirNeeds.thin.join(", ")}</span>.
          </>
        ) : theirNeeds.unfilled.length === 0 ? (
          "is still deep at every position - positional need won't sell this one; lean on value instead."
        ) : null}
      </div>

      {!myTeam ? (
        <p className="mt-3 text-sm text-ink-dim">Couldn&apos;t find your team in this league.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
                <th className="px-2 py-2">You send</th>
                <th className="px-2 py-2">Their fit</th>
                <th className="px-2 py-2">Your lineup</th>
                <th className="px-2 py-2 normal-case" title={`Points per game - ${abbreviateFirstName(target.name)} is at ${targetPpg.toFixed(2)}`}>
                  P/GP
                </th>
                <th className="px-2 py-2" title="C-Score within the player's own position group (F or D)">
                  C-Score
                </th>
                <th className="px-2 py-2" title="Average of S%, oiS% and IPP vs. career baseline - hot players make the best sell-high pieces">
                  Luck
                </th>
              </tr>
            </thead>
            <tbody>
              {offers.map(({ offer, stats, fit, luck }, i) => (
                <tr
                  key={`${offer.name}|${offer.team}|${offer.positions.join(",")}`}
                  className={`border-b border-stripe last:border-0 ${i % 2 === 1 ? "bg-stripe/60" : ""}`}
                >
                  <td className="px-2 py-2">
                    <PlayerCell player={offer} headshots={headshots} />
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {fit.theirFit === "fills-hole" ? (
                      <span className="rounded bg-rink-green-light px-1.5 py-0.5 font-semibold text-rink-green">
                        Fills their {fit.coveredPositions.join("/")} hole
                      </span>
                    ) : fit.theirFit === "adds-depth" ? (
                      <span className="rounded bg-rink-blue-light px-1.5 py-0.5 font-semibold text-rink-blue">
                        Depth at {fit.coveredPositions.join("/")}
                      </span>
                    ) : (
                      <span className="text-ink-faint">No positional need</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {fit.costsYouAStarter ? (
                      <span className="font-semibold text-rink-red">
                        Leaves your {fit.yourUnfilledAfter.join(", ")} empty
                      </span>
                    ) : (
                      <span className="text-ink-dim">Still full</span>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-ink">{stats ? pointsPerGame(stats).toFixed(2) : "-"}</td>
                  <td className="px-2 py-2 tabular-nums text-ink">{stats ? stats.compositeRank.toFixed(1) : "-"}</td>
                  <td className="px-2 py-2">
                    <LuckChip index={luck} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-faint">
        1-for-1 offers, sorted by how well they fit {owner.team.name}&apos;s needs, then whether your
        lineup stays full, then closest to {abbreviateFirstName(target.name)}&apos;s{" "}
        {targetPpg.toFixed(2)} points per game. A red (hot) Luck chip marks a sell-high piece - the
        points are outrunning the underlying process, so the player looks better on paper than they are. IR players and goalies
        are left out of the lineup math. Positional need is season-level - it ignores who plays on which
        night.
      </p>
    </div>
  );
}
