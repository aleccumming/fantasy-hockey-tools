"use client";

import { useMemo, useState } from "react";
import type { RankedSkaterStats } from "@/lib/streamer-stats";
import type { HeadshotMap } from "@/lib/headshots";
import { PlayerHeadshot } from "@/components/player-headshot";

/** `shortLabel` drops the "/60" for the rankings table's column headers -
 *  the group header says "per 60" once instead, which lets these columns be
 *  much narrower. `label` (with "/60") is still used where there's room,
 *  e.g. Compare. */
export const METRIC_COLUMNS: {
  key: keyof RankedSkaterStats["metricRanks"];
  label: string;
  shortLabel: string;
  title: string;
}[] = [
  { key: "shotsPer60", label: "Shots/60", shortLabel: "Shots", title: "Shots per 60 minutes" },
  { key: "iCFPer60", label: "iCF/60", shortLabel: "iCF", title: "Individual Corsi For per 60" },
  { key: "iSCFPer60", label: "iSCF/60", shortLabel: "iSCF", title: "Individual Scoring Chances For per 60" },
  { key: "ixGPer60", label: "ixG/60", shortLabel: "ixG", title: "Individual Expected Goals per 60" },
  { key: "oiCFPer60", label: "oiCF/60", shortLabel: "oiCF", title: "On-ice Corsi For per 60" },
  { key: "oiSCFPer60", label: "oiSCF/60", shortLabel: "oiSCF", title: "On-ice Scoring Chances For per 60" },
  { key: "oixGPer60", label: "oixG/60", shortLabel: "oixG", title: "On-ice Expected Goals For per 60" },
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

/** Optional trailing columns (e.g. Drop & Replace's Roster Fit dots and its
 *  Stage button) - omitted entirely for tools that don't need them. */
export interface ExtraColumn {
  groupLabel: string;
  header: string;
  /** Fixed pixel width - wide enough for the column's content. */
  widthPx: number;
  render: (p: RankedSkaterStats) => React.ReactNode;
  /** Makes the column header clickable to sort by it (e.g. "who has the
   *  most games in range" - the whole point of Drop & Replace). Omit for a
   *  purely informational extra column. */
  sortValue?: (p: RankedSkaterStats) => number;
  /** Tight, centered padding - for a narrow icon-button column. */
  compact?: boolean;
  /** Center the header and cell content (normal padding). */
  center?: boolean;
}

// Each column's MINIMUM width in pixels, measured against the live page
// (label/value text width + 12px padding - see SortIndicator for why the
// sort arrow doesn't need room). The table never gets narrower than their
// sum (it scrolls horizontally instead of squashing text together), and
// above it every column grows proportionally - see `pct` below. Team/
// position live inside the Player cell (name with "POS - TEAM" stacked
// below, styled after Yahoo's own player rows).
const COL_PX = {
  rank: 36,
  cScore: 68,
  boxScore: 36, // GP / G / A / PTS
  toi: 52,
  metric: 46,
  luck: 56,
  banger: 38,
};
const PLAYER_MIN_PX = 160;
const FIXED_COLUMNS_PX =
  COL_PX.rank +
  COL_PX.cScore +
  COL_PX.boxScore * 4 +
  COL_PX.toi +
  COL_PX.metric * METRIC_COLUMNS.length +
  COL_PX.luck * LUCK_COLUMNS.length +
  COL_PX.banger * BANGERS_COLUMNS.length;

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
  | `extra-${number}`;

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

function isExtraKey(key: SortKey): key is `extra-${number}` {
  return key.startsWith("extra-");
}

function sortValue(p: RankedSkaterStats, key: SortKey, extraColumns: ExtraColumn[]): number | string {
  if (isExtraKey(key)) return extraColumns[Number(key.slice("extra-".length))]?.sortValue?.(p) ?? 0;
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
    default:
      return p.metricRanks[key];
  }
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  // Absolutely positioned (at its natural spot, right after the label) so
  // it takes no layout width - columns are sized to their labels alone and
  // the arrow sits in the cell padding, instead of every column reserving
  // room for an arrow only one of them shows at a time.
  return <span className="absolute ml-px text-[8px]">{dir === "asc" ? "▲" : "▼"}</span>;
}

// Stable default so the sort memo doesn't see a fresh [] every render.
const NO_EXTRA_COLUMNS: ExtraColumn[] = [];

