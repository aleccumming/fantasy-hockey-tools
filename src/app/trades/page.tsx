"use client";

import { TradeTargetsBoard } from "@/components/trade-targets-board";
import { useActiveYahooLeague } from "@/lib/yahoo-league-context";

export default function TradesPage() {
  const { activeLeagueKey } = useActiveYahooLeague();

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-ink">
        Trade Targets
      </h1>
      <div className="mt-2 h-[3px] w-16 bg-rink-blue" />
      <p className="mt-4 max-w-2xl text-sm text-ink-dim">
        Buy-low skaters whose underlying process is strong but whose results are being held down by
        bad luck - then pick one to see which of your players fit what their owner&apos;s roster needs.
      </p>

      <div className="mt-6">
        <TradeTargetsBoard activeLeagueKey={activeLeagueKey} />
      </div>
    </main>
  );
}
