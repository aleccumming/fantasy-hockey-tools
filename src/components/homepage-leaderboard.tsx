"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeCompositeRankingsByGroup } from "@/lib/streamer-stats";
import { SAMPLE_SKATER_STATS } from "@/lib/streamer-sample-data";
import { usePlayerEvaluatorStats } from "@/lib/use-player-evaluator-stats";
import { useHeadshots } from "@/lib/use-headshots";
import { PlayerHeadshot } from "@/components/player-headshot";

type Group = "F" | "D";

/** A small live teaser for the homepage - top 5 skaters by C-Score (last 5
 *  games), not filtered to "available" players since we have no league
 *  connected here (that's what the Unowned toggle on the Players page is
 *  for). */
export function HomepageLeaderboard() {
  const [group, setGroup] = useState<Group>("F");
  const headshots = useHeadshots();
  const { windows: liveWindows, loading } = usePlayerEvaluatorStats();
  const usingSampleData = !liveWindows;
  const statSource = liveWindows ? liveWindows.last5 : SAMPLE_SKATER_STATS;

  const byGroup = useMemo(() => computeCompositeRankingsByGroup(statSource), [statSource]);
  const top5 = (group === "F" ? byGroup.forwards : byGroup.defense).slice(0, 5);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-stripe px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-dim">
          Top 5 This Week &middot; {group === "F" ? "Forwards" : "Defense"}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setGroup("F")}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
              group === "F" ? "bg-rink-blue text-white" : "text-ink-faint hover:text-rink-blue"
            }`}
          >
            F
          </button>
          <button
            onClick={() => setGroup("D")}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
              group === "D" ? "bg-rink-blue text-white" : "text-ink-faint hover:text-rink-blue"
            }`}
          >
            D
          </button>
        </div>
      </div>

      {top5.map((p, i) => (
        <div
          key={p.name}
          className={`flex items-center gap-2.5 border-b border-stripe px-4 py-2.5 last:border-0 ${
            i % 2 === 1 ? "bg-stripe/60" : ""
          }`}
        >
          <PlayerHeadshot name={p.name} headshots={headshots} size={24} />
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {p.name} <span className="font-normal text-ink-faint">{p.team} &middot; {p.positions.join("/")}</span>
          </div>
          <div className="tabular-nums text-sm font-bold text-ink">{p.compositeRank.toFixed(1)}</div>
        </div>
      ))}

      <div className="border-t border-stripe px-4 py-2 text-[11px] text-ink-faint">
        {loading ? "Loading..." : usingSampleData ? "Sample data" : "Live"} &middot; ranked by C-Score &middot;{" "}
        <Link href="/players" className="text-rink-blue hover:underline">
          See full rankings &rarr;
        </Link>
      </div>
    </div>
  );
}
