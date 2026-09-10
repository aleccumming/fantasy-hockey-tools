"use client";

import { useState } from "react";
import Link from "next/link";
import { CsvUpload } from "@/components/csv-upload";
import { SettingsPanel } from "@/components/settings-panel";
import { CheatSheet } from "@/components/cheat-sheet";
import { DraftBoard, OnTheClockBanner } from "@/components/draft-board";
import { MyTeam } from "@/components/my-team";
import { PickSuggestions } from "@/components/pick-suggestions";
import { SchedulePanel } from "@/components/schedule-panel";
import { ScheduleOverlapMatrix } from "@/components/schedule-overlap-matrix";
import { YahooCoverageStatus } from "@/components/yahoo-coverage-status";
import { RankingSourcesPanel } from "@/components/ranking-sources-panel";
import { AdpSourcesPanel } from "@/components/adp-sources-panel";
import { KkupflLiveSync } from "@/components/kkupfl-live-sync";
import { SaveStatusIndicator } from "@/components/save-status-indicator";
import { NotesPanel } from "@/components/notes-panel";
import { useDraftStore } from "@/store/draft-store";

type Tab = "overview" | "rankings" | "schedule" | "notes" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "rankings", label: "Rankings" },
  { key: "schedule", label: "Schedule" },
  { key: "notes", label: "Notes" },
  { key: "settings", label: "Settings" },
];

export function DraftWorkspace({ draftName }: { draftName: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const playerCount = useDraftStore((s) => s.players.length);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/draft" className="text-xs font-medium text-ink-faint hover:text-rink-blue">
          &larr; All Drafts
        </Link>
        <SaveStatusIndicator />
      </div>
      <h1 className="mt-1 font-display text-3xl font-extrabold uppercase tracking-wide text-ink">
        {draftName}
      </h1>
      <div className="mt-2 h-[3px] w-16 bg-rink-blue" />

      {playerCount === 0 ? (
        <div className="mt-6 max-w-xl">
          <CsvUpload />
        </div>
      ) : (
        <>
          <nav className="mt-6 flex gap-1 border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`border-b-2 px-3 py-2 text-sm font-semibold ${
                  tab === t.key
                    ? "border-rink-blue text-ink"
                    : "border-transparent text-ink-faint hover:text-ink-dim"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="mt-4">
            {tab === "overview" && (
              <div className="space-y-4">
                <OnTheClockBanner />
                <section>
                  <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-ink-dim">
                    Draft Board
                  </h2>
                  <DraftBoard />
                </section>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="lg:max-h-[75vh]">
                    <CheatSheet compact />
                  </div>
                  <div className="lg:max-h-[75vh]">
                    <MyTeam />
                  </div>
                  <div className="lg:max-h-[75vh]">
                    <PickSuggestions />
                  </div>
                </div>
              </div>
            )}
            {tab === "rankings" && <CheatSheet />}
            {tab === "schedule" && (
              <div className="space-y-4">
                <SchedulePanel />
                <ScheduleOverlapMatrix />
              </div>
            )}
            {tab === "notes" && <NotesPanel />}
            {tab === "settings" && (
              <div className="space-y-4">
                <CsvUpload />
                <YahooCoverageStatus />
                <RankingSourcesPanel />
                <AdpSourcesPanel />
                <SettingsPanel />
                <KkupflLiveSync />
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
