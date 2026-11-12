"use client";

import { useMemo, useState } from "react";
import type { RankedSkaterStats } from "@/lib/streamer-stats";
import type { EvaluatorWindow } from "@/lib/player-evaluator-service";
import type { HeadshotMap } from "@/lib/headshots";
import {
  computeLuckNeutral,
  DEFAULT_WEIGHTS,
  SCORED_STAT_LABELS,
  type LuckNeutralRow,
  type ScoredSkaterStat,
} from "@/lib/luck-neutral";
import { MIN_GP_FOR_ON_ICE, MIN_SHOTS_FOR_SH_PCT } from "@/lib/trade-targets";
import { useYahooScoring } from "@/lib/use-yahoo-scoring";
import { PlayerHeadshot } from "@/components/player-headshot";
import { luckCellStyle, RINK_BLUE_RGB, RINK_RED_RGB } from "@/components/skater-rankings-table";

type SkaterGroup = "F" | "D";
type SortMode = "unlucky" | "lucky" | "neutralRank";

// No Last 5: five games is far below the shot/GP samples any of the luck
// stats need, so nearly everyone would show no change.
const WINDOW_TABS: { key: EvaluatorWindow; label: string }[] = [
  { key: "season", label: "Season" },
  { key: "last10", label: "Last 10 Games" },
  { key: "lastSeason", label: "Last Season" },
];

const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: "unlucky", label: "Most Unlucky" },
  { key: "lucky", label: "Most Lucky" },
  { key: "neutralRank", label: "Luck-Neutral Rank" },
];

// Shade the change column by its size relative to the player's output -
// a raw fantasy-point gap means very different things in a G+A league
// and one that scores hits and shots too.
const DELTA_SHADE_THRESHOLD_PCT = 10;
const DELTA_SHADE_MAX_PCT = 40;

function deltaOf(r: LuckNeutralRow): number {
  return r.neutralFantasyPoints - r.fantasyPoints;
}

