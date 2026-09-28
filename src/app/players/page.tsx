"use client";

import { PlayerEvaluatorBoard } from "@/components/player-evaluator-board";
import { YahooConnectStatus } from "@/components/yahoo-connect-status";
import { useYahooLeagues } from "@/lib/use-yahoo-leagues";

export default function PlayersPage() {
  const { leagues, activeLeagueKey, setActiveLeague, loading: leaguesLoading } = useYahooLeagues();

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-ink">
        Players
      </h1>
      <div className="mt-2 h-[3px] w-16 bg-rink-blue" />
      <p className="mt-4 max-w-2xl text-sm text-ink-dim">
        Rank the full skater pool by C-Score over Last 5 Games, Last 10 Games, or the Season,
        compare players side by side, or start a Drop &amp; Replace to find your best waiver-wire
        add.
      </p>

      <YahooConnectStatus
        leagues={leagues}
        activeLeagueKey={activeLeagueKey}
        onChangeLeague={setActiveLeague}
        leaguesLoading={leaguesLoading}
      />

      <div className="mt-6">
        <PlayerEvaluatorBoard activeLeagueKey={activeLeagueKey} />
      </div>
    </main>
  );
}
