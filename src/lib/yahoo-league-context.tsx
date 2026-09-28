"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useYahooLeagues } from "./use-yahoo-leagues";
import type { YahooLeague } from "./yahoo-fantasy-client";

interface YahooLeagueContextValue {
  leagues: YahooLeague[];
  activeLeagueKey: string | null;
  setActiveLeague: (leagueKey: string) => Promise<void>;
  connected: boolean;
  loading: boolean;
}

const YahooLeagueContext = createContext<YahooLeagueContextValue | null>(null);

// Wraps the whole app (see layout.tsx) so the header's connect/switcher UI
// and any page that needs the active league (e.g. Drop & Replace) share the
// exact same fetch/state - two separate hook instances would go out of sync
// the moment you switch leagues in the header.
export function YahooLeagueProvider({ children }: { children: ReactNode }) {
  const value = useYahooLeagues();
  return <YahooLeagueContext.Provider value={value}>{children}</YahooLeagueContext.Provider>;
}

export function useActiveYahooLeague(): YahooLeagueContextValue {
  const ctx = useContext(YahooLeagueContext);
  if (!ctx) throw new Error("useActiveYahooLeague must be used within YahooLeagueProvider");
  return ctx;
}
