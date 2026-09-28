// Server-only. Calls Yahoo's actual Fantasy Sports API using a user's
// stored connection (src/db/schema.ts's yahooConnections), refreshing the
// access token first if it's expired or close to it. Every shape below was
// verified against real responses from a real account before being coded
// here (see ROADMAP.md) - Yahoo's JSON is unusually irregular (arrays of
// single-key objects, numeric string keys used as array indices), so
// nothing here is guessed.
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { yahooConnections, yahooPlayerEligibilityCache } from "@/db/schema";
import { refreshYahooToken } from "./yahoo-oauth";
import type { RosterSlotConfig } from "./roster-fit";
import type { SkaterPosition } from "./types";

const API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";
// A token close to expiry might expire mid-request; refresh a bit early.
const REFRESH_SKEW_MS = 60 * 1000;

export class YahooNotConnectedError extends Error {
  constructor() {
    super("Yahoo account not connected");
    this.name = "YahooNotConnectedError";
  }
}

/** This user's current access token, refreshing it first if needed and
 *  persisting the refreshed tokens. Throws YahooNotConnectedError if the
 *  user has never connected Yahoo. */
export async function getValidYahooAccessToken(userId: string): Promise<string> {
  const [row] = await db.select().from(yahooConnections).where(eq(yahooConnections.userId, userId));
  if (!row) throw new YahooNotConnectedError();

  if (row.expiresAt.getTime() - REFRESH_SKEW_MS > Date.now()) {
    return row.accessToken;
  }

  const tokens = await refreshYahooToken(row.refreshToken);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db
    .update(yahooConnections)
    .set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt, updatedAt: new Date() })
    .where(eq(yahooConnections.userId, userId));

  return tokens.access_token;
}

async function yahooGet(path: string, accessToken: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}${path.includes("?") ? "&" : "?"}format=json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Fantasy data changes frequently enough (waivers, lineups) that a
    // stale Next.js fetch cache would be actively misleading here.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo API request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Yahoo's JSON represents a "collection" (games, leagues, teams, players)
// as an object keyed by "0", "1", ..., plus a "count" field - not a plain
// array. This pulls just the numbered entries out, in order.
function collectionValues<T>(collection: Record<string, T> | undefined): T[] {
  if (!collection) return [];
  return Object.entries(collection)
    .filter(([key]) => key !== "count")
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, value]) => value);
}

// A Yahoo "resource" (a player, a team, a league) is an array mixing plain
// objects and nested arrays, each holding one or two fields - flattening it
// into a single object is far easier to read from than the raw shape.
function flattenResource(resource: unknown): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const items = Array.isArray(resource) ? resource : [resource];
  for (const item of items) {
    if (Array.isArray(item)) {
      Object.assign(flat, flattenResource(item));
    } else if (item && typeof item === "object") {
      Object.assign(flat, item);
    }
  }
  return flat;
}

export interface YahooLeague {
  leagueKey: string;
  name: string;
  numTeams: number;
  season: string;
  currentWeek: number;
}

/** The user's own NHL fantasy leagues for the current season (Yahoo's
 *  "nhl" game shorthand always resolves to whichever NHL season is
 *  currently active/most recent - confirmed live, not documented
 *  explicitly by Yahoo). */
export async function getUserLeagues(accessToken: string): Promise<YahooLeague[]> {
  const json = await yahooGet("/users;use_login=1/games;game_keys=nhl/leagues", accessToken);
  const users = collectionValues(
    (json as { fantasy_content?: { users?: Record<string, unknown> } }).fantasy_content?.users
  );
  const leagues: YahooLeague[] = [];
  for (const user of users) {
    const userParts = (user as { user: unknown[] }).user;
    const gamesPart = userParts.find(
      (p): p is { games: Record<string, unknown> } => !!p && typeof p === "object" && "games" in p
    );
    const games = collectionValues(gamesPart?.games as Record<string, unknown> | undefined);
    for (const game of games) {
      const gameArr = (game as { game: unknown[] }).game;
      const leaguesPart = gameArr.find(
        (p): p is { leagues: Record<string, unknown> } => !!p && typeof p === "object" && "leagues" in p
      );
      const leagueResources = collectionValues(leaguesPart?.leagues as Record<string, unknown> | undefined);
      for (const lr of leagueResources) {
        const flat = flattenResource((lr as { league: unknown }).league);
        leagues.push({
          leagueKey: String(flat.league_key),
          name: String(flat.name),
          numTeams: Number(flat.num_teams),
          season: String(flat.season),
          currentWeek: Number(flat.current_week),
        });
      }
    }
  }
  return leagues;
}

// Yahoo's roster-position codes only partly match this app's own
// (SkaterPosition | "UTIL"). "Util" -> "UTIL" for casing; goalie slots
// (position_type "G") and non-starting reserve slots (BN, IR+) aren't part
// of the active-skater-slot matching in roster-fit.ts, so they're dropped.
const SKATER_POSITIONS = new Set<string>(["C", "LW", "RW", "D"]);

