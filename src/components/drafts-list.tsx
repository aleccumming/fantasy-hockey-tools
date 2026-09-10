"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface DraftSummary {
  id: string;
  name: string;
  updatedAt: string;
}

function formatUpdatedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function DraftsList({ initialDrafts }: { initialDrafts: DraftSummary[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Failed to create draft");
      const row = await res.json();
      router.push(`/draft/${row.id}`);
    } catch {
      setError("Couldn't create a new draft. Try again.");
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this draft? This can't be undone.")) return;
    const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
    if (res.ok) setDrafts((ds) => ds.filter((d) => d.id !== id));
  }

  function startRename(d: DraftSummary) {
    setRenamingId(d.id);
    setRenameValue(d.name);
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    const res = await fetch(`/api/drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, name } : d)));
    }
    setRenamingId(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New draft name (optional)"
          className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
        />
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded bg-rink-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-rink-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating..." : "New Draft"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rink-red">{error}</p>}

      {drafts.length === 0 ? (
        <p className="mt-6 text-sm text-ink-dim">
          No drafts yet — create one above to get started.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {drafts.map((d) =>
            renamingId === d.id ? (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-md border border-rink-blue bg-surface px-4 py-2.5"
              >
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(d.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="flex-1 rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-rink-blue focus:outline-none"
                />
                <button
                  onClick={() => handleRename(d.id)}
                  className="rounded bg-rink-blue px-2.5 py-1 text-xs font-semibold text-white hover:bg-rink-blue-dark"
                >
                  Save
                </button>
                <button
                  onClick={() => setRenamingId(null)}
                  className="text-xs font-medium text-ink-faint hover:text-ink-dim"
                >
                  Cancel
                </button>
              </li>
            ) : (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3 hover:border-rink-blue"
              >
                <Link href={`/draft/${d.id}`} className="flex-1">
                  <span className="font-semibold text-ink">{d.name}</span>
                  <span className="ml-2 text-xs text-ink-faint">
                    updated {formatUpdatedAt(d.updatedAt)}
                  </span>
                </Link>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => startRename(d)}
                    className="text-xs font-medium text-ink-faint hover:text-rink-blue"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-xs font-medium text-ink-faint hover:text-rink-red"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
