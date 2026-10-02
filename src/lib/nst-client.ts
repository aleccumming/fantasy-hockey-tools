// Server-only client for Natural Stat Trick's bot-access API
// (data.naturalstattrick.com). Unlike a normal API it returns full HTML
// pages mirroring the main site's stat tables, not JSON/CSV - so responses
// are parsed by hand below using the tables' fixed, known column order.
// Requires NST_API_KEY (see .env.example). Never call this from client code
// - the key must stay server-side.

import type { SkaterPosition } from "./types";
import { getCurrentNhlSeasonId } from "./nhl-standings";

const NST_BASE = "https://data.naturalstattrick.com/playerteams.php";

// NST spells out three-word team names with a period instead of the
// standard 3-letter codes the rest of this app uses.
const NST_TEAM_TO_APP_TEAM: Record<string, string> = {
  "L.A": "LAK",
  "N.J": "NJD",
  "S.J": "SJS",
  "T.B": "TBL",
};

function normalizeTeam(nstTeam: string): string {
  // A player traded mid-window lists every team played for ("CHI, MIN") -
  // NST orders these chronologically, so the last one is the current team.
  const last = nstTeam.split(",").pop()?.trim() ?? nstTeam;
  return NST_TEAM_TO_APP_TEAM[last] ?? last;
}

const NST_POSITION_TO_APP_POSITION: Record<string, SkaterPosition> = {
  C: "C",
  L: "LW",
  R: "RW",
  D: "D",
};

interface NstRowBase {
  name: string;
  team: string;
  position: SkaterPosition;
  gp: number;
  toi: number; // total minutes over the queried window, not per-game
}

export interface NstIndividualRow extends NstRowBase {
  goals: number;
  assists: number;
  ipp: number;
  shots: number;
  shPct: number;
  ixg: number;
  icf: number;
  iscf: number;
  // "Bangers" category totals (categories-league scoring, not points-league
  // value) - real totals over the queried window, same as goals/assists.
  // Column positions confirmed live against NST's actual response, not
  // guessed: 21=PIM, 29=Hits, 31=Shots Blocked (individually verified
  // <th>-by-<th> against real values - e.g. Tom Wilson's 233 hits/81 GP -
  // an earlier grouped-header reading was off by one column).
  pim: number;
  hits: number;
  blocks: number;
}

export interface NstOnIceRow extends NstRowBase {
  cf: number;
  scf: number;
  xgf: number;
  onIceShPct: number;
}

export interface NstQueryOptions {
  fromSeason: string;
  thruSeason: string;
  gameRange: { type: "none" } | { type: "teamGames"; games: number };
  /** Game situation to filter to. Defaults to "5v5" if omitted. "pp" is
   *  power-play ice time specifically - used for the Deployment tool's PP
   *  TOI signal (verified live: real, sane PP1 numbers come back, e.g.
   *  Kucherov ~4.3 min/gm - same 35-column layout as "5v5"/"all", just
   *  filtered to power-play situations). */
  situation?: "5v5" | "all" | "pp";
}

/** Calendar-only guess, e.g. "20252026" for a reference date in the season
 *  that begins Oct 2025 - used only as a last-resort fallback if the live
 *  lookup below fails, or when a caller explicitly passes a referenceDate
 *  to ask about a specific date rather than "right now" (the live signal
 *  only knows "now", so an explicit date always uses this instead). A fixed
 *  "season starts in October" cutoff is a guess, not a fact - see
 *  currentNstSeason's own comment for why that guess actually failed. */
