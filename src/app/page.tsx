import Link from "next/link";

const TOOLS = [
  {
    href: "/draft",
    name: "Draft Assistant",
    description:
      "Upload your player rankings and get a live cheat sheet, draft tracking, and pick suggestions.",
    available: true,
  },
  {
    href: "#",
    name: "Weekly Streamer Suggestions",
    description: "Find the best waiver-wire streamers for your matchup each week.",
    available: false,
  },
  {
    href: "#",
    name: "Trade Recommender",
    description: "Evaluate trade offers and find deals that help both sides.",
    available: false,
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-ink">
        Fantasy Hockey Tools
      </h1>
      <div className="mt-2 h-[3px] w-16 bg-rink-blue" />
      <p className="mt-4 text-sm text-ink-dim">
        A growing set of tools to help you win your fantasy hockey league.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) =>
          tool.available ? (
            <Link
              key={tool.name}
              href={tool.href}
              className="rounded-md border border-line bg-surface p-5 shadow-sm transition hover:border-rink-blue hover:shadow-md"
            >
              <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                {tool.name}
              </h2>
              <p className="mt-1.5 text-sm text-ink-dim">{tool.description}</p>
            </Link>
          ) : (
            <div
              key={tool.name}
              className="rounded-md border border-line bg-ice-2/60 p-5 opacity-70"
            >
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  {tool.name}
                </h2>
                <span className="rounded-sm bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  Coming soon
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink-dim">{tool.description}</p>
            </div>
          )
        )}
      </div>
    </main>
  );
}