function formatSigned(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function formatFpts(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// A player's own goals are part of their on-ice points, so the S% goals
// sit inside the oiS%/IPP points change rather than adding to it - said
// outright so the three numbers don't read as a sum.
function deltaTitle(r: LuckNeutralRow): string {
  const lines: string[] = [];
  if (r.pointsFromOnIceShPct !== null && r.pointsFromIpp !== null) {
    const points = r.pointsFromOnIceShPct + r.pointsFromIpp;
    lines.push(
      `Points ${formatSigned(points)}: ${formatSigned(r.pointsFromOnIceShPct)} from oiS%, ${formatSigned(r.pointsFromIpp)} from IPP`
    );
    if (r.goalsFromShPct !== null) lines.push(`Goals ${formatSigned(r.goalsFromShPct)} from S% (part of those points)`);
  } else if (r.goalsFromShPct !== null) {
    lines.push(`Goals ${formatSigned(r.goalsFromShPct)} from S% (oiS%/IPP need ${MIN_GP_FOR_ON_ICE}+ GP)`);
  } else {
    return `Not enough shots (${MIN_SHOTS_FOR_SH_PCT}+) or games (${MIN_GP_FOR_ON_ICE}+) yet to reset any luck stat`;
  }
  const per82 = (deltaOf(r) / r.player.gamesPlayed) * 82;
  lines.push(`${formatSigned(per82)} fantasy points per 82 games`);
  return lines.join("\n");
}

function MoveCell({ from, to }: { from: number; to: number }) {
  const move = from - to;
  if (move === 0) return <span className="text-ink-faint">-</span>;
  // Same color language as the luck columns: blue = running cold (would
  // climb), red = running hot (would drop).
  return (
    <span className={`font-semibold ${move > 0 ? "text-rink-blue" : "text-rink-red"}`}>
      {move > 0 ? "▲" : "▼"}
      {Math.abs(move)}
    </span>
  );
}

function ScoringNote({
  leagueConnected,
  kind,
  weights,
  unsupported,
}: {
  leagueConnected: boolean;
  kind: "points" | "categories" | null;
  weights: Partial<Record<ScoredSkaterStat, number>>;
  unsupported: string[];
}) {
  if (!leagueConnected) {
    return <>Fantasy points are plain points (G + A) - connect a Yahoo points league to use its scoring.</>;
  }
  if (kind === "categories") {
    return <>Your league is a categories league, so fantasy points here are plain points (G + A).</>;
  }
  const scored = (Object.keys(SCORED_STAT_LABELS) as ScoredSkaterStat[])
    .filter((k) => weights[k])
    .map((k) => `${SCORED_STAT_LABELS[k]} ${weights[k]}`);
  return (
    <>
      Fantasy points use your league&apos;s scoring ({scored.join(", ")}).
      {unsupported.length > 0 && (
        <> {unsupported.join(", ")} aren&apos;t in the stats data, so they&apos;re left out.</>
      )}
    </>
  );
}

export function LuckBoard({
  rankingsByWindow,
  headshots,
  activeLeagueKey,
  isUnowned,
}: {
  rankingsByWindow: Record<EvaluatorWindow, { forwards: RankedSkaterStats[]; defense: RankedSkaterStats[] }>;
  headshots: HeadshotMap;
  activeLeagueKey: string | null;
  /** Null when there's no ownership data to filter by. */
  isUnowned: ((p: RankedSkaterStats) => boolean) | null;
}) {
  const [windowKey, setWindowKey] = useState<EvaluatorWindow>("season");
  const [group, setGroup] = useState<SkaterGroup>("F");
  const [sortMode, setSortMode] = useState<SortMode>("unlucky");
  const [unownedOnly, setUnownedOnly] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const { scoring, loading: scoringLoading } = useYahooScoring(activeLeagueKey);

  const weights = scoring?.kind === "points" && Object.keys(scoring.weights).length > 0 ? scoring.weights : DEFAULT_WEIGHTS;
  const pool = group === "F" ? rankingsByWindow[windowKey].forwards : rankingsByWindow[windowKey].defense;
  const rows = useMemo(() => computeLuckNeutral(pool, weights), [pool, weights]);

  const shown = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (query && !r.player.name.toLowerCase().includes(query)) return false;
      if (unownedOnly && isUnowned && !isUnowned(r.player)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortMode === "neutralRank") return a.neutralRank - b.neutralRank;
      const cmp = deltaOf(b) - deltaOf(a);
      return sortMode === "unlucky" ? cmp : -cmp;
    });
  }, [rows, nameQuery, unownedOnly, isUnowned, sortMode]);

  const buttonClass = (active: boolean) =>
    `rounded px-3 py-1.5 text-xs font-semibold ${
      active
        ? "bg-rink-blue text-white"
        : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
    }`;

  return (
    <>
      <p className="mt-4 max-w-3xl text-xs text-ink-dim">
        What each skater&apos;s production would look like with shooting % (S%), on-ice shooting % (oiS%)
        and IPP reset to their own 3-season baseline, and where that would rank them by fantasy points
        per game. Everyone is reset at once, so the luck-neutral rank is against everyone else&apos;s
        luck-neutral line. It&apos;s a full reset, so a real change in role or skill reads as luck too.
        Only skaters with at least 40% of the window&apos;s most games played are ranked.{" "}
        {scoringLoading ? (
          "Loading your league's scoring..."
        ) : (
          <ScoringNote
            leagueConnected={Boolean(activeLeagueKey && scoring)}
            kind={scoring?.kind ?? null}
            weights={weights}
            unsupported={scoring?.unsupported ?? []}
          />
        )}
      </p>

      <div className="mt-4 flex gap-1">
        {WINDOW_TABS.map((tab) => (
          <button key={tab.key} onClick={() => setWindowKey(tab.key)} className={buttonClass(windowKey === tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-1 border-b border-line">
        {(["F", "D"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${
              group === g ? "border-rink-blue text-ink" : "border-transparent text-ink-faint hover:text-ink-dim"
            }`}
          >
            {g === "F" ? "Forwards" : "Defense"}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {SORT_MODES.map((m) => (
            <button key={m.key} onClick={() => setSortMode(m.key)} className={buttonClass(sortMode === m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        {isUnowned && (
          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
            <input type="checkbox" checked={unownedOnly} onChange={(e) => setUnownedOnly(e.target.checked)} />
            Unowned only
          </label>
        )}
        <input
          type="text"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Search player..."
          className="w-48 rounded border border-line bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
        />
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
        <span
          className="rounded px-1.5 py-0.5 font-semibold text-rink-blue"
          style={{ backgroundColor: `rgba(${RINK_BLUE_RGB}, 0.5)` }}
        >
          blue
        </span>
        <span>= owed points (running cold);</span>
        <span
          className="rounded px-1.5 py-0.5 font-semibold text-rink-red"
          style={{ backgroundColor: `rgba(${RINK_RED_RGB}, 0.5)` }}
        >
          red
        </span>
        <span>= playing over their head. Hover the change for which luck stat it comes from.</span>
      </p>

      <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line bg-stripe text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-2">Player</th>
              <th className="px-1.5 py-2 text-center">GP</th>
              <th className="px-1.5 py-2 text-center" title="Actual goals → luck-neutral goals">G</th>
              <th className="px-1.5 py-2 text-center" title="Actual assists → luck-neutral assists">A</th>
              <th className="border-l border-stripe px-1.5 py-2 text-center" title="Actual fantasy points">FPts</th>
              <th className="px-1.5 py-2 text-center" title="Fantasy points with luck reset to baseline">Neutral</th>
              <th className="px-1.5 py-2 text-center" title="Luck-neutral minus actual - positive means owed points">
                Change
              </th>
              <th className="border-l border-stripe px-1.5 py-2 text-center" title="Rank by actual fantasy points per game">
                Rank
              </th>
              <th className="px-1.5 py-2 text-center" title="Rank by luck-neutral fantasy points per game">
                Neutral Rank
              </th>
              <th className="px-1.5 py-2 text-center">Move</th>
              <th
                className="border-l border-stripe px-1.5 py-2 text-center normal-case"
                title="C-Score rank - underlying process. A good C-Score with a poor luck-neutral rank means luck isn't the whole story (role, linemates, PP time)."
              >
                C-Score #
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const p = r.player;
              const delta = deltaOf(r);
              const relPct = (delta / Math.max(r.fantasyPoints, r.neutralFantasyPoints, 1)) * 100;
              return (
                <tr
                  key={`${p.name}|${p.team}|${p.positions.join(",")}`}
                  className={`border-b border-stripe last:border-0 ${i % 2 === 1 ? "bg-stripe/60" : ""}`}
                >
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <PlayerHeadshot name={p.name} team={p.team} positions={p.positions} headshots={headshots} size={34} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink" title={p.name}>
                          {p.name}
                        </div>
                        <div className="truncate text-xs text-ink-faint">
                          {p.positions.join("/")} - {p.team}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-1.5 py-2 text-center tabular-nums text-ink-dim">{p.gamesPlayed}</td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-center tabular-nums text-ink-dim">
                    {p.goals} <span className="text-ink-faint">→</span> {r.neutralGoals.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-center tabular-nums text-ink-dim">
                    {p.assists} <span className="text-ink-faint">→</span> {r.neutralAssists.toFixed(1)}
                  </td>
                  <td className="border-l border-stripe px-1.5 py-2 text-center tabular-nums text-ink-dim">
                    {formatFpts(r.fantasyPoints)}
                  </td>
                  <td className="px-1.5 py-2 text-center tabular-nums font-semibold text-ink">
                    {r.neutralFantasyPoints.toFixed(1)}
                  </td>
                  <td
                    className="whitespace-nowrap px-1.5 py-2 text-center tabular-nums font-semibold text-ink-dim"
                    // Positive = owed = blue, which luckCellStyle draws for a
                    // negative delta (running cold).
                    style={luckCellStyle(-relPct, DELTA_SHADE_THRESHOLD_PCT, DELTA_SHADE_MAX_PCT)}
                    title={deltaTitle(r)}
                  >
                    {formatSigned(delta)}
                  </td>
                  <td className="border-l border-stripe px-1.5 py-2 text-center tabular-nums text-ink-dim">#{r.rank}</td>
                  <td className="px-1.5 py-2 text-center tabular-nums font-semibold text-ink">#{r.neutralRank}</td>
                  <td className="px-1.5 py-2 text-center tabular-nums">
                    <MoveCell from={r.rank} to={r.neutralRank} />
                  </td>
                  <td className="border-l border-stripe px-1.5 py-2 text-center tabular-nums text-ink-dim">
                    #{r.cScoreRank}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shown.length === 0 && <p className="mt-4 text-center text-sm text-ink-dim">No players match those filters.</p>}
    </>
  );
}
