"use client";

import { GoalieBoard } from "@/components/goalie-board";

export default function GoaliesPage() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-ink">
        Goalies
      </h1>
      <div className="mt-2 h-[3px] w-16 bg-rink-blue" />
      <p className="mt-4 max-w-2xl text-sm text-ink-dim">
        Goalie strategy runs on different signals than skaters - who&apos;s getting the starts,
        who&apos;s worth a spot start, and who&apos;s worth holding through a cold week.
      </p>

      <div className="mt-6">
        <GoalieBoard />
      </div>
    </main>
  );
}
