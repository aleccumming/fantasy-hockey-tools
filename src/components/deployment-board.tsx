"use client";

import { useMemo, useState } from "react";
import { useDeploymentBoosts } from "@/lib/use-deployment-boosts";
import { useYahooPlayerEligibility } from "@/lib/use-yahoo-player-eligibility";
import { applyEligibilityOverrides } from "@/lib/apply-eligibility-overrides";
import { useHeadshots } from "@/lib/use-headshots";
import { useMyRoster } from "@/lib/use-my-roster";
import { useYahooFreeAgents } from "@/lib/use-yahoo-free-agents";
import { playerNameGroupKey } from "@/lib/player-identity-key";
import { PlayerHeadshot } from "@/components/player-headshot";
import { abbreviateFirstName } from "@/components/skater-rankings-table";
import { TeamMultiSelect } from "@/components/team-multi-select";
import { StatsRefresh } from "@/components/stats-refresh";
import { NHL_TEAMS } from "@/lib/schedule";
import {
  DEPLOYMENT_BASELINES,
  DEFAULT_DEPLOYMENT_BASELINE,
  DEPLOYMENT_ROLE_WINDOWS,
  DEFAULT_DEPLOYMENT_ROLE_WINDOW,
  type DeploymentBaseline,
  type DeploymentRoleWindow,
  type DeploymentRolePlayer,
  type RankedDeploymentPlayer,
} from "@/lib/deployment-types";
import type { Position } from "@/lib/types";

// "changes" = last game vs. a baseline; "roles" = raw deployment level in
// one window, for scanning e.g. free agents by who's actually getting used
// (the change list misses anyone whose role is steady, or who sat out the
// most recent game).
type View = "changes" | "roles";
type Direction = "boosts" | "drops";
type RoleSort = "toi" | "ppToi" | "ppShare" | "gp";
type OwnershipFilter = "all" | "unowned";
type SkaterGroup = "F" | "D";

const SORTED_TEAMS = [...NHL_TEAMS].sort((a, b) => a.localeCompare(b));

const PAGE_SIZE = 50;

const BASELINE_LABELS: Record<DeploymentBaseline, string> = {
  previousGame: "Previous Game",
  last3Games: "Last 3 Games",
  thisSeason: "This Season",
  lastSeason: "Last Season",
};

const ROLE_WINDOW_LABELS: Record<DeploymentRoleWindow, string> = {
  lastGame: "Last Game",
  last3Games: "Last 3 Games",
  last5Games: "Last 5 Games",
  last10Games: "Last 10 Games",
  thisSeason: "This Season",
};

const ROLE_SORT_VALUE: Record<RoleSort, (p: DeploymentRolePlayer) => number> = {
  toi: (p) => p.toiPerGame,
  ppToi: (p) => p.ppToiPerGame,
  ppShare: (p) => p.ppShare,
  gp: (p) => p.gamesPlayed,
};

// Real NHL players can share an exact name (confirmed live: two
// Sebastian Ahos, and two Elias Petterssons - who are even on the SAME
// team, one forward one defenseman). The F/D tabs happen to separate both
// known pairs, but nothing guarantees a future same-position collision
// won't land in one list. Keying rows by name alone gave React two rows sharing a key;
// React is allowed to assume same-key rows ARE the same row, so
// reordering the list (switching Biggest Boosts/Biggest Drops, which
// reverses the array) could pair the wrong row's DOM state to the wrong
// player's data - exactly the "weird data populating" a user reported
// after toggling back and forth a few times. Team+position makes the key
// unique the same way it already disambiguates headshot lookups.
function rowKey(p: { name: string; team: string; positions: Position[] }): string {
  return `${p.name}|${p.team}|${p.positions.join(",")}`;
}

