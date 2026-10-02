import Link from "next/link";
import { HomepageLeaderboard } from "@/components/homepage-leaderboard";

const LIVE_TOOLS = [
  {
    href: "/draft",
    name: "Draft Assistant",
    description:
      "Upload your rankings and get a live cheat sheet, draft board, pick suggestions, and schedule-fit analysis while you're on the clock.",
  },
  {
    href: "/skaters",
    name: "Skaters",
    description:
      "Rank the full skater pool by C-Score over Last 5, Last 10, or the Season, compare players side by side, and run a Drop & Replace to find your best waiver-wire add.",
  },
  {
    href: "/goalies",
    name: "Goalies",
    description:
      "Goalie strategy runs on different signals than skaters - spot-start matchups and long-term hold recommendations for who's actually getting the starts.",
  },
  {
    href: "/deployment",
    name: "Deployment",
    description:
      "Who's recently gotten meaningfully more (or less) trusted ice time and power-play time than their track record - often the earliest sign of a breakout, before the points show up.",
  },
];

const COMING_SOON_TOOLS = [
  {
    name: "Trade Recommender",
    description: "Evaluate trade offers and find deals that help both sides.",
  },
  {
    name: "DFS & Betting Guide",
    description: "Find value bets and lineups using the same underlying data.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Fantasy Hockey Tools
      </div>
      <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-wide text-ink">
        Draft prep and in-season tools for fantasy hockey managers.
      </h1>
      <div className="mt-3 h-[3px] w-16 bg-rink-blue" />
      <p className="mt-4 max-w-xl text-sm text-ink-dim">
        Upload your rankings for a live draft-day cheat sheet, then identify top streamers with
        C-Score - a composite rank built from underlying metrics that correlate strongly with
        fantasy production. More tools below are on the way.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col gap-4">
          {LIVE_TOOLS.map((tool) => (
            <Link
              key={tool.name}
              href={tool.href}
              className="rounded-md border border-line bg-surface p-5 shadow-sm transition hover:border-rink-blue hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  {tool.name}
                </h2>
                <span className="rounded-full bg-rink-green-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rink-green">
                  Live
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink-dim">{tool.description}</p>
            </Link>
          ))}
        </div>

        <HomepageLeaderboard />
      </div>

      <div className="mt-10">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          Coming Soon
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {COMING_SOON_TOOLS.map((tool) => (
            <div key={tool.name} className="rounded-md border border-line bg-ice-2/60 p-4 opacity-75">
              <h3 className="text-sm font-semibold text-ink">{tool.name}</h3>
              <p className="mt-1.5 text-xs text-ink-dim">{tool.description}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
