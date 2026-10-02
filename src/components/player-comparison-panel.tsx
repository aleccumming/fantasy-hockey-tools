"use client";

import type { RankedSkaterStats } from "@/lib/streamer-stats";
import type { HeadshotMap } from "@/lib/headshots";
import type { EvaluatorWindow } from "@/lib/player-evaluator-service";
import { PlayerHeadshot } from "@/components/player-headshot";
import { METRIC_COLUMNS, formatToi } from "@/components/skater-rankings-table";

const WINDOW_COLUMNS: { key: EvaluatorWindow; label: string }[] = [
  { key: "last5", label: "L5" },
  { key: "last10", label: "L10" },
  { key: "season", label: "Season" },
  { key: "lastSeason", label: "Last Yr" },
];

export interface ComparePlayerData {
  name: string;
  team: string;
  positions: string[];
  /** null for a window this player doesn't clear that window's own TOI
   *  floor in (e.g. a healthy scratch over the last 5 games). */
  windows: Record<EvaluatorWindow, RankedSkaterStats | null>;
}

function pace84(stats: RankedSkaterStats | null, total: (p: RankedSkaterStats) => number): string {
  if (!stats || stats.gamesPlayed <= 0) return "-";
  return ((total(stats) / stats.gamesPlayed) * 84).toFixed(0);
}

function Cell({ value }: { value: string }) {
  return <td className="whitespace-nowrap px-2 py-1.5 text-center tabular-nums text-sm text-ink-dim">{value}</td>;
}

function StatRow({
  label,
  left,
  right,
  value,
  bold,
}: {
  label: string;
  left: ComparePlayerData;
  right: ComparePlayerData;
  value: (p: RankedSkaterStats) => string;
  bold?: boolean;
}) {
  return (
    <tr className="border-t border-stripe">
      {WINDOW_COLUMNS.map((w) => {
        const stats = left.windows[w.key];
        return <Cell key={`l-${w.key}`} value={stats ? value(stats) : "-"} />;
      })}
      <td
        className={`whitespace-nowrap border-x border-stripe px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide ${
          bold ? "text-ink" : "text-ink-faint"
        }`}
      >
        {label}
      </td>
      {WINDOW_COLUMNS.map((w) => {
        const stats = right.windows[w.key];
        return <Cell key={`r-${w.key}`} value={stats ? value(stats) : "-"} />;
      })}
    </tr>
  );
}

function PlayerHeader({ player, headshots }: { player: ComparePlayerData; headshots: HeadshotMap }) {
  const season = player.windows.season;
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
      <PlayerHeadshot name={player.name} team={player.team} positions={player.positions} headshots={headshots} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{player.name}</p>
        <p className="text-xs text-ink-faint">
          {player.team} &middot; {player.positions.join("/")}
        </p>
      </div>
      <div className="flex shrink-0 gap-4 border-l border-stripe pl-3 text-xs">
        <div>
          <div className="text-ink-faint">84-GP Pace (G)</div>
          <div className="tabular-nums font-bold text-ink">{pace84(season, (s) => s.goals)}</div>
        </div>
        <div>
          <div className="text-ink-faint">84-GP Pace (PTS)</div>
          <div className="tabular-nums font-bold text-ink">{pace84(season, (s) => s.goals + s.assists)}</div>
        </div>
      </div>
    </div>
  );
}

export function PlayerComparisonPanel({
  left,
  right,
  headshots,
}: {
  left: ComparePlayerData;
  right: ComparePlayerData;
  headshots: HeadshotMap;
}) {
  return (
    <div className="mt-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <PlayerHeader player={left} headshots={headshots} />
        <PlayerHeader player={right} headshots={headshots} />
      </div>

      <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stripe bg-surface text-center text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              <th colSpan={WINDOW_COLUMNS.length} className="px-2 py-1">
                {left.name}
              </th>
              <th className="border-x border-stripe px-2 py-1">Stat</th>
              <th colSpan={WINDOW_COLUMNS.length} className="px-2 py-1">
                {right.name}
              </th>
            </tr>
            <tr className="border-b border-line bg-surface text-center text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
              {WINDOW_COLUMNS.map((w) => (
                <th key={`l-${w.key}`} className="px-2 py-1.5">
                  {w.label}
                </th>
              ))}
              <th className="border-x border-stripe px-2 py-1.5" />
              {WINDOW_COLUMNS.map((w) => (
                <th key={`r-${w.key}`} className="px-2 py-1.5">
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <StatRow label="GP" left={left} right={right} value={(s) => String(s.gamesPlayed)} />
            <StatRow label="Goals" left={left} right={right} value={(s) => String(s.goals)} />
            <StatRow label="Assists" left={left} right={right} value={(s) => String(s.assists)} />
            <StatRow label="Points" left={left} right={right} value={(s) => String(s.goals + s.assists)} bold />
            <StatRow label="Avg TOI" left={left} right={right} value={(s) => formatToi(s.toiPerGame)} />
            <StatRow label="S%" left={left} right={right} value={(s) => `${s.shootingPct.toFixed(1)}%`} />
            <StatRow label="oiS%" left={left} right={right} value={(s) => `${s.onIceShPct.toFixed(1)}%`} />
            <StatRow label="IPP" left={left} right={right} value={(s) => `${s.ipp.toFixed(1)}%`} />
            {METRIC_COLUMNS.map((m) => (
              <StatRow
                key={m.key}
                label={`${m.label} Rank`}
                left={left}
                right={right}
                value={(s) => `#${s.metricRanks[m.key]}`}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
