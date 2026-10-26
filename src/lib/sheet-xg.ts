// Server-only. Reads xG ranks from a public Google Sheet ("ag_xg_data")
// built on an adjusted expected-goals model, which replaces NST's ixG/oixG
// in C-Score for the two windows the sheet covers (Season and Last 5). The
// sheet only publishes RANKS, not raw xG values, and ranks against its own
// pool (20+ minutes TOI, F and D separately) - so they're only used as a
// sort order and re-ranked within this app's pool (see
// computeCompositeRankings). Fetched by the daily stats refresh, never by
// page requests.
import Papa from "papaparse";
import { playerNameGroupKey } from "./player-identity-key";

const SHEET_ID = "1FxlF_jSAyqgHbhx7SoD5ha5LxkJCssYx-spycz6Ev2A";
const TAB_GIDS = { season: "1879394249", last5: "1559511681" } as const;

// The sheet uses the NHL's spelling of names, which differs from NST's
// for a few players (sheet name -> NST name). Found by checking which
// regulars came back without a sheet rank on 2026-10-26.
const SHEET_NAME_TO_NST: Record<string, string> = {
  "Jacob Middleton": "Jake Middleton",
  "William Borgen": "Will Borgen",
  "Freddy Gaudreau": "Frederic Gaudreau",
  "Jeff Viel": "Jeffrey Viel",
  "Maksim Tsyplakov": "Maxim Tsyplakov",
};

/** The sheet suffixes same-name players with their group ("Elias
 *  Pettersson F") - stripped, since the F/D half of the key already
 *  splits them. */
function toNstName(sheetName: string, position: string): string {
  const name = sheetName.trim().replace(new RegExp(`\\s+${position}$`), "");
  return SHEET_NAME_TO_NST[name] ?? name;
}

/** The sheet's rank (1 = best) for each xG metric. */
export interface SheetXgRank {
  ixG: number;
  oixG: number;
}

/** Keyed by playerNameGroupKey (name + F/D). */
export type SheetXgRanks = Map<string, SheetXgRank>;

async function fetchTab(gid: string): Promise<SheetXgRanks> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`xG sheet request failed: ${res.status}`);
  const { data } = Papa.parse<Record<string, string>>(await res.text(), { header: true, skipEmptyLines: true });
  // Fail loudly on a renamed/reshuffled sheet rather than silently ranking
  // everyone as "missing" - the caller falls back to NST xG.
  if (!data[0] || !("i_xg_adjusted_60_rank" in data[0]) || !("oi_xg_adjusted_60_rank" in data[0])) {
    throw new Error("xG sheet is missing its xG rank columns");
  }
  const ranks: SheetXgRanks = new Map();
  for (const row of data) {
    const ixG = Number(row.i_xg_adjusted_60_rank);
    const oixG = Number(row.oi_xg_adjusted_60_rank);
    if (!row.skater || !Number.isFinite(ixG) || !Number.isFinite(oixG)) continue;
    // The sheet's position column is already "F"/"D".
    const key = playerNameGroupKey(toNstName(row.skater, row.position), [row.position]);
    if (!ranks.has(key)) ranks.set(key, { ixG, oixG });
  }
  return ranks;
}

export async function fetchSheetXgRanks(): Promise<{ season: SheetXgRanks; last5: SheetXgRanks }> {
  const [season, last5] = await Promise.all([fetchTab(TAB_GIDS.season), fetchTab(TAB_GIDS.last5)]);
  return { season, last5 };
}
