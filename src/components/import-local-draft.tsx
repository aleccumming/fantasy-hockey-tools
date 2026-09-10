"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { enrichPlayers } from "@/lib/enrich-players";
import { usePlayerUniverse } from "@/lib/use-player-universe";
import type { Player } from "@/lib/types";

const OLD_STORAGE_KEY = "fantasy-hockey-draft-assistant";

type ImportableState = Record<string, unknown> | null;

const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Cached by raw string so repeated getSnapshot() calls between actual
// localStorage changes return the same reference - useSyncExternalStore
// needs snapshot stability to avoid re-render loops.
let cachedRaw: string | null | undefined;
let cachedSnapshot: ImportableState = null;

function getSnapshot(): ImportableState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(OLD_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    const players = parsed?.state?.players;
    cachedSnapshot = Array.isArray(players) && players.length > 0 ? parsed.state : null;
  } catch {
    cachedSnapshot = null;
  }
  return cachedSnapshot;
}

function getServerSnapshot(): ImportableState {
  return null;
}

function clearLocalDraft() {
  try {
    localStorage.removeItem(OLD_STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}

export function ImportLocalDraft() {
  const router = useRouter();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const playerUniverse = usePlayerUniverse();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!state) return;
    setImporting(true);
    setError(null);
    try {
      const { players } = enrichPlayers(state.players as Player[], playerUniverse);
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Imported Draft", state: { ...state, players } }),
      });
      if (!res.ok) throw new Error("Failed to import");
      const row = await res.json();
      clearLocalDraft();
      router.push(`/draft/${row.id}`);
    } catch {
      setError("Couldn't import that draft. Try again.");
      setImporting(false);
    }
  }

  if (!state) return null;

  return (
    <div className="mb-4 rounded-md border-l-4 border-rink-gold bg-rink-gold-light px-4 py-3">
      <p className="text-sm text-ink">
        We found a draft saved in this browser from before accounts existed
        {Array.isArray(state.players) ? ` (${state.players.length} players)` : ""}.
      </p>
      {error && <p className="mt-1 text-xs text-rink-red">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleImport}
          disabled={importing}
          className="rounded bg-rink-gold px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importing ? "Importing..." : "Import it"}
        </button>
        <button
          onClick={clearLocalDraft}
          className="rounded border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