function calendarSeasonGuess(referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth(); // 0-indexed; 9 = October
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}${startYear + 1}`;
}

/** NHL season code NST expects, e.g. "20252026" for the season that begins
 *  Oct 2025. Pulled from the NHL's own live standings endpoint
 *  (getCurrentNhlSeasonId in nhl-standings.ts), which is authoritative and
 *  self-correcting - no hardcoded month boundary to go stale. This used to
 *  guess "the season starts in October, so treat Jul-Sept as last season"
 *  - wrong the one year the regular season actually opened in late
 *  September: real games were being played under the new season while
 *  every "current season" query here (skater stats, goalie team/start
 *  tracking) silently kept reading last season's data, including for
 *  players who'd since been traded (their team showed wherever they
 *  played LAST year). Falls back to the calendar guess only if the live
 *  lookup itself fails (network error) - a guess is better than nothing,
 *  but it's no longer the primary path. */
export async function currentNstSeason(referenceDate?: Date): Promise<string> {
  if (referenceDate) return calendarSeasonGuess(referenceDate);
  try {
    return await getCurrentNhlSeasonId();
  } catch {
    return calendarSeasonGuess(new Date());
  }
}

/** Subtracts one season from a season code, e.g. "20262027" -> "20252026" -
 *  used for the "Last Season" window (the season before whatever
 *  currentNstSeason() says is current). */
export function previousNstSeason(seasonCode: string): string {
  const startYear = Number(seasonCode.slice(0, 4)) - 1;
  return `${startYear}${startYear + 1}`;
}

/** The pure arithmetic behind a 3-season baseline range (2 prior seasons +
 *  the given one), split out from baselineSeasonRange so a caller that
 *  already has a specific season code - not "right now" - can build the
 *  same kind of baseline without a live lookup. Used for the "Last Season"
 *  window's own baseline, which needs to end at the season BEFORE last
 *  season (not last season itself) so it isn't compared against itself. */
export function seasonRangeSpanning(thruSeason: string): { fromSeason: string; thruSeason: string } {
  const thruStartYear = Number(thruSeason.slice(0, 4));
  const fromStartYear = thruStartYear - 2;
  return { fromSeason: `${fromStartYear}${fromStartYear + 1}`, thruSeason };
}

/** A multi-season window ending at the current season, used as a "career"
 *  baseline for the luck/regression columns - not a true full-career figure,
 *  but rookies and short-tenured players still get a meaningful baseline
 *  since NST simply aggregates whatever games exist in the range. */
export async function baselineSeasonRange(referenceDate?: Date): Promise<{
  fromSeason: string;
  thruSeason: string;
}> {
  const thruSeason = await currentNstSeason(referenceDate);
  return seasonRangeSpanning(thruSeason);
}

function situationParam(situation: NstQueryOptions["situation"]): string {
  if (situation === "all") return "all";
  if (situation === "pp") return "pp";
  return "5v5";
}

function buildUrl(stdoi: "std" | "oi", opts: NstQueryOptions): string {
  const key = process.env.NST_API_KEY;
  if (!key) throw new Error("NST_API_KEY is not set");
  const params = new URLSearchParams({
    fromseason: opts.fromSeason,
    thruseason: opts.thruSeason,
    stype: "2", // regular season
    sit: situationParam(opts.situation),
    score: "all",
    stdoi,
    rate: "n", // raw totals over the window - per-60 rates computed from TOI below
    team: "ALL",
    pos: "S", // skaters only
    loc: "B", // both home and away
    toi: "0",
    gpfilt: opts.gameRange.type === "teamGames" ? "gpteam" : "none",
    fd: "",
    td: "",
    tgp: opts.gameRange.type === "teamGames" ? String(opts.gameRange.games) : "410",
    lines: "single",
    draftteam: "ALL",
    key,
  });
  return `${NST_BASE}?${params.toString()}`;
}

function parseRows(html: string): string[][] {
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];
  const rowsHtml = tbodyMatch[1].match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  return rowsHtml.map((row) => {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
    return cells.map((cell) =>
      cell
        .replace(/^<td[^>]*>/, "")
        .replace(/<\/td>$/, "")
        .replace(/<[^>]+>/g, "") // strip the player-name <a> link, etc.
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  });
}

async function fetchNst(stdoi: "std" | "oi", opts: NstQueryOptions): Promise<string[][]> {
  const res = await fetch(buildUrl(stdoi, opts), { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Natural Stat Trick request failed: ${res.status}`);
  return parseRows(await res.text());
}

