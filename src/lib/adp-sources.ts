import type { AdpSource } from "./types";
import { normalizeName } from "./name-matching";

/**
 * Overlays the active alternate ADP source's values onto each player's ADP
 * (which otherwise carries the bundled default, filled in at import time).
 * Falls back to the existing value for any player the active source doesn't
 * cover, so switching sources never creates gaps the default already filled.
 * A null/unknown active id leaves every player's ADP untouched.
 */
export function applyActiveAdpSource<T extends { name: string; adp?: number }>(
  players: T[],
  adpSources: AdpSource[],
  activeAdpSourceId: string | null
): T[] {
  if (!activeAdpSourceId) return players;
  const source = adpSources.find((s) => s.id === activeAdpSourceId);
  if (!source) return players;

  const index = new Map(source.entries.map((e) => [normalizeName(e.name), e.adp]));
  return players.map((p) => {
    const adp = index.get(normalizeName(p.name));
    return adp !== undefined ? { ...p, adp } : p;
  });
}
