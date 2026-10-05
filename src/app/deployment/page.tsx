"use client";

import { DeploymentBoard } from "@/components/deployment-board";
import { useActiveYahooLeague } from "@/lib/yahoo-league-context";

export default function DeploymentPage() {
  const { activeLeagueKey } = useActiveYahooLeague();

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-ink">
        Deployment
      </h1>
      <div className="mt-2 h-[3px] w-16 bg-rink-blue" />
      <p className="mt-4 max-w-2xl text-sm text-ink-dim">
        Who&apos;s recently gotten meaningfully more (or less) trusted ice time and power-play time than their
        established track record - usually the earliest real sign of a fantasy breakout or a role that&apos;s
        drying up, before the points catch up to it.
      </p>

      <div className="mt-6">
        <DeploymentBoard activeLeagueKey={activeLeagueKey} />
      </div>
    </main>
  );
}
