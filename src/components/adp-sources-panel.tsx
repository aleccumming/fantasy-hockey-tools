"use client";

import { useState } from "react";
import { guessColumnMapping, type ParsedCsv } from "@/lib/csv";
import { useDraftStore } from "@/store/draft-store";
import { FieldSelect } from "./field-select";
import { CsvOrPasteInput } from "./csv-or-paste-input";

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "name", label: "Player Name", required: true },
  { key: "adp", label: "ADP", required: true },
];

export function AdpSourcesPanel() {
  const adpSources = useDraftStore((s) => s.adpSources);
  const activeAdpSourceId = useDraftStore((s) => s.activeAdpSourceId);
  const addAdpSource = useDraftStore((s) => s.addAdpSource);
  const removeAdpSource = useDraftStore((s) => s.removeAdpSource);
  const setActiveAdpSource = useDraftStore((s) => s.setActiveAdpSource);

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
    if (!parsed || !mapping.name || !mapping.adp || !label.trim()) return;

    const nameCol = mapping.name;
    const adpCol = mapping.adp;
    const entries: { name: string; adp: number }[] = [];

    for (const row of parsed.rows) {
      const name = row[nameCol]?.trim();
      const adpRaw = row[adpCol]?.trim();
      if (!name || !adpRaw) continue;
      const adp = Number(adpRaw.replace(/[,%]/g, ""));
      if (!Number.isFinite(adp)) continue;
      entries.push({ name, adp });
    }

    const sourceName = label.trim();
    addAdpSource(sourceName, entries);
    setMessage(`Added "${sourceName}" with ${entries.length} players.`);
    setLabel("");
    handleReset();
  }

  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
        ADP Sources <span className="font-sans font-normal normal-case text-ink-faint">(optional)</span>
      </h3>
      <p className="mt-1 text-xs text-ink-dim">
        Different drafts sometimes need a different ADP (a points league draws differently than
        categories, say). The bundled default is used unless you add an alternate here and select
        it as active for this draft.
      </p>

      <div className="mt-3 space-y-1">
        <label className="flex items-center justify-between rounded bg-ice px-2 py-1.5 text-xs">
          <span className="flex items-center gap-2 text-ink">
            <input
              type="radio"
              name="active-adp-source"
              checked={activeAdpSourceId === null}
              onChange={() => setActiveAdpSource(null)}
              className="accent-rink-blue"
            />
            Default (bundled)
          </span>
        </label>
        {adpSources.map((s) => (
          <label
            key={s.id}
            className="flex items-center justify-between rounded bg-ice px-2 py-1.5 text-xs"
          >
            <span className="flex items-center gap-2 text-ink">
              <input
                type="radio"
                name="active-adp-source"
                checked={activeAdpSourceId === s.id}
                onChange={() => setActiveAdpSource(s.id)}
                className="accent-rink-blue"
              />
              {s.name} <span className="text-ink-faint">({s.entries.length} players)</span>
            </span>
            <button
              onClick={() => removeAdpSource(s.id)}
              className="text-ink-faint hover:text-rink-red"
            >
              remove
            </button>
          </label>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder='Source name, e.g. "Points League ADP"'
          className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
        />

        {!parsed ? (
          <CsvOrPasteInput
            onParsed={handleParsed}
            defaultMode="paste"
            pastePlaceholder={"Paste ADP data here, e.g.:\nConnor McDavid\t1.8\nNathan MacKinnon\t1.3"}
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
                disabled={!mapping.name || !mapping.adp || !label.trim()}
                className="rounded bg-rink-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-rink-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add ADP source
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
