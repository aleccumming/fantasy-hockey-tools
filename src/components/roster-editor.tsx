"use client";

import { useState } from "react";
import { PlayerSearchPicker } from "@/components/player-search-picker";
import { SAMPLE_ROSTER, type SampleRosterPlayer } from "@/lib/sample-roster";
import { playerIdentityKey, playerNameGroupKey } from "@/lib/player-identity-key";
import type { SkaterPosition } from "@/lib/types";

const ALL_POSITIONS: SkaterPosition[] = ["C", "LW", "RW", "D"];

export interface RosterPoolPlayer {
  /** playerNameGroupKey - see PickablePlayer.id. */
  id: string;
  name: string;
  team: string;
  positions: SkaterPosition[];
}

export function RosterEditor({
  roster,
  onChange,
  pool,
}: {
  roster: SampleRosterPlayer[];
  onChange: (next: SampleRosterPlayer[]) => void;
  pool: RosterPoolPlayer[];
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [positions, setPositions] = useState<Set<SkaterPosition>>(new Set());

  function handlePick(id: string | null) {
    setPicked(id);
    // Prefill with the stat feed's position; Yahoo eligibility often lists
    // more, so the chips stay editable.
    setPositions(new Set(id ? (pool.find((p) => p.id === id)?.positions ?? []) : []));
  }

  function togglePosition(pos: SkaterPosition) {
    setPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  }

  const pickedPlayer = picked ? pool.find((p) => p.id === picked) : null;
  // Matched by the pool's identity, not the chips the user may have edited,
  // so one Pettersson on the roster doesn't block adding the other.
  const alreadyOnRoster = pickedPlayer
    ? roster.some((r) => playerNameGroupKey(r.name, r.positions) === pickedPlayer.id)
    : false;
  const canAdd = Boolean(pickedPlayer) && positions.size > 0 && !alreadyOnRoster;

  function addPlayer() {
    if (!pickedPlayer || !canAdd) return;
    onChange([
      ...roster,
      {
        name: pickedPlayer.name,
        team: pickedPlayer.team,
        positions: ALL_POSITIONS.filter((p) => positions.has(p)),
      },
    ]);
    handlePick(null);
  }

  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="text-xs text-ink-dim">
        Your roster is saved in this browser. Add or remove players so the fit math uses who
        you actually have - set each player&apos;s eligible positions the way Yahoo lists them.
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-3">
        <div className="w-full max-w-xs">
          <PlayerSearchPicker label="Search a player to add" players={pool} value={picked} onChange={handlePick} />
        </div>
        {pickedPlayer && (
          <>
            <div className="flex items-center gap-1">
              {ALL_POSITIONS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => togglePosition(pos)}
                  className={`rounded px-2 py-1.5 text-xs font-semibold ${
                    positions.has(pos)
                      ? "bg-rink-blue text-white"
                      : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            <button
              onClick={addPlayer}
              disabled={!canAdd}
              className="rounded bg-rink-blue px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {alreadyOnRoster ? "Already on roster" : "Add to roster"}
            </button>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {roster.map((p) => (
          <span
            key={playerIdentityKey(p.name, p.team, p.positions)}
            className="flex items-center gap-1.5 rounded-full border border-line bg-ice-2/60 py-1 pl-3 pr-1.5 text-xs text-ink"
          >
            <span className="font-semibold">{p.name}</span>
            <span className="text-ink-faint">
              {p.team} &middot; {p.positions.join("/")}
            </span>
            <button
              onClick={() => onChange(roster.filter((r) => r !== p))}
              aria-label={`Remove ${p.name}`}
              className="rounded-full px-1.5 text-ink-faint hover:text-rink-red"
            >
              &times;
            </button>
          </span>
        ))}
        {roster.length === 0 && <span className="text-xs text-ink-faint">No players on your roster yet.</span>}
      </div>

      <button
        onClick={() => onChange(SAMPLE_ROSTER)}
        className="mt-3 text-xs font-medium text-ink-faint hover:text-rink-blue"
      >
        Reset to default roster
      </button>
    </div>
  );
}
