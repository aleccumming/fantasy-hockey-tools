"use client";

import { useDraftStore } from "@/store/draft-store";

export function NotesPanel() {
  const notes = useDraftStore((s) => s.notes);
  const setNotes = useDraftStore((s) => s.setNotes);

  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">Notes</h3>
      <p className="mt-1 text-xs text-ink-faint">
        Strategy, sleepers, reminders - whatever&apos;s useful to have handy during the draft.
        Saved automatically along with everything else.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Target a goalie by round 8. Watch for injury news on..."
        rows={20}
        className="mt-3 w-full resize-y rounded border border-line bg-surface p-3 text-sm text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
      />
    </div>
  );
}
