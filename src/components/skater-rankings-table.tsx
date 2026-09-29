"use client";

import { useMemo, useState } from "react";
import type { RankedSkaterStats } from "@/lib/streamer-stats";
import type { HeadshotMap } from "@/lib/headshots";
import { PlayerHeadshot } from "@/components/player-headshot";

export const METRIC_COLUMNS: { key: keyof RankedSkaterStats["metricRanks"]; label: string; title: string }[] = [
  { key: "shotsPer60", label: "Shots/60", title: "Shots per 60 minutes" },
  { key: "iCFPer60", label: "iCF/60", title: "Individual Corsi For per 60" },
  { key: "iSCFPer60", label: "iSCF/60", title: "Individual Scoring Chances For per 60" },
  { key: "ixGPer60", label: "ixG/60", title: "Individual Expected Goals per 60" },
  { key: "oiCFPer60", label: "oiCF/60", title: "On-ice Corsi For per 60" },
  { key: "oiSCFPer60", label: "oiSCF/60", title: "On-ice Scoring Chances For per 60" },
  { key: "oixGPer60", label: "oixG/60", title: "On-ice Expected Goals For per 60" },
];

export function formatToi(minutes: number): string {
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return `${whole}:${String(seconds).padStart(2, "0")}`;
}

// "C. McDavid" instead of "Connor McDavid" - shorter names mean fewer rows
// need to wrap to a second line just for the player name, which is what was
// making table rows uneven heights. The full name is still on the tooltip.
export function abbreviateFirstName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length < 2) return name;
  const [first, ...rest] = parts;
  return `${first[0]}. ${rest.join(" ")}`;
}

type LuckKey = "shootingPct" | "onIceShPct" | "ipp";
type BaselineKey = "baselineShootingPct" | "baselineOnIceShPct" | "baselineIpp";

/** Not part of the composite ranking - shown for context on whether a
 *  player's points reflect sustainable process or a hot/cold shooting
 *  streak likely to regress. Each pairs with a career baseline so the
 *  recent number can be read relative to what's normal for that player,
 *  not in isolation. */
export const LUCK_COLUMNS: { key: LuckKey; baselineKey: BaselineKey; label: string; title: string }[] = [
  { key: "shootingPct", baselineKey: "baselineShootingPct", label: "S%", title: "Individual shooting percentage" },
  { key: "onIceShPct", baselineKey: "baselineOnIceShPct", label: "oiS%", title: "On-ice shooting percentage" },
  { key: "ipp", baselineKey: "baselineIpp", label: "IPP", title: "Individual Points Percentage - share of on-ice team goals the player got a point on" },
];

type BangerKey = "hits" | "blocks" | "pim";

/** Categories-league value (hits/blocks/PIM) - irrelevant to points-league
 *  C-Score, so kept as its own group at the far right rather than mixed
 *  into the box score or underlying-metrics groups. */
export const BANGERS_COLUMNS: { key: BangerKey; label: string; title: string }[] = [
  { key: "hits", label: "HIT", title: "Hits" },
  { key: "blocks", label: "BLK", title: "Shots blocked" },
  { key: "pim", label: "PIM", title: "Penalty minutes" },
];

// Below this point-difference from baseline, treat it as normal variance -
// no shading at all. At/beyond MAX_LUCK_DELTA points, shading maxes out;
// everything in between scales continuously, so the color reflects how
// lucky/unlucky a player is running, not just a hot/cold on-off flag.
export const REGRESSION_THRESHOLD = 1.5;
export const MAX_LUCK_DELTA = 8;
export const RINK_RED_RGB = "200, 16, 46";
export const RINK_BLUE_RGB = "30, 90, 168";

/** Cell background + text color for a luck/regression value - red-shaded
 *  when running hot vs. baseline (due to cool off), blue-shaded when
 *  running cold (could be due for positive regression). No background at
 *  all below the threshold (normal variance). Text switches to white once
 *  the background gets dark enough that dark text stops being readable. */
export function luckCellStyle(delta: number): { backgroundColor?: string; color?: string } {
  const magnitude = Math.abs(delta);
  if (magnitude <= REGRESSION_THRESHOLD) return {};
  const intensity = Math.min(
    (magnitude - REGRESSION_THRESHOLD) / (MAX_LUCK_DELTA - REGRESSION_THRESHOLD),
    1
  );
  const alpha = 0.12 + intensity * 0.48;
  return {
    backgroundColor: `rgba(${delta > 0 ? RINK_RED_RGB : RINK_BLUE_RGB}, ${alpha.toFixed(2)})`,
    color: intensity > 0.4 ? "#ffffff" : "var(--color-ink)",
  };
}

/** An optional trailing column (e.g. Drop & Replace's Games-in-range dots) -
 *  omitted entirely for tools that have no notion of a date range. Its
 *  width is reclaimed by the Player column when absent. */
