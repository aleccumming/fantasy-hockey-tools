# Fantasy Hockey Tools

A set of tools for fantasy hockey managers. Currently live:

- **Draft Assistant** (`/draft`) - see below.
- **Skaters** (`/skaters`) - every skater ranked by C-Score over Last 5 / Last 10 /
  Season / Last Season, split into Forwards and Defense, plus Compare and a Drop &
  Replace flow for streaming. Drop & Replace can stage several adds as one move and
  shows their combined starts day by day, so two streamers can't both count the
  same open slot.
- **Goalies** (`/goalies`) - Start Tracker (each goalie's recent vs. season share
  of starts) and Spot Starts (ranked by estimated win probability).
- **Deployment** (`/deployment`) - skaters whose ice time or power-play share in
  their most recent game jumped or dropped against a chosen baseline. Split into
  Forwards and Defense tabs, 50 players per page.

Skaters and Deployment can filter to unowned players. With a Yahoo league
connected they use that league's real free agents; otherwise they use a manual
roster.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Draft Assistant

At `/draft`. Workflow:

1. **Import a ranking** — upload a CSV of your player rankings (or a projections
   export) and map its columns to the app's fields. Common header names (`Name`,
   `Team`, `Pos`, `Rank`, `ADP`, `G`, ...) are auto-detected. Only a name column is
   required; if there's no `Rank` column, the row order in your file is used as the
   ranking. Grab the "Download an example CSV" link on the upload screen if you want
   a template to start from.
2. **Set league settings** — team count, your team, roster slots, draft rounds.
3. **Draft live** — the Cheat Sheet shows players in ranked order. Click "Draft" as
   picks happen (yours or opponents') to advance the snake draft board. My Team and
   Pick Suggestions update as you go. Its **Schedule** column shows a Low/Med/High
   badge per player for how much their team's schedule overlaps with players you've
   *already rostered at a shared position* (dual/tri-eligible players are checked
   against all of their positions, and UTIL counts too) — hover a badge to see which
   of your teams it's comparing against. Nothing rostered at a shared position yet?
   Always Low. This resets to 0 relative to your current roster, not a fixed
   per-team stat, so it's most useful once you've got a few picks in at a position.
4. **Schedule tab** — shows which teams play the most on league-wide "off-nights"
   (light game-volume dates), pulled live from the NHL API — useful for
   streaming-friendly picks late in the draft.
5. **Schedule Fit tab** — pick a position, and it ranks the remaining players there
   by how much their team's schedule overlaps with your already-rostered players at
   that same position (computed live from the full NHL season schedule, same source
   as the Schedule tab). Lower overlap means more distinct game-days covered if
   you're rostering multiple players at that spot — useful for deciding between two
   similarly-ranked players at a thin position.

Stat projections and scoring are optional and layered on top: if your CSV also
includes stat columns (goals, assists, etc.), configure points-per-stat under
Settings and the Cheat Sheet switches to ranking by computed Fantasy Points and
Value Over Replacement (VOR) instead, with auto-generated tiers.

All draft state (players, scoring, picks) persists to `localStorage`, so a page
refresh mid-draft won't lose anything. Use "Reset draft picks" or "Clear all players"
in Settings to start over.

### CSV format

One row per player. At minimum needs a name column; team, position, rank, ADP, and
stat columns are all optional and mapped manually on import. See `src/lib/csv.ts`
(`FIELD_ALIASES`) for the column keys recognized out of the box — you can add any
other stat as a custom scoring entry.

### Yahoo positions (optional)

If your ranking CSV's positions don't exactly match Yahoo's fantasy eligibility
(e.g. a dual-eligible C/LW player), the app can apply Yahoo's own position data
automatically on every import - no login, no per-user step, for anyone using the
app. This comes from `src/data/yahoo-positions.json`, a bundled dataset built once
(and refreshable anytime) from a CSV of Yahoo player data:

```bash
npm run build:yahoo-positions -- path/to/your-file.csv
```

It auto-detects the Name/Position/Team columns (same alias matching as the main
ranking import - see `src/lib/csv.ts`) and writes `src/data/yahoo-positions.json`.
Since positions rarely change mid-season, you'd typically only need to do this once
before drafting. For one-off touch-ups afterward (a player who was missed, or whose
eligibility changed), Settings also has a **manual paste** box: copy a small
Name + Position table and paste it in to update just those players in your current
session (this one doesn't touch the bundled file).

If a player's name in your ranking CSV doesn't match the bundled dataset (different
spelling, nickname, etc.), positions just won't be applied for them - no error, they
keep whatever position was in your CSV. Tell me the mismatched name pairs and I can
add them as aliases in `src/data/yahoo-positions.json`.

### ADP (optional)

Same idea as positions, for Average Draft Position: `src/data/adp.json`, built from a
Name,ADP CSV via:

```bash
npm run build:adp -- path/to/your-file.csv
```

Unlike positions (which always override), this only *fills in* ADP for players who
don't already have one from their own ranking CSV - it won't clobber ADP you already
imported. Rows with a non-numeric value (e.g. "N/A" for undrafted players) are
skipped automatically.

Both datasets use the same accent/case/whitespace-insensitive name matching, and
Settings shows how many players are covered by each.

### Comparing multiple ranking sources (optional)

Beyond your main imported list, Settings has an **Additional Ranking Sources** box
for pasting in other rankings (a friend's list, another site's rankings) purely to
compare - paste Name + Rank rows, give it a label, and it shows up as its own column
on the Cheat Sheet, matched to your main list by name. An **Avg Rank** column also
appears, averaging each player's own rank plus every source that has them (so a
player only one source ranked still just shows their own rank - the average isn't
dragged down by sources that don't cover them). Unlike the bundled Yahoo/ADP
datasets, these live in `localStorage` with the rest of your draft state, not a file
in the repo - add or remove them anytime per session.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel. Zustand for
Draft Assistant state (persisted to `localStorage`), Papaparse for CSV import.

- **Database:** Postgres via Drizzle ORM (Neon in production). Note that
  `.env.local`'s `DATABASE_URL` points at a local Postgres, so a local
  `drizzle-kit push` does not reach production.
- **Auth:** NextAuth with the Drizzle adapter, plus a separate Yahoo OAuth connect
  flow for league rosters and free agents.
- **Data sources:** Natural Stat Trick (skater/goalie stats), the NHL API
  (schedule, standings), and the Yahoo Fantasy API (leagues, rosters, free agents,
  position eligibility).
- **Caching:** two daily Vercel crons (`vercel.json`) refresh DB-backed caches for
  Yahoo position eligibility and the NST-backed tools, so page loads never wait
  on a live NST or Yahoo call.

## Roadmap

See [ROADMAP.md](./ROADMAP.md).
