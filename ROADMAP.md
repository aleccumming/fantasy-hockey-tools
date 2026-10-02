# Roadmap

Ideas and planned features for Fantasy Hockey Tools, in no particular order.
Check items off (or just delete them) as they land - this is a scratchpad, not
a formal backlog.

## Players (Skaters)

Streamer Suggestions was merged into the Player Evaluator page (now just
"Players" at `/players`) on Sept 18 2026 - they were doing largely the same
job (rank skaters by C-Score) through two separate pages and two separate
backend services. Now one page: Rankings (with an All Players/Unowned
toggle) + Compare + a Drop & Replace flow. Renamed to "Skaters" at
`/skaters` on 2026-09-30 - it's skater-only (Goalies has its own page/nav
item), and "Players" read as if it covered both. `/players` and the old
`/streamers` both still redirect there.

- [x] Yahoo Fantasy Sports API access is LIVE as of 2026-09-27. Confirmed
      via a real data call (`/fantasy/v2/users;use_login=1/games`)
      returning 200 with the user's real Yahoo game history, after several
      days of 403s despite a signed agreement effective 9/24/2026 - the
      missing piece turned out to be the separate "Confirm Your Yahoo
      Fantasy Sports API Application" form at
      sports.yahoo.com/developer/application-confirmation/ (name + email +
      Client ID), which links the signed agreement to the specific app.
      OAuth connect flow (`/api/yahoo/connect`, `/api/yahoo/callback`,
      `src/lib/yahoo-oauth.ts`) was already built and now works end-to-end.