export interface ExtraColumn {
  groupLabel: string;
  header: string;
  widthPercent: number;
  render: (p: RankedSkaterStats) => React.ReactNode;
  /** Makes the column header clickable to sort by it (e.g. "who has the
   *  most games in range" - the whole point of Drop & Replace). Omit for a
   *  purely informational extra column. */
  sortValue?: (p: RankedSkaterStats) => number;
}

// Fixed non-Player column widths (#, C-Score, box score x5, metric ranks
// x7, luck x3) - team/position moved into the Player cell itself (name with
// "POS - TEAM" stacked below, a bigger headshot, styled after Yahoo's own
// player rows) rather than separate columns. Player's width is solved for
// below so the total always comes out to 100 regardless of whether the
// extra column is present.
const FIXED_COLUMNS_PERCENT = 75.5;

type SortKey =
  | "name"
  | "team"
  | "pos"
  | "compositeRank"
  | "gamesPlayed"
  | "goals"
  | "assists"
  | "points"
  | "toiPerGame"
  | (typeof METRIC_COLUMNS)[number]["key"]
  | LuckKey
  | BangerKey
  | "extra";

type SortDir = "asc" | "desc";

// Which direction "makes sense first" when a column is newly clicked - rank
// and pool-position columns start ascending (lower = better), everything
// else starts descending (more/bigger = more interesting to see first).
function defaultDirFor(key: SortKey): SortDir {
  if (key === "compositeRank") return "asc";
  if (METRIC_COLUMNS.some((m) => m.key === key)) return "asc";
  if (key === "name" || key === "team" || key === "pos") return "asc";
  return "desc";
}

function sortValue(p: RankedSkaterStats, key: SortKey, extraColumn?: ExtraColumn): number | string {
  switch (key) {
    case "name":
      return p.name;
    case "team":
      return p.team;
    case "pos":
      return p.positions.join("/");
    case "compositeRank":
      return p.compositeRank;
    case "gamesPlayed":
      return p.gamesPlayed;
    case "goals":
      return p.goals;
    case "assists":
      return p.assists;
    case "points":
      return p.goals + p.assists;
    case "toiPerGame":
      return p.toiPerGame;
    case "shootingPct":
    case "onIceShPct":
    case "ipp":
    case "hits":
    case "blocks":
    case "pim":
      return p[key];
    case "extra":
      return extraColumn?.sortValue?.(p) ?? 0;
    default:
      return p.metricRanks[key];
  }
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return <span className="ml-0.5">{dir === "asc" ? "▲" : "▼"}</span>;
}

interface TableProps {
  ranked: RankedSkaterStats[];
  headshots: HeadshotMap;
  windowLabel: string;
  extraColumn?: ExtraColumn;
  /** Abbreviate first names ("C. McDavid") to keep the Player column
   *  narrow - worth it when that width is needed elsewhere (e.g. a
   *  Schedule column), wasted space when it isn't. Defaults to true. */
  abbreviateNames?: boolean;
  /** Sort the table by this column as soon as it renders, instead of the
   *  default composite-rank order - e.g. Drop & Replace opens sorted by
   *  games-in-range, since "who can play the most this week" is the whole
   *  point there, not just C-Score. */
  initialSortKey?: SortKey;
}

