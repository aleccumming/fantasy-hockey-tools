import Link from "next/link";

const SECTIONS = [
  { id: "getting-started", label: "Getting Started" },
  { id: "importing", label: "Importing Rankings" },
  { id: "cheat-sheet", label: "Cheat Sheet & Best Available" },
  { id: "draft-board", label: "Draft Board & My Team" },
  { id: "settings", label: "League Settings" },
  { id: "extra-rankings", label: "Ranking & ADP Sources" },
  { id: "notes", label: "Notes" },
  { id: "live-sync", label: "Live Sync With an External Draft" },
  { id: "fixing-mistakes", label: "Fixing Mistakes" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-md border border-line bg-surface p-5">
      <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-ink-dim">{children}</div>
    </section>
  );
}

function Tab({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-line bg-ice px-1.5 py-0.5 text-xs font-semibold text-ink-dim">
      {children}
    </span>
  );
}

export default function HowToUsePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-ink">
        How to Use
      </h1>
      <div className="mt-2 h-[3px] w-16 bg-rink-blue" />
      <p className="mt-4 text-sm text-ink-dim">
        A walkthrough of the Draft Assistant, start to finish. Jump to a section, or just read
        top to bottom.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        <Section id="getting-started" title="Getting Started">
          <p>
            Sign in with Google from the top-right of any page. Once signed in,{" "}
            <Link href="/draft" className="font-semibold text-rink-blue hover:underline">
              Draft Assistant
            </Link>{" "}
            takes you to your list of drafts. Click <strong>New Draft</strong> to create one, or
            open an existing draft to pick up where you left off.
          </p>
          <p>
            A brand-new draft has no players yet - you&apos;ll be prompted to upload a CSV of
            player rankings before anything else works. This is the one required step; everything
            else in the app builds on top of that list.
          </p>
        </Section>

        <Section id="importing" title="Importing Rankings">
          <p>
            Upload any CSV with at least a player name column. The app tries to auto-detect
            columns for <strong>rank</strong>, <strong>team</strong>, <strong>positions</strong>,{" "}
            <strong>ADP</strong>, and any stat projection columns (goals, assists, etc.) - you can
            correct its guesses before confirming the import.
          </p>
          <p>
            After import, the app automatically:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Fills in eligible positions from a Yahoo positions dataset, where your CSV doesn&apos;t already specify them (or has only one).</li>
            <li>Adds any players missing from your CSV entirely (goalies are the usual gap) using live NHL rosters, so the pool always covers every real player.</li>
            <li>Fills in ADP for any player missing it, from a bundled real-world dataset - never overriding an ADP your own CSV already provided.</li>
          </ul>
          <p>
            If your CSV includes stat projections (goals, assists, saves, etc.), the app switches
            into <strong>projection mode</strong>: rankings are computed from Value Over
            Replacement (VOR) instead of your raw row order, and you can tune point values per
            stat in <Tab>Settings</Tab>. Without projections, your CSV&apos;s own rank/row order is
            used directly.
          </p>
        </Section>

        <Section id="cheat-sheet" title="Cheat Sheet & Best Available">
          <p>
            The <Tab>Rankings</Tab> tab (and the compact version on <Tab>Overview</Tab>) is your
            full player list - searchable, filterable by position, and sortable by any column.
            Drafted players are hidden by default (toggle that off to see the full board).
          </p>
          <p>
            <strong>Best Available</strong> goes a step further than a plain ranked list. On top
            of your base ranking (or VOR), it factors in:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Whether a player fills an open roster slot on your team.</li>
            <li>
              <strong>ADP urgency</strong> - a player already past their average draft position,
              or approaching it before your next turn, is flagged as a real reach risk.
            </li>
            <li>
              <strong>Positional depth</strong> - how many similarly-valued players at that
              position are likely to still be around at your next turn. A player at a position
              that&apos;s about to thin out gets bumped up; a player at a deep position (plenty of
              similar value coming later) doesn&apos;t get an artificial boost just for being
              top-ranked there right now.
            </li>
          </ul>
          <p>
            Each recommended player shows a short tag explaining why it&apos;s ranked where it is,
            so you can weigh the reasoning yourself rather than trust a black-box score.
          </p>
        </Section>

        <Section id="draft-board" title="Draft Board & My Team">
          <p>
            The <Tab>Overview</Tab> tab&apos;s draft board shows every pick, color-coded by
            position (orange C, pink LW, blue RW, purple D, yellow G) so you can scan it at a
            glance. <strong>My Team</strong> shows your own roster slotted in, including which
            positions each player is eligible for.
          </p>
        </Section>

        <Section id="settings" title="League Settings">
          <p>
            Under <Tab>Settings</Tab>, set your team count, which team is yours, roster slot
            counts per position, and total rounds. <strong>Draft order</strong> supports three
            formats:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li><strong>Standard snake</strong> - alternates direction every round.</li>
            <li>
              <strong>Third-round reversal</strong> - standard snake, except round 3 repeats round
              2&apos;s direction instead of flipping back, then keeps alternating from there.
            </li>
            <li>
              <strong>Balanced</strong> - reverses once after round 1, then stays reversed for
              every remaining round (never flips back).
            </li>
          </ul>
          <p>
            Changing this setting on a draft that already has picks made is safe - existing picks
            are preserved and just re-mapped onto the corrected order.
          </p>
        </Section>

        <Section id="extra-rankings" title="Ranking & ADP Sources">
          <p>
            Also under <Tab>Settings</Tab>: add other rankings (a friend&apos;s list, another
            site&apos;s) to compare side-by-side on the Cheat Sheet, alongside an average rank
            across every source. Separately, you can add an alternate ADP dataset (useful if your
            league scores differently than a standard points/categories setup) and pick which one
            is active for that draft - the bundled default is always used unless you add and
            select an alternate.
          </p>
        </Section>

        <Section id="notes" title="Notes">
          <p>
            The <Tab>Notes</Tab> tab is a free-form scratchpad for strategy, sleepers to watch,
            or reminders - saved automatically along with everything else in the draft.
          </p>
        </Section>

        <Section id="live-sync" title="Live Sync With an External Draft">
          <p>
            If you&apos;re drafting on another site (currently kkupfl or Fantrax), you can have
            picks show up here automatically instead of manually clicking through the app.
            Find the relay script under <Tab>Settings</Tab>.
          </p>
          <ol className="list-inside list-decimal space-y-1">
            <li>Fill in the external draft&apos;s ID and click <strong>Copy relay script</strong>.</li>
            <li>
              Open the actual draft page on the other site, open its browser console (F12, or
              right-click → Inspect → Console), paste the script, and press Enter.
            </li>
            <li>
              It scans for any picks already made (safe to do this any time, even mid-draft), then
              listens for new ones as they happen.
            </li>
          </ol>
          <p>
            <strong>Important:</strong> this only runs for as long as that browser tab stays open
            on that exact page. Closing the tab, reloading the page, or a refresh prompted by the
            other site all stop it - if that happens, just re-paste the script (grab a fresh copy
            from <Tab>Settings</Tab> - it always encodes the current draft ID).
          </p>
        </Section>

        <Section id="fixing-mistakes" title="Fixing Mistakes">
          <p>
            Hover over any filled pick on the draft board and a small × appears in the corner -
            clicking it asks for confirmation before undoing that pick, so an accidental click
            can&apos;t silently undo anything.
          </p>
          <p>
            From the drafts list, you can also <strong>rename</strong> or <strong>delete</strong>{" "}
            any draft. A small status indicator at the top of each draft shows whether your latest
            change has saved - if a save ever fails, it&apos;ll show a visible error with a retry
            button instead of failing silently.
          </p>
        </Section>
      </div>
    </main>
  );
}
