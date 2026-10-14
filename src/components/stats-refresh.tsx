"use client";

import { useState, useSyncExternalStore } from "react";
import type { NstCacheId } from "@/lib/nst-data-cache";

// A clock that ticks once a minute, so "Updated 5 min ago" keeps counting
// without calling Date.now() during render.
let now = Date.now();
const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;

function subscribeNow(listener: () => void) {
  nowListeners.add(listener);
  if (!nowTimer) {
    nowTimer = setInterval(() => {
      now = Date.now();
      nowListeners.forEach((l) => l());
    }, 60 * 1000);
  }
  return () => {
    nowListeners.delete(listener);
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

function formatAge(updatedAt: string, at: number): string {
  const minutes = Math.max(0, Math.round((at - new Date(updatedAt).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

type Status = { kind: "idle" } | { kind: "refreshing" } | { kind: "message"; text: string; isError?: boolean };

/** "Updated 3 hrs ago · Refresh" for a banner over NST-backed data. Refresh
 *  pulls that dataset from NST now (see /api/refresh-stats), then calls
 *  onRefreshed so the page refetches the new rows. */
export function StatsRefresh({
  dataset,
  computedAt,
  onRefreshed,
}: {
  dataset: NstCacheId;
  computedAt: string | null;
  onRefreshed: () => void;
}) {
  const at = useSyncExternalStore(subscribeNow, () => now, () => now);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function refresh() {
    setStatus({ kind: "refreshing" });
    try {
      const res = await fetch("/api/refresh-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset }),
      });
      const json = (await res.json().catch(() => ({}))) as { refreshed?: boolean; error?: string };
      if (!res.ok) {
        setStatus({ kind: "message", text: json.error ?? "Refresh failed", isError: true });
        return;
      }
      setStatus(
        json.refreshed
          ? { kind: "idle" }
          : { kind: "message", text: "Already refreshed in the last 10 minutes." }
      );
      onRefreshed();
    } catch {
      setStatus({ kind: "message", text: "Refresh failed - check your connection.", isError: true });
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {computedAt && (
        <span title={new Date(computedAt).toLocaleString()}>Updated {formatAge(computedAt, Math.max(at, now))}.</span>
      )}
      <button
        onClick={refresh}
        disabled={status.kind === "refreshing"}
        className="inline-flex items-center gap-1 rounded border border-rink-blue px-2 py-0.5 text-xs font-semibold text-rink-blue hover:bg-rink-blue hover:text-white disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-rink-blue"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={status.kind === "refreshing" ? "animate-spin" : undefined}
          aria-hidden="true"
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </svg>
        {status.kind === "refreshing" ? "Refreshing..." : "Refresh"}
      </button>
      {status.kind === "refreshing" && (
        <span className="text-xs text-ink-faint">Pulling from Natural Stat Trick - can take a minute.</span>
      )}
      {status.kind === "message" && (
        <span className={`text-xs ${status.isError ? "text-rink-red" : "text-ink-faint"}`}>{status.text}</span>
      )}
    </span>
  );
}
