"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { YahooLeague } from "@/lib/yahoo-fantasy-client";

export function YahooConnectStatus({
  leagues,
  activeLeagueKey,
  onChangeLeague,
  leaguesLoading,
}: {
  leagues: YahooLeague[];
  activeLeagueKey: string | null;
  onChangeLeague: (leagueKey: string) => void;
  leaguesLoading: boolean;
}) {
  const searchParams = useSearchParams();
  const yahooResult = searchParams.get("yahoo");
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/yahoo/status")
      .then((res) => res.json())
      .then((json) => setConnected(json.connected))
      .catch(() => setConnected(false));
  }, [yahooResult]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {yahooResult === "connected" && (
        <div className="rounded-md border-l-4 border-rink-green bg-rink-green-light px-3 py-2 text-xs text-ink">
          Yahoo Fantasy connected.
        </div>
      )}
      {yahooResult === "error" && (
        <div className="rounded-md border-l-4 border-rink-red bg-rink-red-light px-3 py-2 text-xs text-ink">
          Couldn&apos;t connect Yahoo Fantasy - please try again.
        </div>
      )}
      {connected === true ? (
        <>
          <span className="rounded-full bg-rink-green-light px-2.5 py-1 text-xs font-semibold text-rink-green">
            Yahoo Fantasy connected
          </span>
          {!leaguesLoading && leagues.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
              League
              <select
                value={activeLeagueKey ?? ""}
                onChange={(e) => onChangeLeague(e.target.value)}
                className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
              >
                {leagues.map((l) => (
                  <option key={l.leagueKey} value={l.leagueKey}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!leaguesLoading && leagues.length === 1 && (
            <span className="text-xs text-ink-faint">League: {leagues[0].name}</span>
          )}
          {!leaguesLoading && leagues.length === 0 && (
            <span className="text-xs text-ink-faint">No NHL leagues found on your Yahoo account this season.</span>
          )}
        </>
      ) : connected === false ? (
        <a
          href="/api/yahoo/connect"
          className="rounded border border-rink-blue px-2.5 py-1 text-xs font-semibold text-rink-blue hover:bg-rink-blue hover:text-white"
        >
          Connect Yahoo Fantasy
        </a>
      ) : null}
    </div>
  );
}