export function SkaterRankingsTable({
  ranked,
  headshots,
  windowLabel,
  extraColumn,
  abbreviateNames = true,
  initialSortKey,
}: TableProps) {
  const extraWidth = extraColumn?.widthPercent ?? 0;
  const playerWidth = 100 - FIXED_COLUMNS_PERCENT - extraWidth;

  const [sortKey, setSortKey] = useState<SortKey | null>(initialSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(initialSortKey ? defaultDirFor(initialSortKey) : "asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultDirFor(key));
    }
  }

  // Sorting only changes display ORDER - it never recomputes metricRanks or
  // compositeRank, which are always relative to the full pool passed in.
  const sortedRanked = useMemo(() => {
    if (!sortKey) return ranked;
    return [...ranked].sort((a, b) => {
      const va = sortValue(a, sortKey, extraColumn);
      const vb = sortValue(b, sortKey, extraColumn);
      const cmp =
        typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [ranked, sortKey, sortDir, extraColumn]);

  return (
    <div className="mt-3 rounded-md border border-line bg-surface">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col style={{ width: "3%" }} />
          <col style={{ width: "6.5%" }} />
          <col style={{ width: `${playerWidth}%` }} />
          <col style={{ width: "2.5%" }} />
          <col style={{ width: "2.5%" }} />
          <col style={{ width: "2.5%" }} />
          <col style={{ width: "2.5%" }} />
          <col style={{ width: "4%" }} />
          {METRIC_COLUMNS.map((m) => (
            <col key={m.key} style={{ width: "4.3%" }} />
          ))}
          {LUCK_COLUMNS.map((m) => (
            <col key={m.key} style={{ width: "4.3%" }} />
          ))}
          {BANGERS_COLUMNS.map((m) => (
            <col key={m.key} style={{ width: "3%" }} />
          ))}
          {extraColumn && <col style={{ width: `${extraColumn.widthPercent}%` }} />}
        </colgroup>
        <thead>
          {/* Both header rows are individually sticky (not the <thead> or
              <tr> itself - stickying a <tr>/<thead> isn't reliably
              supported across browsers, but sticky <th> cells are) and
              stacked via fixed row heights, so the column labels stay
              readable while scrolling through a long ranked list. */}
          <tr className="sticky top-0 z-20 h-[25px] border-b border-stripe bg-surface text-left text-[10px] font-semibold uppercase tracking-wide text-ink-faint [&>th]:sticky [&>th]:top-0 [&>th]:bg-surface">
            <th colSpan={3} />
            <th colSpan={5} className="border-l border-stripe px-2 py-1 text-center">
              Box Score
            </th>
            <th colSpan={METRIC_COLUMNS.length} className="border-l border-stripe px-2 py-1 text-center">
              Underlying Metric Ranks
            </th>
            <th colSpan={LUCK_COLUMNS.length} className="border-l border-stripe px-2 py-1 text-center">
              Luck / Regression
            </th>
            <th
              colSpan={BANGERS_COLUMNS.length}
              className="border-l border-stripe px-2 py-1 text-center"
              title="Categories-league value (hits/blocks/PIM) - not part of C-Score, which is tuned for points leagues"
            >
              Bangers
            </th>
            {extraColumn && (
              <th className="border-l border-stripe px-2 py-1 text-center">{extraColumn.groupLabel}</th>
            )}
          </tr>
          <tr className="sticky top-[25px] z-20 border-b border-line bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim [&>th]:sticky [&>th]:top-[25px] [&>th]:bg-surface">
            <th className="px-2 py-2 cursor-pointer select-none hover:text-ink" onClick={() => setSortKey(null)} title="Reset to default (C-Score) order">
              #
            </th>
            <th
              className="cursor-pointer select-none whitespace-nowrap px-2 py-2 hover:text-ink"
              onClick={() => handleSort("compositeRank")}
              title="Composite rank score - average of the 7 metric ranks to the right, lower is better"
            >
              C-Score<SortIndicator active={sortKey === "compositeRank"} dir={sortDir} />
            </th>
            <th className="cursor-pointer select-none px-3 py-2 hover:text-ink" onClick={() => handleSort("name")}>
              Player<SortIndicator active={sortKey === "name"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none border-l border-stripe px-2 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("gamesPlayed")}
              title={`Games played over ${windowLabel}`}
            >
              GP<SortIndicator active={sortKey === "gamesPlayed"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none px-2 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("goals")}
              title={`Goals over ${windowLabel}`}
            >
              G<SortIndicator active={sortKey === "goals"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none px-2 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("assists")}
              title={`Assists over ${windowLabel}`}
            >
              A<SortIndicator active={sortKey === "assists"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none px-2 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("points")}
              title={`Points over ${windowLabel}`}
            >
              PTS<SortIndicator active={sortKey === "points"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none px-2 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("toiPerGame")}
              title="Average time on ice per game"
            >
              TOI<SortIndicator active={sortKey === "toiPerGame"} dir={sortDir} />
            </th>
            {METRIC_COLUMNS.map((m, i) => (
              <th
                key={m.key}
                className={`cursor-pointer select-none px-2 py-2 text-center normal-case hover:text-ink ${i === 0 ? "border-l border-stripe" : ""}`}
                onClick={() => handleSort(m.key)}
                title={m.title}
              >
                {m.label}
                <SortIndicator active={sortKey === m.key} dir={sortDir} />
              </th>
            ))}
            {LUCK_COLUMNS.map((m, i) => (
              <th
                key={m.key}
                className={`cursor-pointer select-none px-2 py-2 text-center normal-case hover:text-ink ${i === 0 ? "border-l border-stripe" : ""}`}
                onClick={() => handleSort(m.key)}
                title={m.title}
              >
                {m.label}
                <SortIndicator active={sortKey === m.key} dir={sortDir} />
              </th>
            ))}
            {BANGERS_COLUMNS.map((m, i) => (
              <th
                key={m.key}
                className={`cursor-pointer select-none px-2 py-2 text-center normal-case hover:text-ink ${i === 0 ? "border-l border-stripe" : ""}`}
                onClick={() => handleSort(m.key)}
                title={m.title}
              >
                {m.label}
                <SortIndicator active={sortKey === m.key} dir={sortDir} />
              </th>
            ))}
            {extraColumn && (
              <th
                className={`border-l border-stripe px-3 py-2 ${
                  extraColumn.sortValue ? "cursor-pointer select-none hover:text-ink" : ""
                }`}
                onClick={extraColumn.sortValue ? () => handleSort("extra") : undefined}
              >
                {extraColumn.header}
                <SortIndicator active={sortKey === "extra"} dir={sortDir} />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sortedRanked.map((p, i) => (
            <tr key={p.name} className={`border-b border-stripe last:border-0 ${i % 2 === 1 ? "bg-stripe/60" : ""}`}>
              <td className="px-2 py-2 tabular-nums text-ink-dim">{i + 1}</td>
              <td className="px-2 py-2 tabular-nums font-semibold text-ink">{p.compositeRank.toFixed(1)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <PlayerHeadshot name={p.name} headshots={headshots} size={38} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink" title={p.name}>
                      {abbreviateNames ? abbreviateFirstName(p.name) : p.name}
                    </div>
                    <div className="truncate text-xs text-ink-faint">
                      {p.positions.join("/")} - {p.team}
                    </div>
                  </div>
                </div>
              </td>
              <td className="border-l border-stripe px-2 py-2 tabular-nums text-ink-dim">{p.gamesPlayed}</td>
              <td className="px-2 py-2 tabular-nums text-ink-dim">{p.goals}</td>
              <td className="px-2 py-2 tabular-nums text-ink-dim">{p.assists}</td>
              <td className="px-2 py-2 tabular-nums font-semibold text-ink">{p.goals + p.assists}</td>
              <td className="px-2 py-2 tabular-nums text-ink-dim">{formatToi(p.toiPerGame)}</td>
              {METRIC_COLUMNS.map((m, colIdx) => (
                <td
                  key={m.key}
                  className={`px-2 py-2 text-center tabular-nums text-ink-dim ${colIdx === 0 ? "border-l border-stripe" : ""}`}
                >
                  {p.metricRanks[m.key]}
                </td>
              ))}
              {LUCK_COLUMNS.map((m, colIdx) => {
                const value = p[m.key];
                const baseline = p[m.baselineKey];
                const delta = value - baseline;
                const sign = delta >= 0 ? "+" : "";
                return (
                  <td
                    key={m.key}
                    className={`whitespace-nowrap px-2 py-2 tabular-nums font-medium text-ink-dim ${colIdx === 0 ? "border-l border-stripe" : ""}`}
                    style={luckCellStyle(delta)}
                    title={`Career baseline ${baseline.toFixed(1)}% - ${sign}${delta.toFixed(1)} pts vs ${windowLabel}`}
                  >
                    {value.toFixed(1)}%
                  </td>
                );
              })}
              {BANGERS_COLUMNS.map((m, colIdx) => (
                <td
                  key={m.key}
                  className={`px-2 py-2 text-center tabular-nums text-ink-dim ${colIdx === 0 ? "border-l border-stripe" : ""}`}
                >
                  {p[m.key]}
                </td>
              ))}
              {extraColumn && (
                <td className="border-l border-stripe px-3 py-2">{extraColumn.render(p)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LuckLegend() {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
      <span>In the Luck / Regression columns,</span>
      <span
        className="rounded px-1.5 py-0.5 font-semibold text-rink-red"
        style={{ backgroundColor: `rgba(${RINK_RED_RGB}, 0.5)` }}
      >
        red
      </span>
      <span>shading means running hot vs. career baseline (due to cool off);</span>
      <span
        className="rounded px-1.5 py-0.5 font-semibold text-rink-blue"
        style={{ backgroundColor: `rgba(${RINK_BLUE_RGB}, 0.5)` }}
      >
        blue
      </span>
      <span>means running cold (could be due for positive regression) - the deeper the shade, the bigger the gap from baseline.</span>
    </p>
  );
}

export function SkaterRankingsCards({
  ranked,
  headshots,
  renderFooter,
}: {
  ranked: RankedSkaterStats[];
  headshots: HeadshotMap;
  renderFooter?: (p: RankedSkaterStats) => React.ReactNode;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ranked.map((p, i) => (
        <div key={p.name} className="rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <PlayerHeadshot name={p.name} headshots={headshots} size={44} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{p.name}</p>
              <p className="text-xs text-ink-faint">
                {p.team} &middot; {p.positions.join("/")}
              </p>
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-rink-blue-light px-2 py-1 text-xs font-bold text-rink-blue">
              #{i + 1}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-dim">
            {p.gamesPlayed}GP &middot; {p.goals}G &middot; {p.assists}A &middot;{" "}
            <span className="font-semibold text-ink">{p.goals + p.assists} PTS</span>
            {" "}&middot; {formatToi(p.toiPerGame)} TOI
          </p>
          {renderFooter && <div className="mt-3 border-t border-stripe pt-3">{renderFooter(p)}</div>}
        </div>
      ))}
    </div>
  );
}