interface TableProps {
  ranked: RankedSkaterStats[];
  headshots: HeadshotMap;
  windowLabel: string;
  extraColumns?: ExtraColumn[];
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
  extraColumns = NO_EXTRA_COLUMNS,
  abbreviateNames = true,
  initialSortKey,
}: TableProps) {
  const minTableWidth =
    FIXED_COLUMNS_PX + PLAYER_MIN_PX + extraColumns.reduce((sum, c) => sum + c.widthPx, 0);
  // Every column is the same SHARE of the table it would get at minimum
  // width, so on a wider screen all columns grow together and the spacing
  // stays even. (Letting only Player absorb the extra left a big empty gap
  // after the names on wide screens.)
  const pct = (px: number) => `${(px / minTableWidth) * 100}%`;

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
      const va = sortValue(a, sortKey, extraColumns);
      const vb = sortValue(b, sortKey, extraColumns);
      const cmp =
        typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [ranked, sortKey, sortDir, extraColumns]);

  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full table-fixed text-sm" style={{ minWidth: minTableWidth }}>
        <colgroup>
          <col style={{ width: pct(COL_PX.rank) }} />
          <col style={{ width: pct(COL_PX.cScore) }} />
          <col style={{ width: pct(PLAYER_MIN_PX) }} />
          {["gp", "g", "a", "pts"].map((k) => (
            <col key={k} style={{ width: pct(COL_PX.boxScore) }} />
          ))}
          <col style={{ width: pct(COL_PX.toi) }} />
          {METRIC_COLUMNS.map((m) => (
            <col key={m.key} style={{ width: pct(COL_PX.metric) }} />
          ))}
          {LUCK_COLUMNS.map((m) => (
            <col key={m.key} style={{ width: pct(COL_PX.luck) }} />
          ))}
          {BANGERS_COLUMNS.map((m) => (
            <col key={m.key} style={{ width: pct(COL_PX.banger) }} />
          ))}
          {extraColumns.map((c) => (
            <col key={c.header} style={{ width: pct(c.widthPx) }} />
          ))}
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
              Underlying Metric Ranks (per 60)
            </th>
            <th colSpan={LUCK_COLUMNS.length} className="border-l border-stripe px-2 py-1 text-center">
              Luck / Regression
            </th>
            <th
              colSpan={BANGERS_COLUMNS.length}
              className="border-l border-stripe px-2 py-1 text-center"
              title="Categories-league value (hits/blocks/PIM) - not part of C-Score, which is tuned for points leagues"
            >
              Banger Stats
            </th>
            {extraColumns.map((c) => (
              <th key={c.header} className="border-l border-stripe px-2 py-1 text-center">
                {c.groupLabel}
              </th>
            ))}
          </tr>
          <tr className="sticky top-[25px] z-20 border-b border-line bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim [&>th]:sticky [&>th]:top-[25px] [&>th]:bg-surface">
            <th className="px-1.5 py-2 cursor-pointer select-none hover:text-ink" onClick={() => setSortKey(null)} title="Reset to default (C-Score) order">
              #
            </th>
            <th
              className="cursor-pointer select-none whitespace-nowrap px-1.5 py-2 hover:text-ink"
              onClick={() => handleSort("compositeRank")}
              title="Composite rank score - average of the 7 metric ranks to the right, lower is better"
            >
              C-Score<SortIndicator active={sortKey === "compositeRank"} dir={sortDir} />
            </th>
            <th className="cursor-pointer select-none px-2 py-2 hover:text-ink" onClick={() => handleSort("name")}>
              Player<SortIndicator active={sortKey === "name"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none border-l border-stripe px-1.5 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("gamesPlayed")}
              title={`Games played over ${windowLabel}`}
            >
              GP<SortIndicator active={sortKey === "gamesPlayed"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none px-1.5 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("goals")}
              title={`Goals over ${windowLabel}`}
            >
              G<SortIndicator active={sortKey === "goals"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none px-1.5 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("assists")}
              title={`Assists over ${windowLabel}`}
            >
              A<SortIndicator active={sortKey === "assists"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none px-1.5 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("points")}
              title={`Points over ${windowLabel}`}
            >
              PTS<SortIndicator active={sortKey === "points"} dir={sortDir} />
            </th>
            <th
              className="cursor-pointer select-none px-1.5 py-2 normal-case hover:text-ink"
              onClick={() => handleSort("toiPerGame")}
              title="Average time on ice per game"
            >
              TOI<SortIndicator active={sortKey === "toiPerGame"} dir={sortDir} />
            </th>
            {METRIC_COLUMNS.map((m, i) => (
              <th
                key={m.key}
                className={`cursor-pointer select-none px-1.5 py-2 text-center normal-case hover:text-ink ${i === 0 ? "border-l border-stripe" : ""}`}
                onClick={() => handleSort(m.key)}
                title={m.title}
              >
                {m.shortLabel}
                <SortIndicator active={sortKey === m.key} dir={sortDir} />
              </th>
            ))}
            {LUCK_COLUMNS.map((m, i) => (
              <th
                key={m.key}
                className={`cursor-pointer select-none px-1.5 py-2 text-center normal-case hover:text-ink ${i === 0 ? "border-l border-stripe" : ""}`}
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
                className={`cursor-pointer select-none px-1.5 py-2 text-center normal-case hover:text-ink ${i === 0 ? "border-l border-stripe" : ""}`}
                onClick={() => handleSort(m.key)}
                title={m.title}
              >
                {m.label}
                <SortIndicator active={sortKey === m.key} dir={sortDir} />
              </th>
            ))}
            {extraColumns.map((c, i) => (
              <th
                key={c.header}
                className={`border-l border-stripe py-2 ${c.compact ? "px-1" : "px-2"} ${
                  c.compact || c.center ? "text-center" : ""
                } ${
                  c.sortValue ? "cursor-pointer select-none hover:text-ink" : ""
                }`}
                onClick={c.sortValue ? () => handleSort(`extra-${i}`) : undefined}
              >
                {c.header}
                <SortIndicator active={sortKey === `extra-${i}`} dir={sortDir} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRanked.map((p, i) => (
            <tr
              key={`${p.name}|${p.team}|${p.positions.join(",")}`}
              className={`border-b border-stripe last:border-0 ${i % 2 === 1 ? "bg-stripe/60" : ""}`}
            >
              <td className="px-1.5 py-2 tabular-nums text-ink-dim">{i + 1}</td>
              <td className="px-1.5 py-2 tabular-nums font-semibold text-ink">{p.compositeRank.toFixed(1)}</td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <PlayerHeadshot name={p.name} team={p.team} positions={p.positions} headshots={headshots} size={34} />
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
              <td className="border-l border-stripe px-1.5 py-2 tabular-nums text-ink-dim">{p.gamesPlayed}</td>
              <td className="px-1.5 py-2 tabular-nums text-ink-dim">{p.goals}</td>
              <td className="px-1.5 py-2 tabular-nums text-ink-dim">{p.assists}</td>
              <td className="px-1.5 py-2 tabular-nums font-semibold text-ink">{p.goals + p.assists}</td>
              <td className="px-1.5 py-2 tabular-nums text-ink-dim">{formatToi(p.toiPerGame)}</td>
              {METRIC_COLUMNS.map((m, colIdx) => (
                <td
                  key={m.key}
                  className={`px-1.5 py-2 text-center tabular-nums text-ink-dim ${colIdx === 0 ? "border-l border-stripe" : ""}`}
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
                    className={`whitespace-nowrap px-1.5 py-2 text-center tabular-nums font-medium text-ink-dim ${colIdx === 0 ? "border-l border-stripe" : ""}`}
                    style={luckCellStyle(delta)}
                    title={`Career baseline ${baseline.toFixed(1)}% - ${sign}${delta.toFixed(1)} pts vs ${windowLabel}`}
                  >
                    {/* "100.0%" is one character too wide for these columns
                        and got clipped; IPP hits exactly 100% often in small
                        samples, and nothing is lost since 100 is the cap. */}
                    {value >= 100 ? value.toFixed(0) : value.toFixed(1)}%
                  </td>
                );
              })}
              {BANGERS_COLUMNS.map((m, colIdx) => (
                <td
                  key={m.key}
                  className={`px-1.5 py-2 text-center tabular-nums text-ink-dim ${colIdx === 0 ? "border-l border-stripe" : ""}`}
                >
                  {p[m.key]}
                </td>
              ))}
              {extraColumns.map((c) => (
                <td key={c.header} className={`border-l border-stripe py-2 ${c.compact ? "px-1" : "px-2"}`}>
                  {c.compact || c.center ? <div className="flex justify-center">{c.render(p)}</div> : c.render(p)}
                </td>
              ))}
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
        <div key={`${p.name}|${p.team}|${p.positions.join(",")}`} className="rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <PlayerHeadshot name={p.name} team={p.team} positions={p.positions} headshots={headshots} size={44} />
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
