# Roadmap

Ideas and planned features for Fantasy Hockey Tools, in no particular order.
Check items off (or just delete them) as they land - this is a scratchpad, not
a formal backlog.

## Players (Skaters)

Streamer Suggestions was merged into the Player Evaluator page (now just
"Players" at `/players`) on Sept 18 2026 - they were doing largely the same
job (rank skaters by C-Score) through two separate pages and two separate
backend services. Now one page: Rankings (with an All Players/Unowned
toggle) + Compare + a Drop & Replace flow.

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
      Switcher in `yahoo-connect-status.tsx` (shown on `/players`,
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
- [ ] Add a "Last Season" window option alongside Last 5 / Last 10 / Season.
      Today the Season window only shows last year's data as an automatic
      fallback (`currentNstSeason()` in `nst-client.ts`) before the new
      season has real games - there's no way to see last season on purpose
      once the new season is underway and its own small early sample
      overwrites the view. Straightforward: mostly a matter of fetching an
      explicit prior-season NST window and adding a fourth tab.
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

## New tools

- [x] **Player evaluator + streamer suggester**, merged - live at
      `/players`. Full skater pool ranked by C-Score over Last 5 Games /
      Last 10 Games / Season, a built-in player comparison tool, and a
      Drop & Replace flow (pick who to drop, see ranked free-agent
      replacements with games-in-range) - currently using a sample roster
      until real Yahoo league data is live (see above).
- [ ] **Trade evaluator / suggester**
- [ ] **DFS / daily sports betting guide** - surface high-value bets, likely
      built on top of the player evaluator's underlying metrics once that
      exists.

## Site

- [x] Finish landing page UI - shipped: real hero, live tool cards, a real
      top-5 C-Score leaderboard teaser, Coming Soon row.
