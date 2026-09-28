"use client";

import { useState } from "react";

export interface PickablePlayer {
  name: string;
  team: string;
}

export function PlayerSearchPicker({
  label,
  players,
  value,
  onChange,
}: {
  label: string;
  players: PickablePlayer[];
  value: string | null;
  onChange: (name: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  if (value) {
    const selected = players.find((p) => p.name === value);
    return (
      <div className="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {selected?.name ?? value}
        </span>
        {selected && <span className="shrink-0 text-xs text-ink-faint">{selected.team}</span>}
        <button
          onClick={() => onChange(null)}
          className="shrink-0 text-xs font-medium text-ink-faint hover:text-rink-red"
        >
          Change
        </button>
      </div>
    );
  }

  const matches =
    query.trim().length === 0
      ? []
      : players.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="relative w-full">
      <input
        type="text"
        placeholder={label}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-rink-blue focus:outline-none"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-md">
          {matches.map((p) => (
            <button
              key={p.name}
              // onMouseDown (not onClick) so this fires before the input's
              // onBlur closes the dropdown out from under it.
              onMouseDown={() => {
                onChange(p.name);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-stripe/60"
            >
              <span className="font-medium text-ink">{p.name}</span>
              <span className="text-xs text-ink-faint">{p.team}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
