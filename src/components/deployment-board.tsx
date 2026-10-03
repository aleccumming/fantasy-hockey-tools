"use client";

import { useMemo, useState } from "react";
import { useDeploymentBoosts } from "@/lib/use-deployment-boosts";
import { useYahooPlayerEligibility } from "@/lib/use-yahoo-player-eligibility";
import { applyEligibilityOverrides } from "@/lib/apply-eligibility-overrides";
import { useHeadshots } from "@/lib/use-headshots";
import { PlayerHeadshot } from "@/components/player-headshot";
import { abbreviateFirstName } from "@/components/skater-rankings-table";
import { TeamMultiSelect } from "@/components/team-multi-select";
import { NHL_TEAMS } from "@/lib/schedule";
import { RECENT_GAMES, type RankedDeploymentPlayer } from "@/lib/deployment-service";

type Direction = "boosts" | "drops";

const SORTED_TEAMS = [...NHL_TEAMS].sort((a, b) => a.localeCompare(b));

function formatToi(minutes: number): string {
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return `${whole}:${String(seconds).padStart(2, "0")}`;
}

function formatDelta(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "";
  return `${sign}${formatToi(Math.abs(minutes))}`;
}

function deltaColor(minutes: number): string {
  if (minutes > 0.5) return "text-rink-green";
  if (minutes < -0.5) return "text-rink-red";
  return "text-ink-dim";
}

function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function formatShareDelta(share: number): string {
  const sign = share > 0 ? "+" : share < 0 ? "−" : "";
  return `${sign}${Math.round(Math.abs(share) * 100)}pp`;
}

function shareDeltaColor(share: number): string {
  if (share > 0.05) return "text-rink-green";
  if (share < -0.05) return "text-rink-red";
  return "text-ink-dim";
}

export function DeploymentBoard() {
  const { players, computedAt, error, loading } = useDeploymentBoosts();
  const { byName: yahooEligibilityByName } = useYahooPlayerEligibility();
  const headshots = useHeadshots();
  const [direction, setDirection] = useState<Direction>("boosts");
  const [teamFilters, setTeamFilters] = useState<Set<string>>(new Set());
  const [nameQuery, setNameQuery] = useState("");

  const corrected = useMemo(
    () => applyEligibilityOverrides(players ?? [], yahooEligibilityByName),
    [players, yahooEligibilityByName]
  );

  const filtered = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    const rows = corrected.filter((p) => {
      if (teamFilters.size > 0 && !teamFilters.has(p.team)) return false;
      if (query && !p.name.toLowerCase().includes(query)) return false;
      return true;
    });
    // Players are already sorted ascending by deploymentScore (biggest
    // boost first) from the service - "drops" is just the same list
    // reversed, not a separate computation, since the score is symmetric
    // (a low score = ranks well on both deltas, a high score = ranks
    // poorly on both, i.e. a real decline in trust on both fronts).
    return direction === "boosts" ? rows : [...rows].reverse();
  }, [corrected, teamFilters, nameQuery, direction]);

  if (loading) {
    return <p className="mt-6 text-center text-sm text-ink-dim">Loading live deployment data from Natural Stat Trick...</p>;
  }
  if (error) {
    return <p className="mt-6 text-center text-sm text-rink-red">Couldn&apos;t load deployment data ({error}).</p>;
  }

  return (
    <div>
      <div className="rounded-md border-l-4 border-rink-blue bg-rink-blue-light px-4 py-2.5 text-sm text-ink">
        Compares each skater&apos;s Last {RECENT_GAMES} Games ice time against their last-season baseline - production mostly
        follows opportunity, not the other way around, so a real jump in trusted minutes is often the earliest sign
        of a breakout, before the points show up. Power play uses each player&apos;s SHARE of their own team&apos;s
        total PP time, not raw minutes - a team that drew few penalties gives everyone low PP minutes regardless of
        unit, but a true PP1 player still claims the same large slice of whatever PP time existed. Only ice time is
        tracked here, not linemate identity specifically - no free source publishes real-time line combinations, but
        a genuine role change almost always comes with better linemates too.
        {computedAt && <> Updated {new Date(computedAt).toLocaleString()}.</>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <button
            onClick={() => setDirection("boosts")}
            className={`rounded px-2.5 py-1 text-xs font-semibold ${
              direction === "boosts"
                ? "bg-rink-green text-white"
                : "border border-line bg-surface text-ink-dim hover:border-rink-green hover:text-rink-green"
            }`}
          >
            Biggest Boosts
          </button>
          <button
            onClick={() => setDirection("drops")}
            className={`rounded px-2.5 py-1 text-xs font-semibold ${
              direction === "drops"
                ? "bg-rink-red text-white"
                : "border border-line bg-surface text-ink-dim hover:border-rink-red hover:text-rink-red"
            }`}
          >
            Biggest Drops
          </button>
        </div>
        <input
          type="text"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Search player..."
          className="w-48 rounded border border-line bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
        />
        <TeamMultiSelect teams={SORTED_TEAMS} selected={teamFilters} onChange={setTeamFilters} />
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-2 py-2 text-center">GP (L{RECENT_GAMES})</th>
              <th className="px-2 py-2 text-center">TOI/gm (L{RECENT_GAMES})</th>
              <th className="px-2 py-2 text-center">TOI/gm (Last Yr)</th>
              <th
                className="px-2 py-2 text-center"
                title={`Last ${RECENT_GAMES} Games TOI/game minus last season's TOI/game`}
              >
                &Delta; TOI
              </th>
              <th
                className="px-2 py-2 text-center"
                title="This player's approximate share of the team's total power-play ice time"
              >
                PP Share (L{RECENT_GAMES})
              </th>
              <th
                className="px-2 py-2 text-center"
                title="This player's approximate share of the team's total power-play ice time"
              >
                PP Share (Last Yr)
              </th>
              <th
                className="px-2 py-2 text-center"
                title={`Last ${RECENT_GAMES} Games PP share minus last season's PP share, in percentage points - the real PP1-vs-PP2 signal, not raw minutes`}
              >
                &Delta; PP Share
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <Row key={p.name} rank={i + 1} player={p} headshots={headshots} />
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p className="mt-4 text-center text-sm text-ink-dim">No players match those filters.</p>
      )}
    </div>
  );
}

