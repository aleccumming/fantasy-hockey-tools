"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { partializeDraftState, type DraftPersistedState } from "@/lib/draft-state";
import { createDraftStore, DraftStoreContext } from "./draft-store";

const SAVE_DEBOUNCE_MS = 1000;
// A live-synced draft is naturally slow (picks land minutes to hours apart),
// so there's no responsiveness reason to poll fast - only cost is unneeded
// requests/DB load over an hours-long draft. This still surfaces a pick
// well within a human's notice.
const POLL_INTERVAL_MS = 20000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const SaveStatusContext = createContext<{ status: SaveStatus; retry: () => void } | null>(null);

/** Read from the nearest DraftStoreProvider whether the draft's last local
 *  change has been saved to the server yet, plus a way to retry a failed
 *  save. Returns "idle"/a no-op retry outside a provider rather than
 *  throwing, since a save-status indicator is optional chrome, not core
 *  functionality any call site should be forced to guard for. */
export function useSaveStatus(): { status: SaveStatus; retry: () => void } {
  const ctx = useContext(SaveStatusContext);
  return ctx ?? { status: "idle", retry: () => {} };
}

/** Render with `key={draftId}` at the call site so switching drafts remounts
 *  this component - that's what makes the lazy useState initializer below
 *  safe (it only ever runs once per draft, not once per component lifetime
 *  across draft changes). */
export function DraftStoreProvider({
  draftId,
  initialState,
  children,
}: {
  draftId: string;
  initialState: DraftPersistedState;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createDraftStore(draftId, initialState));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const save = useCallback(
    async (state: DraftPersistedState) => {
      setSaveStatus("saving");
      try {
        const res = await fetch(`/api/drafts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: partializeDraftState(state) }),
        });
        if (!res.ok) throw new Error("Save failed");
        setSaveStatus("saved");
      } catch {
        // The per-draft localStorage write from the persist middleware is
        // the fallback if this fails - but the user still needs to know a
        // change may not have made it to the server (and thus to any other
        // device/tab) so they can retry rather than assume it's safe.
        setSaveStatus("error");
      }
    },
    [draftId]
  );

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = store.subscribe((state) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        void save(state);
      }, SAVE_DEBOUNCE_MS);
    });

    return () => {
      if (timeout) clearTimeout(timeout);
      unsubscribe();
    };
  }, [store, save]);

  // Picks up picks made by the kkupfl live-sync relay, which writes to the
  // DB directly (it runs from a script on a different tab/origin, outside
  // any open copy of this store) - without this, an already-open tab would
  // never see those picks until manually reloaded.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/drafts/${draftId}`);
        if (!res.ok) return;
        const row = await res.json();
        const serverPicks = (row.state as DraftPersistedState).picks;
        const localPicks = store.getState().picks;
        if (JSON.stringify(serverPicks) !== JSON.stringify(localPicks)) {
          store.getState().applyServerPicks(serverPicks);
        }
      } catch {
        // Transient network error - just try again next tick.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [draftId, store]);

  return (
    <SaveStatusContext.Provider
      value={{ status: saveStatus, retry: () => void save(store.getState()) }}
    >
      <DraftStoreContext.Provider value={store}>{children}</DraftStoreContext.Provider>
    </SaveStatusContext.Provider>
  );
}
