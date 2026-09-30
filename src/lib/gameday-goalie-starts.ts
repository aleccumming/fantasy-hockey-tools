// Server-only. Scrapes gamedaytweets.com/goalies for real NHL goalie-
// starter info - confirmed via beat-writer tweets when one's been posted,
// or the site's own projected "Our Guess" when it hasn't - as a second,
// largely independent signal alongside this app's own presumed-starter
// projection (Start Tracker's current-share leader, see
// goalie-tracking-service.ts).
//
// Fetched, not a random third-party scrape of someone else's work: the
// site is run by the same people behind the @GameDayGoalies Twitter/X
// account (its bio points here - "everything organized by team/player" -
// and its tweets are literally what this page organizes). robots.txt only
// disallows its own internal /tweets/mark_deleted endpoint, not this page.
//
// Confirmed-tweet text is raw, free-form prose from whichever beat writer
// posted it ("Silovs gets the start for Pittsburgh tonight...") - wildly
// inconsistent phrasing writer to writer, so this deliberately does NOT
// try to parse a specific goalie name out of it. A wrong guess here would
// be worse than no guess at all on a tool people make lineup calls from -
// it's surfaced as a raw quote + link back to the source tweet instead,
// for a human to read. The "Our Guess" fallback, by contrast, IS the
// site's own structured markup (`Our <i>Guess</i>: <strong>Name</strong>`)
// and is parsed reliably.
const BASE_URL = "https://www.gamedaytweets.com/goalies";

// Same handful of team-code exceptions this app has already needed to
// normalize twice before (Yahoo, NST) - defensive here too even though
// every code seen from this site's own logo filenames so far already
// matches our NHL_TEAMS codes directly (e.g. "lak", not "la").
const TEAM_CODE_FIXES: Record<string, string> = {
  LA: "LAK",
  TB: "TBL",
  SJ: "SJS",
  NJ: "NJD",
};

function normalizeTeamCode(code: string): string {
  const upper = code.toUpperCase();
  return TEAM_CODE_FIXES[upper] ?? upper;
}

export interface GameDayGoalieEntry {
  team: string;
  opponent: string;
  isHome: boolean;
  gameTimeEt: string | null;
  /** "tweet" = a real beat-writer post exists; "guess" = the site's own
   *  structured projection; "none" = nothing posted for this team yet. */
  source: "tweet" | "guess" | "none";
  /** Only for source "guess" - this IS reliably structured markup. */
  guessName?: string;
  guessNote?: string; // e.g. "(starter)" or "(back to back)"
  /** Only for source "tweet" - deliberately raw/unparsed, see file header. */
  tweetText?: string;
  tweetHandle?: string;
  tweetUrl?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

type TeamColumnInfo = Pick<
  GameDayGoalieEntry,
  "source" | "guessName" | "guessNote" | "tweetText" | "tweetHandle" | "tweetUrl"
>;

/** Parses one team's info column within a game block - either the site's
 *  own structured "Our Guess" markup, a confirmed tweet embed, or neither
 *  (nothing posted for this team yet). */
function parseTeamColumn(html: string): TeamColumnInfo {
  const guessMatch = html.match(/Our\s*<i>Guess<\/i>:\s*<strong>([^<]+)<\/strong>\s*(\([^)]*\))?/);
  if (guessMatch) {
    return {
      source: "guess",
      guessName: decodeEntities(guessMatch[1]),
      guessNote: guessMatch[2] ? decodeEntities(guessMatch[2]) : undefined,
    };
  }

  const tweetMatch = html.match(/<blockquote class="tweet">([\s\S]*?)<\/blockquote>/);
  if (tweetMatch) {
    const body = tweetMatch[1];
    const handleMatch = body.match(/class="handle"[^>]*>(@[^<]+)</);
    const urlMatch = body.match(/<a href="(https:\/\/x\.com\/[^"]+)"/);
    const pMatch = body.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const rawText = pMatch ? pMatch[1] : body;
    // The reporter's @handle link is the first thing inside <p> - strip it
    // out separately so it doesn't get concatenated into the message text.
    const withoutHandle = rawText.replace(/<a class="handle"[\s\S]*?<\/a>/, "");
    const text = stripTags(withoutHandle.replace(/<br\s*\/?>/g, " ")).trim();
    return {
      source: "tweet",
      tweetText: text,
      tweetHandle: handleMatch ? handleMatch[1] : undefined,
      tweetUrl: urlMatch ? urlMatch[1] : undefined,
    };
  }

  return { source: "none" };
}

const GAME_HEADER_MARKER = '<h1 class="text-3xl flex items-center justify-center mt-8 space-x-4">';
const TEAM_SEPARATOR_MARKER = '<div class="invisible"> @ </div>';

/** Parses the full /goalies page into one entry per team per game. Each
 *  game block in the page's markup is a fixed shape: an <h1> with the two
 *  team names/logos, a game-time line, then two side-by-side info columns
 *  (away, home) split by a fixed "invisible @" separator div - splitting
 *  on those two fixed markers (rather than trying to balance nested divs
 *  with regex) is what makes this reliable rather than fragile. */
function parseGoaliesPage(html: string): GameDayGoalieEntry[] {
  const entries: GameDayGoalieEntry[] = [];
  const chunks = html.split(GAME_HEADER_MARKER).slice(1); // [0] is nav/header junk before the first game

  for (const chunk of chunks) {
    const teamCodes = Array.from(chunk.matchAll(/logos\/([a-z]+)-/g))
      .slice(0, 2)
      .map((m) => normalizeTeamCode(m[1]));
    if (teamCodes.length < 2) continue; // unexpected shape - skip rather than guess
    const [awayCode, homeCode] = teamCodes;

    const timeMatch = chunk.match(/<div class="text-base text-gray-700 mb-8\s*">\s*([^<]+?)\s*<\/div>/);
    const gameTimeEt = timeMatch ? decodeEntities(timeMatch[1]) : null;

    const sepIndex = chunk.indexOf(TEAM_SEPARATOR_MARKER);
    if (sepIndex === -1) continue; // unexpected shape - skip rather than guess
    const awayCol = chunk.slice(0, sepIndex);
    const homeCol = chunk.slice(sepIndex);

    entries.push({ team: awayCode, opponent: homeCode, isHome: false, gameTimeEt, ...parseTeamColumn(awayCol) });
    entries.push({ team: homeCode, opponent: awayCode, isHome: true, gameTimeEt, ...parseTeamColumn(homeCol) });
  }

  return entries;
}

let cache: { data: GameDayGoalieEntry[]; expiresAt: number; dateKey: string } | null = null;
// Confirmations trickle in through the afternoon/evening of a game day, so
// this stays reasonably fresh rather than the 12-24h TTL other fairly
// static data in this app uses - but still cached, not fetched on every
// request, to be a reasonable citizen of a small site that isn't ours.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Goalie-starter info for every game on the given date (YYYY-MM-DD),
 *  one entry per team. */
export async function getGameDayGoalieStarts(date: string, forceRefresh = false): Promise<GameDayGoalieEntry[]> {
  if (!forceRefresh && cache && cache.dateKey === date && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const res = await fetch(`${BASE_URL}?date=${date}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FantasyHockeyToolsBot/1.0)" },
    next: { revalidate: 30 * 60 },
  });
  if (!res.ok) throw new Error(`GameDayGoalies request failed: ${res.status}`);
  const html = await res.text();
  const data = parseGoaliesPage(html);

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS, dateKey: date };
  return data;
}
