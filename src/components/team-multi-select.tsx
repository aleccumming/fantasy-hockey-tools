"use client";

import { useState } from "react";

export function TeamMultiSelect({
  teams,
  selected,
  onChange,
}: {
  teams: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(team: string) {
    const next = new Set(selected);
    if (next.has(team)) next.delete(team);
    else next.add(team);
    onChange(next);
  }

  const label =
    selected.size === 0
      ? "All Teams"
      : selected.size <= 2
        ? Array.from(selected).sort().join(", ")
        : `${selected.size} teams`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink hover:border-rink-blue focus:border-rink-blue focus:outline-none"
      >
        {label} <span className="text-ink-faint">&#9662;</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-40 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-md">
          <button
            // onMouseDown (not onClick) so this fires before the trigger
            // button's onBlur closes the dropdown out from under it.
            onMouseDown={() => onChange(new Set())}
            className="mb-0.5 block w-full rounded px-2 py-1 text-left text-xs font-semibold text-rink-blue hover:bg-stripe/60"
          >
            Clear (All Teams)
          </button>
          {teams.map((team) => (
            <button
              key={team}
              onMouseDown={() => toggle(team)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-ink hover:bg-stripe/60"
            >
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                  selected.has(team) ? "border-rink-blue bg-rink-blue text-white" : "border-line"
                }`}
              >
                {selected.has(team) && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                    <path d="M4 12l6 6L20 6" />
                  </svg>
                )}
              </span>
              {team}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
