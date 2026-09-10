import type { Player } from "./types";
import { normalizeName } from "./name-matching";

/** ActionCable's own housekeeping messages - never a real draft event. */
export function isIgnorableMessage(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return true;
  const type = (payload as { type?: unknown }).type;
  return type === "ping" || type === "welcome" || type === "confirm_subscription";
}

export interface PlayerIndex {
  byFullName: Map<string, Player>;
  /** kkupfl displays picks as "F. Last" (e.g. "N. MacKinnon"), not the full
   *  name - keyed the same way, but only for names that resolve to exactly
   *  one player, so two different players who happen to abbreviate the same
   *  way (rare, but possible with common surnames) never get silently
   *  confused for each other. */
  byAbbreviatedName: Map<string, Player>;
}

function abbreviatedKey(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return normalizeName(`${parts[0][0]}. ${parts[parts.length - 1]}`);
}

export function buildPlayerIndex(players: Player[]): PlayerIndex {
  const byFullName = new Map<string, Player>();
  const abbreviatedCounts = new Map<string, number>();
  const abbreviatedCandidate = new Map<string, Player>();

  for (const p of players) {
    byFullName.set(normalizeName(p.name), p);
    const key = abbreviatedKey(p.name);
    if (!key) continue;
    abbreviatedCounts.set(key, (abbreviatedCounts.get(key) ?? 0) + 1);
    abbreviatedCandidate.set(key, p);
  }

  const byAbbreviatedName = new Map<string, Player>();
  for (const [key, count] of abbreviatedCounts) {
    if (count === 1) byAbbreviatedName.set(key, abbreviatedCandidate.get(key)!);
  }

  return { byFullName, byAbbreviatedName };
}

/**
 * We don't know kkupfl's exact message shape for a pick event, so instead
 * of guessing field names, recursively scan the whole payload for any
 * string that matches a player already in the draft pool. Whatever kkupfl
 * calls the field, the player's name is almost certainly in there
 * somewhere as a plain string - either as its own value (the WebSocket
 * live-update path) or as one line within a larger blob of DOM text (the
 * catch-up path, which posts a results-table cell's full text split into
 * lines rather than the raw blob, since a whole "1-1 (1) / N. MacKinnon /
 * C - COL (auto)" string will never equal a player's name outright).
 */
export function findPlayerNameMatch(
  payload: unknown,
  index: PlayerIndex,
  depth = 0
): Player | null {
  if (depth > 6) return null;

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.length < 4) return null;
    const normalized = normalizeName(trimmed);
    return index.byFullName.get(normalized) ?? index.byAbbreviatedName.get(normalized) ?? null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const match = findPlayerNameMatch(item, index, depth + 1);
      if (match) return match;
    }
    return null;
  }
  if (payload && typeof payload === "object") {
    for (const value of Object.values(payload)) {
      const match = findPlayerNameMatch(value, index, depth + 1);
      if (match) return match;
    }
  }
  return null;
}