function formatToi(minutes: number): string {
  // Round to whole seconds first - rounding just the remainder turned
  // 3:59.7 into "3:60".
  const totalSeconds = Math.round(minutes * 60);
  const seconds = totalSeconds % 60;
  return `${(totalSeconds - seconds) / 60}:${String(seconds).padStart(2, "0")}`;
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
  return `${sign}${Math.round(Math.abs(share) * 100)}%`;
}

function shareDeltaColor(share: number): string {
  if (share > 0.05) return "text-rink-green";
  if (share < -0.05) return "text-rink-red";
  return "text-ink-dim";
}

export function DeploymentBoard({ activeLeagueKey }: { activeLeagueKey: string | null }) {
  const { baselines, roles, computedAt, error, loading, reload } = useDeploymentBoosts();
  const { byName: yahooEligibilityByName } = useYahooPlayerEligibility();
  const headshots = useHeadshots();
  const { roster } = useMyRoster();
  const { freeAgents: yahooFreeAgents } = useYahooFreeAgents(activeLeagueKey);
  const [view, setView] = useState<View>("changes");
  const [baseline, setBaseline] = useState<DeploymentBaseline>(DEFAULT_DEPLOYMENT_BASELINE);
  const [roleWindow, setRoleWindow] = useState<DeploymentRoleWindow>(DEFAULT_DEPLOYMENT_ROLE_WINDOW);
  const [roleSort, setRoleSort] = useState<{ key: RoleSort; desc: boolean }>({ key: "ppShare", desc: true });
  const [direction, setDirection] = useState<Direction>("boosts");
  const [group, setGroup] = useState<SkaterGroup>("F");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [teamFilters, setTeamFilters] = useState<Set<string>>(new Set());
  const [nameQuery, setNameQuery] = useState("");
  const [page, setPage] = useState(1);

  const players = baselines?.[baseline] ?? null;
  const rolePlayers = roles?.[roleWindow] ?? null;

  const corrected = useMemo(
    () => applyEligibilityOverrides(players ?? [], yahooEligibilityByName),
    [players, yahooEligibilityByName]
  );
  const correctedRoles = useMemo(
    () => applyEligibilityOverrides(rolePlayers ?? [], yahooEligibilityByName),
    [rolePlayers, yahooEligibilityByName]
  );

  // Shared by both views.
  const matchesFilters = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    // "Unowned" = actually available per the connected Yahoo league when
    // one's active; otherwise just "not on my (sample/manual) roster" -
    // same convention as the Skaters page's ownership filter.
    const availableSet = yahooFreeAgents ? new Set(yahooFreeAgents.map((fa) => playerNameGroupKey(fa.name, fa.positions))) : null;
    const rosterSet = new Set(roster.map((p) => playerNameGroupKey(p.name, p.positions)));
    return (p: { name: string; team: string; positions: Position[] }) => {
      // Display split only - deploymentScore stays ranked across all skaters,
      // since a delta against a player's own baseline isn't skewed by F vs D.
      if (group === "D" ? !p.positions.includes("D") : p.positions.includes("D")) return false;
      if (teamFilters.size > 0 && !teamFilters.has(p.team)) return false;
      if (query && !p.name.toLowerCase().includes(query)) return false;
      if (ownershipFilter === "unowned") {
        // Name + F/D, so the free D Pettersson doesn't make the rostered
        // F Pettersson look available too.
        const key = playerNameGroupKey(p.name, p.positions);
        if (availableSet ? !availableSet.has(key) : rosterSet.has(key)) return false;
      }
      return true;
    };
  }, [group, teamFilters, nameQuery, ownershipFilter, roster, yahooFreeAgents]);

  const filtered = useMemo(() => {
    const rows = corrected.filter(matchesFilters);
    // Players are already sorted ascending by deploymentScore (biggest
    // boost first) from the service - "drops" is just the same list
    // reversed, not a separate computation, since the score is symmetric
    // (a low score = ranks well on both deltas, a high score = ranks
    // poorly on both, i.e. a real decline in trust on both fronts).
    return direction === "boosts" ? rows : [...rows].reverse();
  }, [corrected, matchesFilters, direction]);

  const filteredRoles = useMemo(() => {
    const value = ROLE_SORT_VALUE[roleSort.key];
    const sign = roleSort.desc ? -1 : 1;
    // Ties (e.g. a pile of 0% PP shares) fall back to TOI, highest first.
    return correctedRoles
      .filter(matchesFilters)
      .sort((a, b) => sign * (value(a) - value(b)) || b.toiPerGame - a.toiPerGame);
  }, [correctedRoles, matchesFilters, roleSort]);

  function toggleRoleSort(key: RoleSort) {
    setRoleSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  }

  const rowCount = view === "changes" ? filtered.length : filteredRoles.length;

  // Any change that reshuffles which rows qualify (or their order) should
  // land the viewer back on page 1 - otherwise e.g. switching from Forwards
  // (many pages) to Defense (fewer) can strand them on a page past the end.
  // Adjusted during render (React's recommended pattern for this, not an
  // effect) by comparing against the filter combo last seen.
  const filterKey = `${view}|${baseline}|${roleWindow}|${roleSort.key}|${roleSort.desc}|${direction}|${group}|${ownershipFilter}|${nameQuery}|${[...teamFilters].sort().join(",")}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const pagedRoles = filteredRoles.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  if (loading) {
    return <p className="mt-6 text-center text-sm text-ink-dim">Loading live deployment data from Natural Stat Trick...</p>;
  }
  if (error) {
    return <p className="mt-6 text-center text-sm text-rink-red">Couldn&apos;t load deployment data ({error}).</p>;
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ["changes", "Changes"],
            ["roles", "Current Roles"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`border-b-2 px-4 py-2 font-display text-base font-bold uppercase tracking-wide ${
              view === v ? "border-rink-blue text-ink" : "border-transparent text-ink-faint hover:text-ink-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-md border-l-4 border-rink-blue bg-rink-blue-light px-4 py-2.5 text-sm text-ink">
        {view === "roles" ? (
          <>
            Where each skater&apos;s deployment stands right now, not how it changed - for spotting an available
            player who&apos;s been getting big minutes or PP1 time all along. Click a column to sort, and pair it with
            Unowned to scan free agents. PP Share is the same share-of-team-PP-time used under Changes.
          </>
        ) : (
          <>
            Compares each skater&apos;s MOST RECENT GAME against a baseline you pick below - production mostly
            follows opportunity, not the other way around, so a real jump in trusted minutes is often the earliest
            sign of a breakout, before the points show up, and once it&apos;s visible everyone else is jumping on
            the player too. Previous Game is the fastest, noisiest read; Last Season is the steadiest. Power play
            uses each player&apos;s SHARE of their own team&apos;s total PP time, not raw minutes - a team that drew
            few penalties gives everyone low PP minutes regardless of unit, but a true PP1 player still claims the
            same large slice of whatever PP time existed. Only ice time is tracked here, not linemate identity
            specifically - no free source publishes real-time line combinations, but a genuine role change almost
            always comes with better linemates too.
          </>
        )}
        <div className="mt-1.5">
          <StatsRefresh dataset="deployment" computedAt={computedAt} onRefreshed={reload} />
        </div>
      </div>

      <div className="mt-4 flex gap-1">
        {view === "roles"
          ? DEPLOYMENT_ROLE_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setRoleWindow(w)}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${
                  roleWindow === w
                    ? "bg-rink-blue text-white"
                    : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                }`}
              >
                {ROLE_WINDOW_LABELS[w]}
              </button>
            ))
          : DEPLOYMENT_BASELINES.map((b) => (
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

      <div className="mt-4 flex gap-1 border-b border-line">
        <button
          onClick={() => setGroup("F")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${
            group === "F" ? "border-rink-blue text-ink" : "border-transparent text-ink-faint hover:text-ink-dim"
          }`}
        >
          Forwards
        </button>
        <button
          onClick={() => setGroup("D")}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${
            group === "D" ? "border-rink-blue text-ink" : "border-transparent text-ink-faint hover:text-ink-dim"
          }`}
        >
          Defense
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {view === "changes" && (
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
        )}
        <input
          type="text"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Search player..."
          className="w-48 rounded border border-line bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
        />
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
        <TeamMultiSelect teams={SORTED_TEAMS} selected={teamFilters} onChange={setTeamFilters} />
      </div>

      {ownershipFilter === "unowned" && !yahooFreeAgents && (
        <p className="mt-2 text-xs text-ink-faint">
          Filtered against a sample/manual roster - connect a Yahoo league for real ownership data.
        </p>
      )}

      {view === "roles" && !roles && (
        <p className="mt-4 text-center text-sm text-ink-dim">
          Current roles show up after the next stats refresh - use Refresh above, or check back after the daily update.
        </p>
      )}

      {view === "roles" && roles && (
        <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full min-w-[700px] table-fixed text-sm">
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-line bg-surface text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Player</th>
                <SortHeader label="GP" sortKey="gp" sort={roleSort} onSort={toggleRoleSort} />
                <SortHeader label="TOI/gm" sortKey="toi" sort={roleSort} onSort={toggleRoleSort} />
                <SortHeader label="PP TOI/gm" sortKey="ppToi" sort={roleSort} onSort={toggleRoleSort} />
                <SortHeader
                  label="PP Share"
                  sortKey="ppShare"
                  sort={roleSort}
                  onSort={toggleRoleSort}
                  title="This player's approximate share of the team's total power-play ice time, scaled to the games they actually played"
                />
              </tr>
            </thead>
            <tbody>
              {pagedRoles.map((p, i) => (
                <RoleRow key={rowKey(p)} rank={(clampedPage - 1) * PAGE_SIZE + i + 1} player={p} headshots={headshots} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "changes" && (
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
            {paged.map((p, i) => (
              <Row key={rowKey(p)} rank={(clampedPage - 1) * PAGE_SIZE + i + 1} player={p} headshots={headshots} />
            ))}
          </tbody>
        </table>
      </div>
      )}
      {rowCount === 0 && (view === "changes" || roles) && (
        <p className="mt-4 text-center text-sm text-ink-dim">No players match those filters.</p>
      )}
      {rowCount > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-ink-faint">
            Showing {(clampedPage - 1) * PAGE_SIZE + 1}-{Math.min(clampedPage * PAGE_SIZE, rowCount)} of {rowCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage <= 1}
              className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-dim"
            >
              Prev
            </button>
            <span className="text-xs text-ink-dim">
              Page {clampedPage} of {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={clampedPage >= pageCount}
              className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-dim"
            >
              Next
            </button>
          </div>
        </div>
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

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  title,
}: {
  label: string;
  sortKey: RoleSort;
  sort: { key: RoleSort; desc: boolean };
  onSort: (key: RoleSort) => void;
  title?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="px-2 py-2 text-center" title={title}>
      <button
        onClick={() => onSort(sortKey)}
        className={`uppercase tracking-wide hover:text-rink-blue ${active ? "text-rink-blue" : ""}`}
      >
        {label}
        {active ? (sort.desc ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );
}

function RoleRow({
  rank,
  player,
  headshots,
}: {
  rank: number;
  player: DeploymentRolePlayer;
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
      <td className="px-2 py-2 text-center tabular-nums text-ink-dim">{player.gamesPlayed}</td>
      <td className="px-2 py-2 text-center tabular-nums text-ink">{formatToi(player.toiPerGame)}</td>
      <td className="px-2 py-2 text-center tabular-nums text-ink">{formatToi(player.ppToiPerGame)}</td>
      <td className="px-2 py-2 text-center tabular-nums font-bold text-ink">{formatShare(player.ppShare)}</td>
    </tr>
  );
}
