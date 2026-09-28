// Stand-in for a real Yahoo Fantasy roster until league rosters/settings
// are actually wired up (blocked on Yahoo's Fantasy Sports API access,
// expected ~Sept 24 2026 - see ROADMAP.md). 18 rostered skaters with real
// Yahoo position eligibility. There's no fixed "active vs. reserve" split
// here on purpose - lineups in a daily league can be reshuffled every day
// (someone benched Monday might start Tuesday and vice versa), so all 18
// genuinely compete for the roster's active slots (3C/3LW/3RW/4D/1 Util)
// each day - which 14 actually start is whatever the day's matching works
// out, not a fixed subset. UTIL isn't listed per-player: it's universal
// for every skater in this league, not an explicit flag.
//
// Team is hardcoded here rather than looked up from the live stats pool on
// purpose - a rostered player still occupies their slot and their team
// still has a schedule even on a day they're missing from the last-5-games
// pool (hurt, scratched, a callup with too small a sample yet). Roster
// membership shouldn't flicker based on that.
import type { SkaterPosition } from "./types";

export interface SampleRosterPlayer {
  name: string;
  team: string;
  positions: SkaterPosition[];
  /** Always false/absent here - the manual/sample roster doesn't model
   *  goalies or IR status yet. Present so this type stays structurally
   *  compatible with YahooRosterPlayer wherever both are used
   *  interchangeably. */
  isGoalie?: boolean;
  isOnIR?: boolean;
}

export const SAMPLE_ROSTER: SampleRosterPlayer[] = [
  { name: "Sebastian Aho", team: "CAR", positions: ["C"] },
  { name: "Bo Horvat", team: "NYI", positions: ["C"] },
  { name: "Evgeni Malkin", team: "PIT", positions: ["C", "LW", "RW"] },
  { name: "Dylan Guenther", team: "UTA", positions: ["LW", "RW"] },
  { name: "Dylan Holloway", team: "STL", positions: ["C", "LW"] },
  { name: "Matthew Tkachuk", team: "FLA", positions: ["LW", "RW"] },
  { name: "Ryan Hartman", team: "MIN", positions: ["C", "RW"] },
  { name: "Nikita Kucherov", team: "TBL", positions: ["RW"] },
  { name: "Alex Laferriere", team: "LAK", positions: ["C", "LW", "RW"] },
  { name: "Noah Dobson", team: "MTL", positions: ["D"] },
  { name: "Victor Hedman", team: "TBL", positions: ["D"] },
  { name: "Charlie McAvoy", team: "BOS", positions: ["D"] },
  { name: "Brandon Montour", team: "SEA", positions: ["D"] },
  { name: "Ivar Stenberg", team: "SJS", positions: ["LW"] },
  { name: "Filip Chytil", team: "VAN", positions: ["C"] },
  { name: "Frank Nazar", team: "CHI", positions: ["C"] },
  { name: "Jake DeBrusk", team: "VAN", positions: ["LW", "RW"] },
  { name: "Anthony Mantha", team: "NJD", positions: ["LW", "RW"] },
];

export const SAMPLE_ROSTER_NAMES: string[] = SAMPLE_ROSTER.map((p) => p.name);
