"use client";

import { useMemo, useState } from "react";
import { useDraftStore } from "@/store/draft-store";
import { useDraftData } from "@/lib/use-draft-data";
import { getDraftedPlayerIds } from "@/lib/draft-helpers";
import { useScheduleAnalysis } from "@/lib/use-schedule";
import { useHeadshots } from "@/lib/use-headshots";
import { PlayerHeadshot } from "@/components/player-headshot";
import { DraftButton } from "@/components/draft-button";
import {
  bucketConflictScores,
  computeCandidateConflict,
  CONFLICT_BADGE_CLASSES,
  CONFLICT_LABELS,
  type ConflictLevel,
} from "@/lib/schedule-conflict";
import type { EnrichedPlayer } from "@/lib/ranking-sources";
import type { Position } from "@/lib/types";

type SortKey = "rank" | "name" | "team" | "fantasyPoints" | "vor" | "adp" | "avgRank" | string;

const POSITION_FILTERS: ("ALL" | Position)[] = ["ALL", "C", "LW", "RW", "D", "G"];

const TIER_DOT_COLORS = ["bg-rink-blue", "bg-rink-gold", "bg-ink-faint", "bg-rink-green", "bg-rink-red"];

const SOURCE_SORT_PREFIX = "source:";

function formatStatsLine(player: EnrichedPlayer): string {
  const entries = Object.entries(player.stats).filter(([, v]) => typeof v === "number");
  return entries
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${v}`)
    .join("  ·  ");
}

export function CheatSheet({ compact = false }: { compact?: boolean }) {
  const picks = useDraftStore((s) => s.picks);
  const draftPlayer = useDraftStore((s) => s.draftPlayer);
  const teamNames = useDraftStore((s) => s.teamNames);

  const { ranked, hasProjections, rankingSources, myRosterSlots } = useDraftData();
  const { data: schedule } = useScheduleAnalysis();
  const headshots = useHeadshots();

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<"ALL" | Position>("ALL");
  const [hideDrafted, setHideDrafted] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const draftedIds = useMemo(() => getDraftedPlayerIds(picks), [picks]);
  const draftedByMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const pick of picks) {
      if (pick.playerId) map.set(pick.playerId, pick.teamIndex);
    }
    return map;
  }, [picks]);

  const conflictById = useMemo(() => {
    const map = new Map<string, { score: number; level: ConflictLevel; teams: string[] }>();
    if (!schedule) return map;

    const raw = ranked.map((p) => ({
      id: p.id,
      conflict: computeCandidateConflict(p, myRosterSlots, schedule.overlapMatrix),
    }));
    const levelByScore = bucketConflictScores(raw.map((r) => r.conflict.score));

    for (const r of raw) {
      map.set(r.id, {
        score: r.conflict.score,
        teams: r.conflict.relevantTeams,
        level: levelByScore.get(r.conflict.score)!,
      });
    }
    return map;
  }, [ranked, myRosterSlots, schedule]);

  const filtered = useMemo(() => {
    let list: EnrichedPlayer[] = ranked;
    if (hideDrafted) list = list.filter((p) => !draftedIds.has(p.id));
    if (positionFilter !== "ALL") {
      list = list.filter((p) => p.positions.includes(positionFilter));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
      );
    }
    const sourceId = sortKey.startsWith(SOURCE_SORT_PREFIX)
      ? sortKey.slice(SOURCE_SORT_PREFIX.length)
      : null;
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sourceId) {
        cmp = (a.sourceRanks[sourceId] ?? Infinity) - (b.sourceRanks[sourceId] ?? Infinity);
      } else {
        switch (sortKey) {
          case "rank":
            cmp = a.rank - b.rank;
            break;
          case "name":
            cmp = a.name.localeCompare(b.name);
            break;
          case "team":
            cmp = a.team.localeCompare(b.team);
            break;
          case "fantasyPoints":
            cmp = b.fantasyPoints - a.fantasyPoints;
            break;
          case "vor":
            cmp = b.vor - a.vor;
            break;
          case "adp":
            cmp = (a.adp ?? 9999) - (b.adp ?? 9999);
            break;
          case "avgRank":
            cmp = a.avgRank - b.avgRank;
            break;
        }
      }
      return cmp * sortDir;
    });
    return sorted;
  }, [ranked, hideDrafted, draftedIds, positionFilter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  if (ranked.length === 0) {
    return (
      <p className="rounded-md border border-line bg-surface p-6 text-center text-sm text-ink-dim">
        Import a player ranking CSV from Settings to build your cheat sheet.
      </p>
    );
  }

  const hasSources = !compact && rankingSources.length > 0;
  const showProjections = !compact && hasProjections;

  const controls = (
      <div className={`flex flex-wrap items-center gap-3 ${compact ? "" : "mb-3"}`}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or team..."
          className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
        />
        <div className="flex gap-1">
          {POSITION_FILTERS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPositionFilter(pos)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                positionFilter === pos
                  ? "bg-rink-blue text-white"
                  : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
          <input
            type="checkbox"
            checked={hideDrafted}
            onChange={(e) => setHideDrafted(e.target.checked)}
            className="accent-rink-blue"
          />
          Hide drafted
        </label>
        <span className="ml-auto text-xs text-ink-faint">{filtered.length} players</span>
      </div>
  );

  const table = (
      <div
        className={`overflow-auto ${
          compact ? "h-full" : "rounded-md border border-line bg-surface max-h-[75vh]"
        }`}
      >
        <table className={`w-full text-sm ${compact ? "" : "min-w-[900px]"}`}>
          <thead>
            <tr className="sticky top-0 z-10 border-b border-line bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              <th className="px-2 py-2"></th>
              <Th label="Rank" onClick={() => toggleSort("rank")} active={sortKey === "rank"} />
              {showProjections && <th className="px-3 py-2">Tier</th>}
              <Th label="Name" onClick={() => toggleSort("name")} active={sortKey === "name"} />
              <Th label="Team" onClick={() => toggleSort("team")} active={sortKey === "team"} />
              <th className="px-3 py-2">Pos</th>
              {showProjections && (
                <>
                  <Th
                    label="Fantasy Pts"
                    onClick={() => toggleSort("fantasyPoints")}
                    active={sortKey === "fantasyPoints"}
                  />
                  <Th label="VOR" onClick={() => toggleSort("vor")} active={sortKey === "vor"} />
                </>
              )}
              <Th label="ADP" onClick={() => toggleSort("adp")} active={sortKey === "adp"} />
              {hasSources && (
                <Th
                  label="Avg Rank"
                  onClick={() => toggleSort("avgRank")}
                  active={sortKey === "avgRank"}
                />
              )}
              {!compact &&
                rankingSources.map((s) => (
                  <Th
                    key={s.id}
                    label={s.name}
                    onClick={() => toggleSort(`${SOURCE_SORT_PREFIX}${s.id}`)}
                    active={sortKey === `${SOURCE_SORT_PREFIX}${s.id}`}
                  />
                ))}
              <th
                className="px-3 py-2"
                title="How much this player's team schedule overlaps with players you've already rostered at a shared position (including UTIL)"
              >
                Schedule
              </th>
              {showProjections && <th className="px-3 py-2">Stats</th>}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const drafted = draftedIds.has(p.id);
              const draftedByIdx = draftedByMap.get(p.id);
              return (
                <tr
                  key={p.id}
                  className={`border-b border-stripe ${i % 2 === 1 ? "bg-stripe/60" : ""} ${
                    drafted ? "opacity-40" : "hover:bg-rink-blue-light/50"
                  }`}
                >
                  <td className="px-2 py-2.5">
                    <div className="flex justify-center">
                      {!drafted && <DraftButton onClick={() => draftPlayer(p.id)} />}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-ink-dim">{p.rank}</td>
                  {showProjections && (
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${TIER_DOT_COLORS[(p.tier - 1) % TIER_DOT_COLORS.length]}`}
                        title={`Tier ${p.tier}`}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <PlayerHeadshot name={p.name} team={p.team} positions={p.positions} headshots={headshots} size={34} />
                      <span className="font-semibold text-ink">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-dim">{p.team}</td>
                  <td className="px-3 py-2.5 text-ink-dim">{p.positions.join("/")}</td>
                  {showProjections && (
                    <>
                      <td className="px-3 py-2.5 tabular-nums text-ink">
                        {p.fantasyPoints.toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ink-dim">{p.vor.toFixed(1)}</td>
                    </>
                  )}
                  <td className="px-3 py-2.5 tabular-nums text-ink-dim">{p.adp ?? "-"}</td>
                  {hasSources && (
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-ink">
                      {p.avgRank.toFixed(1)}
                    </td>
                  )}
                  {!compact &&
                    rankingSources.map((s) => (
                      <td key={s.id} className="px-3 py-2.5 tabular-nums text-ink-dim">
                        {p.sourceRanks[s.id] ?? "-"}
                      </td>
                    ))}
                  <td className="px-3 py-2.5">
                    {(() => {
                      const conflict = conflictById.get(p.id);
                      if (!conflict) return <span className="text-ink-faint">-</span>;
                      const tooltip =
                        conflict.teams.length > 0
                          ? `${CONFLICT_LABELS[conflict.level]} schedule conflict with your rostered ${conflict.teams.join(", ")}`
                          : "No overlap with your currently rostered players at a shared position";
                      return (
                        <span
                          title={tooltip}
                          className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${CONFLICT_BADGE_CLASSES[conflict.level]}`}
                        >
                          {CONFLICT_LABELS[conflict.level]}
                        </span>
                      );
                    })()}
                  </td>
                  {showProjections && (
                    <td className="max-w-xs truncate px-3 py-2.5 text-xs text-ink-faint">
                      {formatStatsLine(p)}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    {drafted && (
                      <span className="text-xs text-ink-faint">
                        {draftedByIdx !== undefined ? teamNames[draftedByIdx] : "Drafted"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col rounded-md border border-line bg-surface p-4 lg:h-full">
        <h3 className="shrink-0 font-display text-sm font-bold uppercase tracking-wide text-ink">
          Rankings
        </h3>
        <div className="mt-3 shrink-0">{controls}</div>
        <div className="mt-3 min-h-0 flex-1">{table}</div>
      </div>
    );
  }

  return (
    <div>
      {controls}
      {table}
    </div>
  );
}

function Th({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-3 py-2 hover:text-ink ${
        active ? "text-rink-blue" : ""
      }`}
    >
      {label}
    </th>
  );
}
