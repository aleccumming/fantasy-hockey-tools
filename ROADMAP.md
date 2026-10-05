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
      existing 5v5/all reports, so no new parsing logic needed). Switched
      the PP signal from raw PP minutes/game to PP SHARE (this player's
      share of the team's true PP ice time) per feedback: raw minutes is
      confounded by how many power plays the team even got that window -
      a team that drew few penalties gives everyone low raw PP TOI
      regardless of real unit, while share still correctly shows a true
      PP1 player claiming the same large slice of whatever PP time
      existed. Same share-of-team-total pattern goalie-tracking-service.ts
      already used for start shares. First version summed every skater's
      individual PP TOI as the denominator, which reads much lower than
      real PP1 share should (~15%, not ~70%+) since 5 skaters are
      simultaneously on the ice - fixed per explicit follow-up feedback
      (wanted it to match how a real line-combination report computes %
      of team PP time) by dividing that summed total by 5 (the number of
      skaters on the ice during a power play, virtually always true
      whether it's 5-on-4 or 5-on-3) to approximate the team's real wall-
      clock PP TOI instead - verified live: McDavid/Draisaitl/Kucherov
      all landed in a realistic 65-85% PP1 share range after the fix.
      Looked into pulling the literal number from NST's own team-level
      report (`teamtable.php` on the bot API - confirmed it exists and
      can return real team PP TOI) instead of approximating, but live
      testing showed it's flaky (intermittent empty responses even with
      verified-correct params) - didn't keep retrying it since that
      risked tripping NST's abuse detection on the API key this whole app
      depends on. The /5 approximation gets the same answer reliably
      without that risk.
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
      Made the recent window selectable (2026-10-04, Last Game/Last
      3/Last 5 - `DEPLOYMENT_WINDOWS`) per feedback: PP-unit bumps
      especially are worth acting on fast, ideally off a single game,
      defaults to Last Game. Switched PP share's denominator from raw
      summed player-minutes to an approximation of the team's true wall-
      clock PP TOI (divide by `SKATERS_ON_ICE_DURING_PP` = 5) per
      follow-up feedback wanting it to match how a real line-combination
      report computes "% of team PP time" - verified live,
      McDavid/Draisaitl/Kucherov all landed in a realistic 65-85% range
      after the fix (was ~15% before). Then found and fixed a real
      accuracy bug the same share logic exposed: a player who missed a
      chunk of the window (injury, trade) was diluted by PP time their
      replacement racked up while they were out, since the denominator
      used the team's FULL window total regardless of how many games the
      player themselves appeared in - caught via a user-reported case
      (Matthew Tkachuk showing a 26% PP share last season) and confirmed
      live: he played only 31 of FLA's 80 games (missed significant time
      to injury), and his share was 26% against the full-season
      denominator vs. a real 67% once the denominator was scaled down to
      just his own 31 games (`ppShare` in `deployment-service.ts`).
      Also found and fixed a related, more serious bug while verifying
      the above: the internal name-keyed Maps used to join a player's
      recent/baseline/PP rows together (`byName`) silently dropped one of
      a real name-collision pair (Sebastian Aho, Elias Pettersson - the
      same two pairs already handled for headshots) at Map construction,
      so one of the two real players was computing off the OTHER
      player's stats entirely, not just getting the wrong team label -
      caught by noticing both Petterssons showed the identical PP share
      value to 13 decimal places. Fixed with the same name+team+position-
      group key scheme as headshots.ts (`playerKey`/`byPlayerKey` in
      deployment-service.ts), with a plain-name fallback tier so a
      traded player (team genuinely changed between the recent and
      baseline window) still resolves correctly. The equivalent React
      key bug (`key={p.name}` - duplicate keys on a reordering list,
      which is what actually surfaced this: switching Biggest Boosts/
      Biggest Drops a few times started showing visibly wrong/duplicated
      rows) was fixed the same way in `deployment-board.tsx`, plus
      defensively in `skater-rankings-table.tsx` and
      `homepage-leaderboard.tsx` (lower risk there since both already
      split players into forward/defense groups before rendering, which
      happens to separate both known collision pairs - but not a
      structural guarantee against some other, currently-unknown,
      same-position collision).
      **Known remaining gap, not yet fixed**: `PlayerSearchPicker` (used
      by Compare's player pickers and the manual/sample roster editor)
      and the manual roster editor's own matching logic
      (`roster-editor.tsx`) are name-only all the way through - the
      search dropdown's selected *value* is a bare name string, not a
      team/position-qualified identity, and `player-evaluator-board.tsx`
      already deduplicates its Compare picker list to one entry per name
      before a collision pair ever reaches the UI, so today only ONE of
      a real collision pair (e.g. Elias Pettersson) can even be selected
      for Compare at all - not a display bug, a real "can't do this"
      gap. Properly fixing it means changing `PlayerSearchPicker`'s
      value type from a bare name to a team/position-qualified identity
      and threading that through both consumers (Compare's player1/
      player2 state, the roster editor's add/remove/already-on-roster
      checks) - a real, if small, API change to a shared component, not
      a drop-in key swap like the fixes above, so it's deliberately left
      for its own pass rather than rushed in here.
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
