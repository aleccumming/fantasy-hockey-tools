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
import {
  DEPLOYMENT_BASELINES,
  DEFAULT_DEPLOYMENT_BASELINE,
  type DeploymentBaseline,
  type RankedDeploymentPlayer,
} from "@/lib/deployment-service";

type Direction = "boosts" | "drops";

const SORTED_TEAMS = [...NHL_TEAMS].sort((a, b) => a.localeCompare(b));

const BASELINE_LABELS: Record<DeploymentBaseline, string> = {
  previousGame: "Previous Game",
  last3Games: "Last 3 Games",
  thisSeason: "This Season",
  lastSeason: "Last Season",
};

// Real NHL players can share an exact name (confirmed live: two
// Sebastian Ahos, and two Elias Petterssons - who are even on the SAME
// team, one forward one defenseman) - unlike Rankings/Compare, this page
// shows every skater in one unified list rather than splitting by
// forward/defense, so a collision pair can genuinely both appear here
// together. Keying rows by name alone gave React two rows sharing a key;
// React is allowed to assume same-key rows ARE the same row, so
// reordering the list (switching Biggest Boosts/Biggest Drops, which
// reverses the array) could pair the wrong row's DOM state to the wrong
// player's data - exactly the "weird data populating" a user reported
// after toggling back and forth a few times. Team+position makes the key
// unique the same way it already disambiguates headshot lookups.
function rowKey(p: RankedDeploymentPlayer): string {
  return `${p.name}|${p.team}|${p.positions.join(",")}`;
}

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
  const { baselines, computedAt, error, loading } = useDeploymentBoosts();
  const { byName: yahooEligibilityByName } = useYahooPlayerEligibility();
  const headshots = useHeadshots();
  const [baseline, setBaseline] = useState<DeploymentBaseline>(DEFAULT_DEPLOYMENT_BASELINE);
  const [direction, setDirection] = useState<Direction>("boosts");
  const [teamFilters, setTeamFilters] = useState<Set<string>>(new Set());
  const [nameQuery, setNameQuery] = useState("");

  const players = baselines?.[baseline] ?? null;

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
        Compares each skater&apos;s MOST RECENT GAME against a baseline you pick below - production mostly follows
        opportunity, not the other way around, so a real jump in trusted minutes is often the earliest sign of a
        breakout, before the points show up, and once it&apos;s visible everyone else is jumping on the player too.
        Previous Game is the fastest, noisiest read; Last Season is the steadiest. Power play uses each
        player&apos;s SHARE of their own team&apos;s total PP time, not raw minutes - a team that drew few penalties
        gives everyone low PP minutes regardless of unit, but a true PP1 player still claims the same large slice of
        whatever PP time existed. Only ice time is tracked here, not linemate identity specifically - no free source
        publishes real-time line combinations, but a genuine role change almost always comes with better linemates
        too.
        {computedAt && <> Updated {new Date(computedAt).toLocaleString()}.</>}
      </div>

      <div className="mt-4 flex gap-1">
        {DEPLOYMENT_BASELINES.map((b) => (
          <button
            key={b}
            onClick={() => setBaseline(b)}
            className={`rounded px-2.5 py-1 text-xs font-semibold ${
              baseline === b
                ? "bg-rink-blue text-white"
                : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
            }`}
          >
            vs. {BASELINE_LABELS[b]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
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

      <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full min-w-[900px] table-fixed text-sm">
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
              <th className="px-2 py-2 text-center">GP (Last Game)</th>
              <th className="px-2 py-2 text-center">TOI/gm (Last Game)</th>
              <th className="px-2 py-2 text-center">TOI/gm ({BASELINE_LABELS[baseline]})</th>
              <th
                className="px-2 py-2 text-center"
                title={`Last game's TOI/game minus ${BASELINE_LABELS[baseline]}'s TOI/game`}
              >
                &Delta; TOI
              </th>
              <th
                className="px-2 py-2 text-center"
                title="This player's approximate share of the team's total power-play ice time, scaled to the games they actually played"
              >
                PP Share (Last Game)
              </th>
              <th
                className="px-2 py-2 text-center"
                title="This player's approximate share of the team's total power-play ice time, scaled to the games they actually played"
              >
                PP Share ({BASELINE_LABELS[baseline]})
              </th>
              <th
                className="px-2 py-2 text-center"
                title={`Last game's PP share minus ${BASELINE_LABELS[baseline]}'s PP share, in percentage points - the real PP1-vs-PP2 signal, not raw minutes`}
              >
                &Delta; PP Share
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <Row key={rowKey(p)} rank={i + 1} player={p} headshots={headshots} />
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
