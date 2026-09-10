"use client";

import { useState } from "react";
import { useDraftStore } from "@/store/draft-store";
import { resolveDraftOrderType } from "@/lib/draft-state";
import type { DraftOrderType, Position } from "@/lib/types";

const DRAFT_ORDER_OPTIONS: { value: DraftOrderType; label: string; title: string }[] = [
  { value: "snake", label: "Standard snake", title: "Alternates every round (1-12, 12-1, 1-12, ...)" },
  {
    value: "thirdRoundReversal",
    label: "Third-round reversal",
    title: "Round 3 repeats round 2's direction instead of flipping back, then keeps alternating from there",
  },
  {
    value: "balanced",
    label: "Balanced",
    title: "Reverses once after round 1, then stays reversed for every remaining round (never flips back)",
  },
];

const POSITION_SLOTS: (Position | "UTIL" | "BENCH")[] = [
  "C",
  "LW",
  "RW",
  "D",
  "G",
  "UTIL",
  "BENCH",
];

export function SettingsPanel() {
  const scoring = useDraftStore((s) => s.scoring);
  const updateScoring = useDraftStore((s) => s.updateScoring);
  const resetScoringToDefault = useDraftStore((s) => s.resetScoringToDefault);
  const settings = useDraftStore((s) => s.settings);
  const updateSettings = useDraftStore((s) => s.updateSettings);
  const totalRounds = useDraftStore((s) => s.totalRounds);
  const setTotalRounds = useDraftStore((s) => s.setTotalRounds);
  const teamNames = useDraftStore((s) => s.teamNames);
  const setTeamName = useDraftStore((s) => s.setTeamName);
  const resetDraft = useDraftStore((s) => s.resetDraft);
  const clearPlayers = useDraftStore((s) => s.clearPlayers);

  const [newStatKey, setNewStatKey] = useState("");
  const [newStatLabel, setNewStatLabel] = useState("");

  function addCustomStat() {
    if (!newStatKey.trim()) return;
    updateScoring([
      ...scoring,
      {
        key: newStatKey.trim(),
        label: newStatLabel.trim() || newStatKey.trim(),
        pointValue: 0,
        appliesTo: "both",
      },
    ]);
    setNewStatKey("");
    setNewStatLabel("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-md border border-line bg-surface p-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
          Scoring Settings <span className="font-sans font-normal normal-case text-ink-faint">(optional)</span>
        </h3>
        <p className="mt-1 text-xs text-ink-dim">
          Only matters if your CSV includes stat columns (goals, assists, etc.) &mdash;
          it&apos;s used to compute Fantasy Points and Value Over Replacement. If
          you&apos;re just using a plain ranking CSV, you can ignore this section entirely.
        </p>
        <div className="mt-3 max-h-96 space-y-1 overflow-y-auto pr-1">
          {scoring.map((stat, i) => (
            <div key={stat.key} className="flex items-center gap-2 text-sm">
              <span className="w-40 shrink-0 truncate text-ink-dim" title={stat.key}>
                {stat.label}
              </span>
              <input
                type="number"
                step="0.1"
                value={stat.pointValue}
                onChange={(e) => {
                  const next = [...scoring];
                  next[i] = { ...stat, pointValue: Number(e.target.value) };
                  updateScoring(next);
                }}
                className="w-24 rounded border border-line bg-surface px-2 py-1 text-ink focus:border-rink-blue focus:outline-none"
              />
              <span className="text-xs text-ink-faint">{stat.appliesTo}</span>
              <button
                onClick={() => updateScoring(scoring.filter((s) => s.key !== stat.key))}
                className="ml-auto text-xs text-ink-faint hover:text-rink-red"
              >
                remove
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="flex flex-col text-xs text-ink-dim">
            Stat key (CSV column key)
            <input
              value={newStatKey}
              onChange={(e) => setNewStatKey(e.target.value)}
              placeholder="e.g. faceoffWins"
              className="w-40 rounded border border-line bg-surface px-2 py-1 text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-ink-dim">
            Display label
            <input
              value={newStatLabel}
              onChange={(e) => setNewStatLabel(e.target.value)}
              placeholder="e.g. Faceoff Wins"
              className="w-40 rounded border border-line bg-surface px-2 py-1 text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
            />
          </label>
          <button
            onClick={addCustomStat}
            className="rounded border border-line px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            Add stat
          </button>
          <button
            onClick={resetScoringToDefault}
            className="ml-auto rounded border border-line px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            Reset to defaults
          </button>
        </div>
      </section>

      <section className="rounded-md border border-line bg-surface p-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
          League Settings
        </h3>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex flex-col gap-1 text-xs text-ink-dim">
            Number of teams
            <input
              type="number"
              min={2}
              max={20}
              value={settings.teamCount}
              onChange={(e) => updateSettings({ teamCount: Number(e.target.value) })}
              className="w-24 rounded border border-line bg-surface px-2 py-1 text-ink focus:border-rink-blue focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-dim">
            My team
            <select
              value={settings.myTeamIndex}
              onChange={(e) => updateSettings({ myTeamIndex: Number(e.target.value) })}
              className="w-40 rounded border border-line bg-surface px-2 py-1 text-ink focus:border-rink-blue focus:outline-none"
            >
              {teamNames.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-dim">
            Draft rounds
            <input
              type="number"
              min={1}
              max={30}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value))}
              className="w-24 rounded border border-line bg-surface px-2 py-1 text-ink focus:border-rink-blue focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-dim">
            Draft order
            <select
              value={resolveDraftOrderType(settings)}
              onChange={(e) => updateSettings({ draftOrderType: e.target.value as DraftOrderType })}
              title={DRAFT_ORDER_OPTIONS.find((o) => o.value === resolveDraftOrderType(settings))?.title}
              className="w-48 rounded border border-line bg-surface px-2 py-1 text-ink focus:border-rink-blue focus:outline-none"
            >
              {DRAFT_ORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} title={o.title}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Team Names
        </h4>
        <div className="mt-2 grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {teamNames.map((name, i) => (
            <input
              key={i}
              value={name}
              onChange={(e) => setTeamName(i, e.target.value)}
              className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-rink-blue focus:outline-none"
            />
          ))}
        </div>

        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Roster Slots
        </h4>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {POSITION_SLOTS.map((pos) => (
            <label key={pos} className="flex flex-col text-xs text-ink-dim">
              {pos}
              <input
                type="number"
                min={0}
                max={10}
                value={settings.rosterSettings.slots[pos] ?? 0}
                onChange={(e) =>
                  updateSettings({
                    rosterSettings: {
                      slots: {
                        ...settings.rosterSettings.slots,
                        [pos]: Number(e.target.value),
                      },
                    },
                  })
                }
                className="rounded border border-line bg-surface px-2 py-1 text-ink focus:border-rink-blue focus:outline-none"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex gap-2 border-t border-line pt-3">
          <button
            onClick={() => {
              if (confirm("Reset all draft picks? Players and settings are kept.")) resetDraft();
            }}
            className="rounded border border-line px-2 py-1 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            Reset draft picks
          </button>
          <button
            onClick={() => {
              if (confirm("Remove all imported players?")) clearPlayers();
            }}
            className="rounded border border-rink-red/40 px-2 py-1 text-xs font-semibold text-rink-red hover:bg-rink-red-light"
          >
            Clear all players
          </button>
        </div>
      </section>
    </div>
  );
}
