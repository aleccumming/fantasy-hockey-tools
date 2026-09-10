"use client";

import { useRef, useState } from "react";
import {
  buildParsedCsv,
  buildPlayersFromRows,
  guessColumnMapping,
  parseCsvFile,
  type ParsedCsv,
} from "@/lib/csv";
import { useDraftStore } from "@/store/draft-store";
import { enrichPlayers } from "@/lib/enrich-players";
import { usePlayerUniverse } from "@/lib/use-player-universe";
import { FieldSelect } from "./field-select";

const CORE_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "name", label: "Player Name", required: true },
  { key: "team", label: "Team" },
  { key: "positions", label: "Position(s)" },
  { key: "rank", label: "Rank" },
  { key: "adp", label: "ADP" },
];

const STAT_FIELDS: { key: string; label: string }[] = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "ppp", label: "Power Play Points" },
  { key: "shp", label: "Short-Handed Points" },
  { key: "sog", label: "Shots on Goal" },
  { key: "hits", label: "Hits" },
  { key: "blocks", label: "Blocked Shots" },
  { key: "pim", label: "Penalty Minutes" },
  { key: "wins", label: "Wins (G)" },
  { key: "saves", label: "Saves (G)" },
  { key: "goalsAgainst", label: "Goals Against (G)" },
  { key: "shutouts", label: "Shutouts (G)" },
  { key: "otLosses", label: "OT Losses (G)" },
];

const TEMPLATE_CSV = `Rank,Name,Team,Pos
1,Connor McDavid,EDM,C
2,Nathan MacKinnon,COL,C
3,Cale Makar,COL,D
4,Auston Matthews,TOR,C
5,Nikita Kucherov,TBL,RW
`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ranking-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const setPlayers = useDraftStore((s) => s.setPlayers);
  const currentCount = useDraftStore((s) => s.players.length);
  const importNote = useDraftStore((s) => s.importNote);
  const setImportNote = useDraftStore((s) => s.setImportNote);
  const playerUniverse = usePlayerUniverse();

  async function handleFile(file: File) {
    setError(null);
    try {
      const result = await parseCsvFile(file);
      if (result.rows.length === 0) {
        setError("No rows found in that file.");
        return;
      }
      setParsed(result);
      setMapping(guessColumnMapping(result.detectedHeaderRow ? result.headers : []));
      setFileName(file.name);
    } catch {
      setError("Couldn't parse that file. Make sure it's a valid CSV.");
    }
  }

  function handleToggleHeaderRow(hasHeaderRow: boolean) {
    if (!parsed) return;
    const next = buildParsedCsv(parsed.rawRows, hasHeaderRow);
    setParsed(next);
    setMapping(guessColumnMapping(hasHeaderRow ? next.headers : []));
  }

  function handleConfirm() {
    if (!parsed) return;
    const initialPlayers = buildPlayersFromRows(parsed.rows, mapping);
    const { players, notes } = enrichPlayers(initialPlayers, playerUniverse);

    setPlayers(players);
    setImportNote(notes.length > 0 ? notes.join(". ") + "." : null);

    setParsed(null);
    setFileName("");
  }

  function handleCancel() {
    setParsed(null);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (parsed) {
    return (
      <div className="rounded-md border border-line bg-surface p-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
          Map columns from {fileName} ({parsed.rows.length} rows)
        </h3>
        <p className="mt-1 text-xs text-ink-dim">
          We guessed matches where possible &mdash; adjust any that are wrong, and leave
          fields as &quot;None&quot; if your file doesn&apos;t have that column. Only Player
          Name is required; without a Rank column we&apos;ll use the row order in your file
          as the ranking.
        </p>

        <label className="mt-3 flex items-center gap-1.5 text-xs text-ink-dim">
          <input
            type="checkbox"
            checked={parsed.detectedHeaderRow}
            onChange={(e) => handleToggleHeaderRow(e.target.checked)}
            className="accent-rink-blue"
          />
          My file&apos;s first row is a header (column labels, not a player)
        </label>
        {!parsed.detectedHeaderRow && (
          <p className="mt-1 text-xs text-rink-gold">
            No header row detected &mdash; row 1 looked like player data, so it&apos;s
            included below as &quot;Column 1, Column 2, ...&quot;. Check the box above if
            that&apos;s wrong.
          </p>
        )}

        <p className="mt-4 text-xs font-semibold text-ink-dim">
          Preview &mdash; double-check your data made it in correctly:
        </p>
        <div className="mt-1 overflow-x-auto rounded border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line bg-ice text-left text-ink-faint">
                {parsed.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-1 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, 6).map((row, i) => (
                <tr key={i} className="border-b border-stripe last:border-0">
                  {parsed.headers.map((h) => (
                    <td key={h} className="whitespace-nowrap px-2 py-1 text-ink-dim">
                      {row[h] || <span className="text-ink-faint">&mdash;</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {parsed.rows.length > 6 && (
          <p className="mt-1 text-xs text-ink-faint">
            +{parsed.rows.length - 6} more row{parsed.rows.length - 6 === 1 ? "" : "s"} not shown
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {CORE_FIELDS.map((field) => (
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

        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-ink-dim hover:text-ink">
            Stat projections (optional &mdash; for scoring &amp; VOR, can be added later)
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {STAT_FIELDS.map((field) => (
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
        </details>
        {error && <p className="mt-3 text-xs text-rink-red">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={!mapping.name}
            className="rounded bg-rink-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-rink-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import {parsed.rows.length} players
          </button>
          <button
            onClick={handleCancel}
            className="rounded border border-line px-3 py-1.5 text-sm font-semibold text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-line bg-surface p-6 text-center">
      <p className="text-sm text-ink-dim">
        {currentCount > 0
          ? `${currentCount} players loaded. Upload a new CSV to replace them.`
          : "Upload a CSV of your player rankings to get started."}
      </p>
      {importNote && <p className="mt-1 text-xs text-ink-faint">{importNote}</p>}
      <p className="mx-auto mt-2 max-w-md text-xs text-ink-faint">
        One row per player. A <span className="text-ink-dim">Name</span> column is all
        that&apos;s required &mdash; add <span className="text-ink-dim">Rank</span>,{" "}
        <span className="text-ink-dim">Team</span>, and{" "}
        <span className="text-ink-dim">Pos</span> if you have them. We auto-detect common
        header names, and you can fix the mapping after uploading.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="mt-3 block w-full text-sm text-ink-faint file:mr-3 file:rounded file:border-0 file:bg-rink-blue file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-rink-blue-dark"
      />
      <button
        onClick={downloadTemplate}
        className="mt-2 text-xs text-ink-faint underline hover:text-rink-blue"
      >
        Download an example CSV
      </button>
      {error && <p className="mt-3 text-xs text-rink-red">{error}</p>}
    </div>
  );
}
