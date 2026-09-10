"use client";

import { useMemo, useState } from "react";
import { useScheduleAnalysis } from "@/lib/use-schedule";
import type { TeamScheduleSummary } from "@/lib/schedule";

type BucketKey = Exclude<keyof TeamScheduleSummary, "team">;

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: "regularSeason", label: "Full Season" },
  { key: "firstHalf", label: "1st Half" },
  { key: "secondHalf", label: "2nd Half" },
  { key: "playoffs", label: "Playoffs" },
  { key: "firstThreeWeeks", label: "First 3 Weeks" },
];

function formatRange(range: { start: string; end: string }): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[Number(m) - 1]} ${Number(d)}`;
  };
  return `${fmt(range.start)}–${fmt(range.end)}`;
}

export function SchedulePanel() {
  const { data, error, loading } = useScheduleAnalysis();
  const [sortBy, setSortBy] = useState<BucketKey>("regularSeason");

  const teams = useMemo(() => {
    if (!data) return [];
    return [...data.teams].sort((a, b) => b[sortBy].offNightGames - a[sortBy].offNightGames);
  }, [data, sortBy]);

  if (loading) {
    return <p className="text-sm text-ink-dim">Loading NHL schedule&hellip;</p>;
  }
  if (error || !data) {
    return (
      <p className="text-sm text-rink-red">
        Couldn&apos;t load the schedule ({error ?? "unknown error"}).
      </p>
    );
  }

  const seasonLabel =
    data.season.length === 8 ? `${data.season.slice(0, 4)}-${data.season.slice(6, 8)}` : data.season;

  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
        Off-Night Schedule &mdash; {seasonLabel}
      </h3>
      <p className="mt-1 text-xs text-ink-faint">
        An &quot;off night&quot; is a date where 10 or fewer NHL teams play league-wide &mdash;
        easy to fit a streamer in around. Click a column to sort by that stretch&apos;s off
        nights.
      </p>

      <div className="mt-3 max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              <th className="px-2 py-1">Team</th>
              {BUCKETS.map((b) => (
                <th
                  key={b.key}
                  onClick={() => setSortBy(b.key)}
                  title={formatRange(data.bucketRanges[b.key])}
                  className={`cursor-pointer select-none px-2 py-1 hover:text-ink ${
                    sortBy === b.key ? "text-rink-blue" : ""
                  }`}
                >
                  {b.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.team} className={`border-b border-stripe ${i % 2 === 1 ? "bg-stripe/60" : ""}`}>
                <td className="px-2 py-1 font-semibold text-ink">{t.team}</td>
                {BUCKETS.map((b) => {
                  const stats = t[b.key];
                  return (
                    <td key={b.key} className="px-2 py-1 tabular-nums text-ink-dim">
                      {stats.games}g / {stats.offNightGames} off
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
