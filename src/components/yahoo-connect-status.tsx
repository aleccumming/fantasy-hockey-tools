"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useActiveYahooLeague } from "@/lib/yahoo-league-context";

// Lives in the site header (see layout.tsx) so it's visible - and usable -
// from any page, not just Skaters. Reads the shared YahooLeagueProvider
// context rather than fetching on its own, so switching leagues here is
// instantly reflected wherever else reads the active league (Drop &
// Replace, eventually Goalies).
export function YahooConnectStatus() {
  const searchParams = useSearchParams();
  const yahooResult = searchParams.get("yahoo");
  const [connected, setConnected] = useState<boolean | null>(null);
  const { leagues, activeLeagueKey, setActiveLeague, loading: leaguesLoading } = useActiveYahooLeague();

  useEffect(() => {
    fetch("/api/yahoo/status")
      .then((res) => res.json())
      .then((json) => setConnected(json.connected))
      .catch(() => setConnected(false));
  }, [yahooResult]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {yahooResult === "connected" && (
        <span className="rounded-md border-l-4 border-rink-green bg-rink-green-light px-2 py-1 text-ink">
          Yahoo Fantasy connected.
        </span>
      )}
      {yahooResult === "error" && (
        <span className="rounded-md border-l-4 border-rink-red bg-rink-red-light px-2 py-1 text-ink">
          Couldn&apos;t connect Yahoo Fantasy - please try again.
        </span>
      )}
      {connected === true ? (
        <>
          <span className="rounded-full bg-rink-green-light px-2 py-1 font-semibold text-rink-green">
            Yahoo connected
          </span>
          {!leaguesLoading && leagues.length > 1 && (
            <select
              value={activeLeagueKey ?? ""}
              onChange={(e) => setActiveLeague(e.target.value)}
              className="rounded border border-line bg-surface px-1.5 py-1 text-ink focus:border-rink-blue focus:outline-none"
            >
              {leagues.map((l) => (
                <option key={l.leagueKey} value={l.leagueKey}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {!leaguesLoading && leagues.length === 1 && (
            <span className="text-ink-faint">{leagues[0].name}</span>
          )}
          {!leaguesLoading && leagues.length === 0 && (
            <span className="text-ink-faint">No NHL leagues found this season</span>
          )}
        </>
      ) : connected === false ? (
        <a
          href="/api/yahoo/connect"
          className="rounded border border-rink-blue px-2 py-1 font-semibold text-rink-blue hover:bg-rink-blue hover:text-white"
        >
          Connect Yahoo Fantasy
        </a>
      ) : null}
    </div>
  );
}