- [x] Real Yahoo league rosters/free-agents integration is built and
      verified against a real account (2 real leagues, real 18/19-player
      rosters, real 350+ free agents with pagination, real per-league
      roster slot settings that genuinely differ between leagues). See
      `src/lib/yahoo-fantasy-client.ts` (all parsing shapes verified
      live, not guessed - Yahoo's JSON is oddly irregular), the
      `/api/yahoo/leagues|roster|free-agents` routes, and the League
      Switcher in `yahoo-connect-status.tsx` (shown on `/skaters`,
      auto-picks when there's only one league). `activeLeagueKey` lives on
      `yahooConnections` in the DB, pushed to dev. Caught and fixed a real
      bug during verification: Yahoo shortens 4 team codes (LA/TB/SJ/NJ)
      differently than this app's own NHL_TEAMS - same 4 exceptions NST
      already needed normalizing, now handled in `normalizeYahooTeam`.
      The manual roster editor (`use-my-roster.ts`, `roster-editor.tsx`)
      stays as the fallback when no Yahoo league is connected/active.
      NOT YET tested through a real browser session (only the underlying
      Yahoo-calling functions were verified directly) - the actual
      `/api/yahoo/leagues` etc. routes still need a real end-to-end
      browser test once this is deployed.
- Note: a Google-Sheets-scraping stand-in for the free-agent pool was built
      and then fully reverted the same day once Yahoo access came through -
      no trace of it should remain (`free-agent-sheet.ts`, `use-free-agents.ts`,
      `/api/free-agents` are gone; don't rebuild this path).
- [x] Fixed a real bug: Rankings/Compare only ever showed a player's single
      primary position, since NST (this app's stat source) has no concept
      of fantasy multi-position eligibility - it only reports one position
      per player. Fixed by fetching Yahoo's `/game/nhl/players` (confirmed
      live: NOT league-scoped, unlike `/league/{key}/players` - it's every
      NHL player Yahoo tracks, independent of any specific league or
      roster) and overriding team+positions before the forward/defense
      split happens (not just the display label - a real multi-position
      player could otherwise land in the wrong group entirely). Verified
      live: 1589 total players, 231 genuinely multi-position skaters (e.g.
      Draisaitl C/LW, Tkachuk C/LW). See `refreshPlayerEligibilityCache` in
      `yahoo-fantasy-client.ts` (paginated Yahoo fetch, ~8s) and
      `applyEligibilityOverrides` in `player-evaluator-board.tsx`.
      Restructured (2026-09-28) so no page request ever depends on a live
      Yahoo call or the viewer's own connection: a daily cron job
      (`vercel.json`, `/api/cron/refresh-player-eligibility`, secured with
      `CRON_SECRET`) refreshes a DB-backed cache
      (`yahoo_player_eligibility_cache`, one global row) in the background,
      using whichever Yahoo connection is available
      (`getAnyValidYahooAccessToken` - this is global game data, not
      user-specific, so it doesn't matter whose token). Every page just
      reads that row (`getCachedPlayerEligibility`) - fast, no wait, and
      correct as long as at least one person somewhere has ever connected
      Yahoo. Falls back to NST's single position only if the cache has
      literally never been seeded.
- [x] Added a "Last Season" window alongside Last 5 / Last 10 / Season
      (2026-09-30) - a real, complete prior-season sample to fall back on
      by choice while the new season is still this thin, rather than a
      fallback you only see by accident. `previousNstSeason()` in
      `nst-client.ts` derives the prior season code from whatever
      `currentNstSeason()` says is current (so it stays correct year to
      year, same self-correcting approach as the season-detection fix
      above). Gets its own baseline for the Luck/Regression columns too
      (`seasonRangeSpanning`, ending one season further back) rather than
      reusing the current-season baseline, which would otherwise overlap
      the displayed window heavily. Min GP filter now applies to both
      Season and Last Season (both are "full" windows where a GP floor
      filters out real injury-shortened players, not early-season noise).
- [ ] Consider a "Preseason" window too - lower priority/more work. Both
      `schedule.ts` (`gameType === 2` filter) and `nst-client.ts`
      (`stype: "2"`) currently exclude preseason games entirely, so this
      needs new fetch paths, not just a new tab. Preseason lineups are also
      noisy (AHL call-ups, unreliable ice time), so the data would be
      lower-signal than the other windows - worth scoping carefully before
      building, maybe just as an early-September-only view.

## Goalies

Goalies got their own page at `/goalies` (Sept 18 2026) - the picking/
holding strategy is different enough from skaters that they no longer share
Players' tab bar.

- [x] Goalie starter tracking - shipped as the "Start Tracker" tab, live
      data from Natural Stat Trick (`src/lib/goalie-tracking-service.ts`).
      Per team, shows each goalie's share of starts over a trailing 10-team-
      games window vs. their season-long share, plus a "Taking Over" flag
      when a backup's recent share has jumped past the current-majority
      threshold. Replaced the old sample-data "Long-Term Holds" tab
      entirely. Caveat: NST has no per-game start log, so "starts" here
      means "games with recorded ice time" in the window - a relief
      appearance after a pulled starter can very occasionally inflate a
      share slightly.
- [x] Spot Starts is now live too - ranks by an actual estimated win
      probability (`src/lib/win-probability.ts`, log5 method over real
      season/home-road/last-10 win records from the NHL's own standings
      endpoint, `src/lib/nhl-standings.ts`), since a Win is usually the
      biggest chunk of a goalie's fantasy points on a given start. Combines
      with Start Tracker's presumed-starter signal
      (`src/lib/goalie-spot-start-service.ts`) and real schedule data.
      Caveat: "presumed starter" is a projection (Start Tracker's current-
      share leader), not a confirmed daily lineup - no free source publishes
      that.
- Tried (2026-09-30) and reverted same day: a real confirmed-starter signal
      from gamedaytweets.com (run by the same people as the @GameDayGoalies
      Twitter/X account - confirmed via its bio, not a random scrape).
      Parser worked correctly end-to-end locally. Dead end in production:
      the site's behind Cloudflare, which blocks Vercel's serverless IP
      range outright (confirmed - better browser-like headers made no
      difference, so it's IP/ASN-level, not a fingerprinting issue). A
      client-side fetch from the visitor's own browser isn't viable either
      - the site sends no `Access-Control-Allow-Origin` header, so CORS
      blocks that path too. Real fix would mean paying for a residential-IP
      scraping-proxy service (ScraperAPI/ScrapingBee/etc.) - not worth it
      for a secondary signal unless that changes. Don't re-attempt a plain
      server-side `fetch()` against this site without a proxy in place.

## Scoring formats

- [x] First step: Hits/Blocks/PIM ("Bangers") now show as their own column
      group on Rankings, far right after Luck/Regression. Real per-window
      totals, parsed from columns NST's individual-stats report already
      includes but this app never read before (verified live, individually
      <th>-by-<th> against known values - e.g. Kiefer Sherwood led the
      league in hits, Jaccob Slavin in blocks - after an initial grouped-
      header reading turned out to be off by one column and gave
      plausible-looking but wrong numbers). See `NstIndividualRow` in
      `nst-client.ts` and `BANGERS_COLUMNS` in `skater-rankings-table.tsx`.
- [ ] Still not real categories-league SUPPORT, just visibility. C-Score and
      the whole ranking system are still tuned toward points-league value
      (shot- and chance-generation metrics) - Hits/Blocks/PIM are shown but
      don't affect ranking, Drop & Replace's candidate ordering, or which
      streamers get surfaced. A league might not even use all of
      G/A/PPP/SOG/HIT/BLK/PIM, or might punt some categories entirely.
      Needs real design thought: possibly a league-scoring-format setting
      (categories used + punt strategy) that reweights or supplements
      C-Score for categories leagues specifically, without changing
      anything for points-league value.

## New tools

- [x] **Deployment** (2026-10-02) - live at `/deployment`. Surfaces real
      ice-time role changes (recent trusted minutes, power-play time
      especially) before the points catch up to them - production mostly
      follows opportunity, not the other way around. Compares a short
      recent window (`RECENT_GAMES` in `deployment-service.ts` - started
      at Last 10 Games, shrunk to Last 3 same-day per feedback: a real
      deployment change is obvious to an attentive fan within a game or
      two, so 10 games was reacting slower than a human would) against
      last season as the baseline (not "earlier this season" - too young
      to mean anything in the first weeks, which is exactly when a new-
      season role change is most worth catching early). PP TOI required a
      new NST situation query (`sit: "pp"`, verified live against real
      PP1 numbers - e.g. Kucherov ~4.3 min/gm - same column layout as the
      existing 5v5/all reports, so no new parsing logic needed).
      Deliberately scoped to ice time only, not linemate identity - NST's
      public bot API doesn't expose line combinations, only aggregate ice
      time per situation; a real role change is a strong proxy for better
      linemates even without naming them. Looked into two real confirmed-
      line sources as a follow-up (gamedaytweets.com, already covered
      above - blocked from Vercel's IPs; frozenpool.dobbersports.com's
      "Last Game Lines" report, PP1/PP2 by team) - the actual line data
      on frozenpool never appeared in a plain unauthenticated fetch (found
      the real `#last_game_lines` DataTable's setup in the page's JS, but
      the table itself is never server-rendered for an anonymous request),
      which points to it being gated behind their paid "Frozen Tools"
      subscription rather than a scrapeable public page - not pursued
      further for that reason; don't re-attempt a plain fetch against it
      without first confirming it's actually publicly accessible. See
      `deployment-service.ts` for the composite "Deployment Score" (same
      rank-averaging approach as C-Score). Extracted the Yahoo multi-
      position override (previously local to
      `player-evaluator-board.tsx`) into a shared
      `apply-eligibility-overrides.ts` so this tool gets the same
      correct team/position handling Rankings already has.
- [x] **Player evaluator + streamer suggester**, merged - live at
      `/skaters`. Full skater pool ranked by C-Score over Last 5 Games /
      Last 10 Games / Season, a built-in player comparison tool, and a
      Drop & Replace flow (pick who to drop, see ranked free-agent
      replacements with games-in-range) - currently using a sample roster
      until real Yahoo league data is live (see above).
- [ ] **Drop & Replace: support planning multiple streamer adds at once.**
      Today it only evaluates one drop-for-one-add at a time - no way to
      plan "drop 2, add 2 different streamers" for the week in one pass.
      The existing fit-days math (`computeFitDays` in `roster-fit.ts`) is
      explicit about this limit in its own doc comment: it "evaluates one
      candidate at a time... doesn't jointly optimize multiple simultaneous
      adds." Concretely, that means checking a second streamer's fit today
      doesn't know the first streamer already claimed a shared slot on an
      overlapping day - so stacking up several "good fits" one at a time
      can overstate how many total starts you're actually picking up,
      since two candidates who each individually "fit" 4 of 7 days might
      be fighting over the same slot on 3 of those days.
      Rough direction (review before building, not settled): add a
      "staging" mode - after picking drop candidate(s) to free slots, let
      the user select MULTIPLE add candidates from the ranked list (not
      just one), then run the existing matching machinery jointly across
      the whole staged group instead of one at a time (`computeDayLineup`
      already supports evaluating an arbitrary set of players against a
      day's slots - it just needs to be fed the staged set). Show a
      day-by-day breakdown of the staged group so overlap/conflicts are
      visible (e.g. "these two only both start on 4 of the 7 days - they're
      competing for the same open slot on the other 3"), not just a single
      summed total that could hide the double-counting. A "suggest the best
      combo" mode (search combinations of top-ranked candidates per
      position to maximize combined starts across the week) would be a
      nice follow-up but isn't required for a first pass - honest joint
      accounting plus manual multi-select covers the main ask.
- [ ] **Trade evaluator / suggester**
- [ ] **DFS / daily sports betting guide** - surface high-value bets, likely
      built on top of the player evaluator's underlying metrics once that
      exists.

## Site

- [x] Finish landing page UI - shipped: real hero, live tool cards, a real
      top-5 C-Score leaderboard teaser, Coming Soon row.