// Column indices below are positional, matching NST's fixed table layout
// (index 0 is the row-number column, which we skip).
function parseIndividualRow(cells: string[]): NstIndividualRow | null {
  if (cells.length < 32 || !cells[1]) return null;
  return {
    name: cells[1],
    team: normalizeTeam(cells[2]),
    position: NST_POSITION_TO_APP_POSITION[cells[3]] ?? "C",
    gp: Number(cells[4]) || 0,
    toi: Number(cells[5]) || 0,
    goals: Number(cells[6]) || 0,
    assists: Number(cells[7]) || 0,
    ipp: Number(cells[11]) || 0,
    shots: Number(cells[12]) || 0,
    shPct: Number(cells[13]) || 0,
    ixg: Number(cells[14]) || 0,
    icf: Number(cells[15]) || 0,
    iscf: Number(cells[17]) || 0,
    pim: Number(cells[21]) || 0,
    hits: Number(cells[29]) || 0,
    blocks: Number(cells[31]) || 0,
  };
}

function parseOnIceRow(cells: string[]): NstOnIceRow | null {
  if (cells.length < 43 || !cells[1]) return null;
  return {
    name: cells[1],
    team: normalizeTeam(cells[2]),
    position: NST_POSITION_TO_APP_POSITION[cells[3]] ?? "C",
    gp: Number(cells[4]) || 0,
    toi: Number(cells[5]) || 0,
    cf: Number(cells[6]) || 0,
    scf: Number(cells[21]) || 0,
    xgf: Number(cells[18]) || 0,
    onIceShPct: Number(cells[42]) || 0,
  };
}

export async function fetchIndividualStats(opts: NstQueryOptions): Promise<NstIndividualRow[]> {
  const rows = await fetchNst("std", opts);
  return rows.map(parseIndividualRow).filter((r): r is NstIndividualRow => r !== null);
}

export async function fetchOnIceStats(opts: NstQueryOptions): Promise<NstOnIceRow[]> {
  const rows = await fetchNst("oi", opts);
  return rows.map(parseOnIceRow).filter((r): r is NstOnIceRow => r !== null);
}

export interface NstGoalieRow {
  name: string;
  team: string;
  gp: number;
  toi: number; // total minutes over the queried window, not per-game
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  savePct: number;
  gaa: number;
  gsaa: number; // goals saved above average
}

function buildGoalieUrl(opts: NstQueryOptions): string {
  const key = process.env.NST_API_KEY;
  if (!key) throw new Error("NST_API_KEY is not set");
  const params = new URLSearchParams({
    fromseason: opts.fromSeason,
    thruseason: opts.thruSeason,
    stype: "2",
    sit: situationParam(opts.situation),
    score: "all",
    stdoi: "g",
    rate: "n",
    team: "ALL",
    pos: "G",
    loc: "B",
    toi: "0",
    gpfilt: opts.gameRange.type === "teamGames" ? "gpteam" : "none",
    fd: "",
    td: "",
    tgp: opts.gameRange.type === "teamGames" ? String(opts.gameRange.games) : "410",
    lines: "single",
    draftteam: "ALL",
    key,
  });
  return `${NST_BASE}?${params.toString()}`;
}

// Column indices are positional, matching NST's goalie report layout
// (index 0 is the row-number column, which we skip). Only the columns this
// app actually uses are parsed - the report also has high/medium/low-danger
// splits further along that aren't needed yet.
function parseGoalieRow(cells: string[]): NstGoalieRow | null {
  if (cells.length < 11 || !cells[1]) return null;
  return {
    name: cells[1],
    team: normalizeTeam(cells[2]),
    gp: Number(cells[3]) || 0,
    toi: Number(cells[4]) || 0,
    shotsAgainst: Number(cells[5]) || 0,
    saves: Number(cells[6]) || 0,
    goalsAgainst: Number(cells[7]) || 0,
    savePct: Number(cells[8]) || 0,
    gaa: Number(cells[9]) || 0,
    gsaa: Number(cells[10]) || 0,
  };
}

export async function fetchGoalieStats(opts: NstQueryOptions): Promise<NstGoalieRow[]> {
  const res = await fetch(buildGoalieUrl(opts), { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Natural Stat Trick request failed: ${res.status}`);
  const rows = parseRows(await res.text());
  return rows.map(parseGoalieRow).filter((r): r is NstGoalieRow => r !== null);
}
