"use client";

import { useSaveStatus } from "@/store/draft-store-provider";

export function SaveStatusIndicator() {
  const { status, retry } = useSaveStatus();

  if (status === "idle") return null;

  if (status === "saving") {
    return <span className="text-xs text-ink-faint">Saving...</span>;
  }

  if (status === "saved") {
    return <span className="text-xs text-ink-faint">All changes saved</span>;
  }

  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-rink-red">
      Couldn&apos;t save your last change - it may only exist in this browser.
      <button onClick={retry} className="underline hover:no-underline">
        Retry
      </button>
    </span>
  );
}
