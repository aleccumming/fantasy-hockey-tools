"use client";

import { useState } from "react";
import { guessColumnMapping, type ParsedCsv } from "@/lib/csv";
import { useDraftStore } from "@/store/draft-store";
import { FieldSelect } from "./field-select";
import { CsvOrPasteInput } from "./csv-or-paste-input";

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "name", label: "Player Name", required: true },
  { key: "rank", label: "Rank" },
];

export function RankingSourcesPanel() {
  const rankingSources = useDraftStore((s) => s.rankingSources);
  const addRankingSource = useDraftStore((s) => s.addRankingSource);
  const removeRankingSource = useDraftStore((s) => s.removeRankingSource);

  const [label, setLabel] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);

  function handleParsed(result: ParsedCsv) {
    setParsed(result);
    setMapping(guessColumnMapping(result.detectedHeaderRow ? result.headers : []));
    setMessage(null);
  }

  function handleReset() {
    setParsed(null);
    setMapping({});
  }

  function handleAdd() {
    if (!parsed || !mapping.name || !label.trim()) return;

    const nameCol = mapping.name;
    const rankCol = mapping.rank;
    const entries: { name: string; rank: number }[] = [];
    let nextFallbackRank = 1;

    for (const row of parsed.rows) {
      const name = row[nameCol]?.trim();
      if (!name) continue;
      // No Rank column mapped (or this row's cell doesn't parse)? Fall back
      // to the row's position in the list - most pasted/exported rankings
      // are already in ranked order.
      const rankRaw = rankCol ? row[rankCol]?.trim() : undefined;
      const parsedRank = rankRaw ? Number(rankRaw.replace(/[,%]/g, "")) : NaN;
      const rank = Number.isFinite(parsedRank) ? parsedRank : nextFallbackRank;
      nextFallbackRank += 1;
      entries.push({ name, rank });
    }

    const sourceName = label.trim();
    addRankingSource(sourceName, entries);
    setMessage(`Added "${sourceName}" with ${entries.length} players.`);
    setLabel("");
    handleReset();
  }

  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
        Additional Ranking Sources <span className="font-sans font-normal normal-case text-ink-faint">(optional)</span>
      </h3>
      <p className="mt-1 text-xs text-ink-dim">
        Add other rankings (a friend&apos;s list, another site&apos;s rankings) to see how each
        player stacks up across sources. They&apos;re matched to your main list by name and shown
        as extra columns on the Cheat Sheet, plus an Average Rank across your list and every
        source that has that player. Just a list of names, in order, is enough - a Rank column
        is optional, and without one we&apos;ll use each row&apos;s position in the list instead.
      </p>

      {rankingSources.length > 0 && (
        <ul className="mt-3 space-y-1">
          {rankingSources.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded bg-ice px-2 py-1.5 text-xs"
            >
              <span className="text-ink">
                {s.name} <span className="text-ink-faint">({s.entries.length} players)</span>
              </span>
              <button
                onClick={() => removeRankingSource(s.id)}
                className="text-ink-faint hover:text-rink-red"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder='Source name, e.g. "ESPN Rankings"'
          className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
        />

        {!parsed ? (
          <CsvOrPasteInput
            onParsed={handleParsed}
            defaultMode="paste"
            pastePlaceholder={"Paste a list of names (in order), e.g.:\nConnor McDavid\nNathan MacKinnon\nCale Makar"}
          />
        ) : (
          <>
            <p className="text-xs text-ink-faint">{parsed.rows.length} rows parsed.</p>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((field) => (
                <FieldSelect
                  key={field.key}
                  field={field}
                  value={mapping[field.key] ?? ""}
                  headers={parsed.headers}
                  sample={parsed.rows[0]}
                  onChange={(col) => setMapping((m) => ({ ...m, [field.key]: col }))}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!mapping.name || !label.trim()}
                className="rounded bg-rink-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-rink-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add ranking source
              </button>
              <button
                onClick={handleReset}
                className="rounded border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
              >
                Start over
              </button>
            </div>
          </>
        )}
      </div>

      {message && <p className="mt-2 text-xs text-ink-dim">{message}</p>}
    </section>
  );
}