// Yahoo's editorial_team_abbr shortens exactly the same 4 teams NST does
// (confirmed live: "LA", "TB", "SJ", "NJ" appear in real roster/free-agent
// data) - normalized to this app's own NHL_TEAMS codes (schedule.ts) so
// roster-fit's gameDatesByTeam lookups actually match instead of silently
// missing that team's schedule.
const YAHOO_TEAM_TO_APP_TEAM: Record<string, string> = {
  LA: "LAK",
  TB: "TBL",
  SJ: "SJS",
  NJ: "NJD",
};

function normalizeYahooTeam(team: string): string {
  return YAHOO_TEAM_TO_APP_TEAM[team] ?? team;
}

const rosterSlotsCache = new Map<string, { data: RosterSlotConfig; expiresAt: number }>();
const ROSTER_SLOTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours - league settings rarely change mid-season

/** This league's active roster slot counts, shaped for roster-fit.ts -
 *  replaces the hardcoded SAMPLE_ROSTER_SLOTS guess. */
export async function getLeagueRosterSlots(leagueKey: string, accessToken: string): Promise<RosterSlotConfig> {
  const cached = rosterSlotsCache.get(leagueKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const json = await yahooGet(`/league/${leagueKey}/settings`, accessToken);
  const leagueArr = (json as { fantasy_content: { league: unknown[] } }).fantasy_content.league;
  const settingsResource = leagueArr[1] as { settings: unknown[] };
  const settings = flattenResource(settingsResource.settings[0]);
  const rosterPositions = settings.roster_positions as { roster_position: Record<string, unknown> }[];

  const slots: RosterSlotConfig = { C: 0, LW: 0, RW: 0, D: 0, UTIL: 0 };
  for (const { roster_position: rp } of rosterPositions) {
    if (rp.is_starting_position !== 1) continue;
    const position = rp.position === "Util" ? "UTIL" : (rp.position as string);
    if (position in slots) slots[position as keyof RosterSlotConfig] = Number(rp.count);
  }
  rosterSlotsCache.set(leagueKey, { data: slots, expiresAt: Date.now() + ROSTER_SLOTS_CACHE_TTL_MS });
  return slots;
}

const rosterCapacityCache = new Map<string, { data: number; expiresAt: number }>();

/** This league's total roster size cap - the sum of every roster_position's
 *  count EXCEPT IR/IR+ (Yahoo's convention: an IR+ slot is bonus capacity
 *  that doesn't count against your roster max, which is the whole point of
 *  it - it's how you can add a streamer without dropping anyone once
 *  you've moved an injured player there). Includes BN and G alongside the
 *  active skater slots, since they all draw from the same shared cap. */
export async function getLeagueRosterCapacity(leagueKey: string, accessToken: string): Promise<number> {
  const cached = rosterCapacityCache.get(leagueKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const json = await yahooGet(`/league/${leagueKey}/settings`, accessToken);
  const leagueArr = (json as { fantasy_content: { league: unknown[] } }).fantasy_content.league;
  const settingsResource = leagueArr[1] as { settings: unknown[] };
  const settings = flattenResource(settingsResource.settings[0]);
  const rosterPositions = settings.roster_positions as { roster_position: Record<string, unknown> }[];

  const capacity = rosterPositions.reduce((sum, { roster_position: rp }) => {
    const position = String(rp.position);
    return position.startsWith("IR") ? sum : sum + Number(rp.count);
  }, 0);

  rosterCapacityCache.set(leagueKey, { data: capacity, expiresAt: Date.now() + ROSTER_SLOTS_CACHE_TTL_MS });
  return capacity;
}

export interface YahooRosterPlayer {
  name: string;
  team: string;
  /** Real position eligibility only - UTIL/goalie are excluded, matching
   *  RosterFitPlayer's convention in roster-fit.ts. */
  positions: SkaterPosition[];
  isGoalie: boolean;
  /** True when this player currently sits in an IR/IR+ slot - they don't
   *  count against the league's roster cap while there (see
   *  getLeagueRosterCapacity), so dropping them doesn't free real roster
   *  space, and having one there might already mean you have room to add
   *  without dropping anyone at all. */
  isOnIR: boolean;
  /** Yahoo's own small player-thumbnail image (already tightly cropped to
   *  the face, unlike the NHL's raw mugshots this app otherwise uses - see
   *  player-headshot.tsx) - absent only if Yahoo's response itself omitted
   *  it, which hasn't been observed in practice. */
  headshotUrl?: string;
}

/** Which team_key in this league belongs to the connected user - found via
 *  the is_owned_by_current_login flag Yahoo returns per team. */
export async function getMyTeamKey(leagueKey: string, accessToken: string): Promise<string> {
  const json = await yahooGet(`/league/${leagueKey}/teams`, accessToken);
  const leagueArr = (json as { fantasy_content: { league: unknown[] } }).fantasy_content.league;
  const teamsResource = leagueArr[1] as { teams: Record<string, unknown> };
  const teams = collectionValues(teamsResource.teams);
  for (const t of teams) {
    const flat = flattenResource((t as { team: unknown }).team);
    if (flat.is_owned_by_current_login === 1) return String(flat.team_key);
  }
  throw new Error(`No team owned by the connected user was found in league ${leagueKey}`);
}

function parsePlayerResource(flat: Record<string, unknown>): YahooRosterPlayer {
  const eligible = (flat.eligible_positions as { position: string }[]) ?? [];
  // Only present on a roster fetch (not on the free-agent list, since an
  // unrostered player has no current slot) - flattened the same way as any
  // other nested Yahoo resource.
  const selectedPosition = flat.selected_position
    ? (flattenResource(flat.selected_position).position as string | undefined)
    : undefined;
  // image_url is a plain string field; headshot is the same picture nested
  // as {url, size} - either can be present depending on the resource.
  const headshotUrl = (flat.image_url as string | undefined) ?? (flat.headshot as { url?: string } | undefined)?.url;
  return {
    name: String((flat.name as { full: string }).full),
    team: normalizeYahooTeam(String(flat.editorial_team_abbr)),
    positions: eligible.map((p) => p.position).filter((p): p is SkaterPosition => SKATER_POSITIONS.has(p)),
    isGoalie: eligible.some((p) => p.position === "G"),
    isOnIR: Boolean(selectedPosition?.startsWith("IR")),
    headshotUrl,
  };
}

/** The connected user's full roster in this league (active + bench + IR
 *  all together - matches this app's existing "no fixed active/reserve
 *  split, the matching decides who starts each day" model). Includes
 *  goalies (isGoalie: true, positions: []) so they're selectable as a drop
 *  candidate - callers doing skater roster-fit math should filter them out
 *  first, since an empty positions array would otherwise look eligible for
 *  the universal UTIL slot. */
export async function getMyRoster(teamKey: string, accessToken: string): Promise<YahooRosterPlayer[]> {
  const json = await yahooGet(`/team/${teamKey}/roster`, accessToken);
  const teamArr = (json as { fantasy_content: { team: unknown[] } }).fantasy_content.team;
  const rosterResource = teamArr[1] as { roster: { "0": { players: Record<string, unknown> } } };
  const players = collectionValues(rosterResource.roster["0"].players);
  return players
    .map((p) => parsePlayerResource(flattenResource((p as { player: unknown }).player)))
    .filter((p) => p.isGoalie || p.positions.length > 0);
}

export interface YahooFreeAgent {
  name: string;
  team: string;
  positions: SkaterPosition[];
}

const FREE_AGENTS_PAGE_SIZE = 25;
const FREE_AGENTS_MAX_PAGES = 20; // hard ceiling (500 players) so a bug can't loop forever
const freeAgentsCache = new Map<string, { data: YahooFreeAgent[]; expiresAt: number }>();
const FREE_AGENTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes - up to 20 sequential requests, worth not repeating

/** Every available (non-rostered) skater in this league, paginated 25 at a
 *  time (Yahoo's collection max per request). */
export async function getFreeAgents(leagueKey: string, accessToken: string): Promise<YahooFreeAgent[]> {
  const cached = freeAgentsCache.get(leagueKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const freeAgents: YahooFreeAgent[] = [];
  for (let page = 0; page < FREE_AGENTS_MAX_PAGES; page++) {
    const start = page * FREE_AGENTS_PAGE_SIZE;
    const json = await yahooGet(
      `/league/${leagueKey}/players;status=A;sort=OR;start=${start};count=${FREE_AGENTS_PAGE_SIZE}`,
      accessToken
    );
    const leagueArr = (json as { fantasy_content: { league: unknown[] } }).fantasy_content.league;
    const playersResource = leagueArr[1] as { players: Record<string, unknown> };
    const players = collectionValues(playersResource.players);
    if (players.length === 0) break;

    for (const p of players) {
      const parsed = parsePlayerResource(flattenResource((p as { player: unknown }).player));
      if (!parsed.isGoalie && parsed.positions.length > 0) freeAgents.push(parsed);
    }
    if (players.length < FREE_AGENTS_PAGE_SIZE) break;
  }
  freeAgentsCache.set(leagueKey, { data: freeAgents, expiresAt: Date.now() + FREE_AGENTS_CACHE_TTL_MS });
  return freeAgents;
}

export interface YahooPlayerEligibility {
  name: string;
  team: string;
  positions: SkaterPosition[];
  isGoalie: boolean;
  headshotUrl?: string;
}

const PLAYER_UNIVERSE_PAGE_SIZE = 25;
const PLAYER_UNIVERSE_MAX_PAGES = 80; // hard ceiling (2000 players) - real NHL universe is smaller
let playerEligibilityCache: { data: YahooPlayerEligibility[]; expiresAt: number } | null = null;
// Long TTL - this is real position eligibility for every NHL player, not
// tied to any one league or roster, and it barely changes day to day.
const PLAYER_UNIVERSE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const PLAYER_ELIGIBILITY_CACHE_ID = "nhl";

/** Every NHL player's real Yahoo position eligibility, independent of any
 *  specific league - confirmed live that "/game/nhl/players" (unlike
 *  "/league/{key}/players") isn't scoped to one league's roster/free-agent
 *  pool at all, so this is the actual fix for the wider app only ever
 *  showing a single primary position (NST, this app's other stat source,
 *  has no concept of fantasy multi-position eligibility - it only ever
 *  reports one position per player).
 *
 *  Deliberately NOT tied to any particular page request or user's live
 *  Yahoo connection - the site shouldn't need SOMEONE to be actively
 *  connected, or make anyone wait ~8s, just to show correct positions.
 *  A daily cron job (src/app/api/cron/refresh-player-eligibility/route.ts)
 *  keeps the DB row (yahooPlayerEligibilityCache) fresh in the background
 *  using whichever connection is available; every page request just reads
 *  that row - see getCachedPlayerEligibility below. This function is the
 *  one that actually talks to Yahoo and writes the cache; only the cron
 *  route (and this file's own local dev/verification scripts) should call
 *  it directly. */
export async function refreshPlayerEligibilityCache(accessToken: string): Promise<YahooPlayerEligibility[]> {
  const players: YahooPlayerEligibility[] = [];
  for (let page = 0; page < PLAYER_UNIVERSE_MAX_PAGES; page++) {
    const start = page * PLAYER_UNIVERSE_PAGE_SIZE;
    const json = await yahooGet(`/game/nhl/players;start=${start};count=${PLAYER_UNIVERSE_PAGE_SIZE}`, accessToken);
    const gameArr = (json as { fantasy_content: { game: unknown[] } }).fantasy_content.game;
    const playersResource = gameArr[1] as { players: Record<string, unknown> };
    const pagePlayers = collectionValues(playersResource.players);
    if (pagePlayers.length === 0) break;

    for (const p of pagePlayers) {
      players.push(parsePlayerResource(flattenResource((p as { player: unknown }).player)));
    }
    if (pagePlayers.length < PLAYER_UNIVERSE_PAGE_SIZE) break;
  }

  const updatedAt = new Date();
  await db
    .insert(yahooPlayerEligibilityCache)
    .values({ id: PLAYER_ELIGIBILITY_CACHE_ID, data: players, updatedAt })
    .onConflictDoUpdate({
      target: yahooPlayerEligibilityCache.id,
      set: { data: players, updatedAt },
    });

  playerEligibilityCache = { data: players, expiresAt: Date.now() + PLAYER_UNIVERSE_CACHE_TTL_MS };
  return players;
}

/** What every page request actually calls: a plain DB read, no Yahoo call
 *  and no dependency on the requesting user's own Yahoo connection. Returns
 *  null only if the cache has genuinely never been seeded yet (e.g. right
 *  after this table was first created, before the cron job's first run). */
export async function getCachedPlayerEligibility(): Promise<YahooPlayerEligibility[] | null> {
  if (playerEligibilityCache) return playerEligibilityCache.data;

  const [dbRow] = await db
    .select()
    .from(yahooPlayerEligibilityCache)
    .where(eq(yahooPlayerEligibilityCache.id, PLAYER_ELIGIBILITY_CACHE_ID));
  if (!dbRow) return null;

  const data = dbRow.data as YahooPlayerEligibility[];
  playerEligibilityCache = { data, expiresAt: Date.now() + PLAYER_UNIVERSE_CACHE_TTL_MS };
  return data;
}

/** Any one stored Yahoo connection's valid access token, for background
 *  jobs (the cron refresh) that need to call Yahoo but aren't acting on
 *  behalf of a specific signed-in request - this data is global game data,
 *  not user-specific, so it doesn't matter whose connection is used. Picks
 *  whichever was updated most recently. Returns null if no one has ever
 *  connected Yahoo at all (the cache just can't be refreshed until then -
 *  same real-world constraint as everywhere else in this app that needs a
 *  Yahoo token). */
export async function getAnyValidYahooAccessToken(): Promise<string | null> {
  const [row] = await db.select().from(yahooConnections).orderBy(desc(yahooConnections.updatedAt)).limit(1);
  if (!row) return null;
  return getValidYahooAccessToken(row.userId);
}