function Row({
  rank,
  player,
  headshots,
}: {
  rank: number;
  player: RankedDeploymentPlayer;
  headshots: ReturnType<typeof useHeadshots>;
}) {
  return (
    <tr className={`border-b border-stripe last:border-0 ${rank % 2 === 0 ? "bg-stripe/60" : ""}`}>
      <td className="px-3 py-2 tabular-nums text-ink-dim">{rank}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <PlayerHeadshot name={player.name} team={player.team} positions={player.positions} headshots={headshots} size={32} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink" title={player.name}>
              {abbreviateFirstName(player.name)}
            </div>
            <div className="truncate text-xs text-ink-faint">
              {player.positions.join("/")} - {player.team}
            </div>
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-center tabular-nums text-ink-dim">{player.recentGamesPlayed}</td>
      <td className="px-2 py-2 text-center tabular-nums text-ink-dim">{formatToi(player.recentToiPerGame)}</td>
      <td className="px-2 py-2 text-center tabular-nums text-ink-faint">{formatToi(player.baselineToiPerGame)}</td>
      <td className={`px-2 py-2 text-center tabular-nums font-bold ${deltaColor(player.toiDelta)}`}>
        {formatDelta(player.toiDelta)}
      </td>
      <td
        className="px-2 py-2 text-center tabular-nums text-ink-dim"
        title={`${formatToi(player.recentPpToiPerGame)} PP min/gm`}
      >
        {formatShare(player.recentPpShare)}
      </td>
      <td
        className="px-2 py-2 text-center tabular-nums text-ink-faint"
        title={`${formatToi(player.baselinePpToiPerGame)} PP min/gm`}
      >
        {formatShare(player.baselinePpShare)}
      </td>
      <td className={`px-2 py-2 text-center tabular-nums font-bold ${shareDeltaColor(player.ppShareDelta)}`}>
        {formatShareDelta(player.ppShareDelta)}
      </td>
    </tr>
  );
}
