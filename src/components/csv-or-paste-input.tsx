"use client";

import { useRef, useState } from "react";
import { parseCsvFile, parseCsvText, type ParsedCsv } from "@/lib/csv";

type Mode = "file" | "paste";

/** Every place that imports tabular data (main player rankings, ranking
 *  sources, ADP sources) should offer the same two ways in - a file upload
 *  and a paste-in textarea - rather than each one arbitrarily picking just
 *  one. `defaultMode` lets each caller keep whichever was already its
 *  primary path as the initial view. */
export function CsvOrPasteInput({
  onParsed,
  defaultMode = "file",
  pastePlaceholder = "Paste CSV or tab-separated data here",
}: {
  onParsed: (parsed: ParsedCsv, sourceLabel: string) => void;
  defaultMode?: Mode;
  pastePlaceholder?: string;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [pastedText, setPastedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const result = await parseCsvFile(file);
      if (result.rows.length === 0) {
        setError("No rows found in that file.");
        return;
      }
      onParsed(result, file.name);
    } catch {
      setError("Couldn't parse that file. Make sure it's a valid CSV.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleParsePaste() {
    setError(null);
    if (!pastedText.trim()) return;
    const result = parseCsvText(pastedText);
    if (result.rows.length === 0) {
      setError("Couldn't find any rows in that paste.");
      return;
    }
    onParsed(result, "pasted data");
    setPastedText("");
  }

  return (
    <div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`rounded px-2 py-1 text-xs font-semibold ${
            mode === "file"
              ? "bg-rink-blue text-white"
              : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          }`}
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`rounded px-2 py-1 text-xs font-semibold ${
            mode === "paste"
              ? "bg-rink-blue text-white"
              : "border border-line bg-surface text-ink-dim hover:border-rink-blue hover:text-rink-blue"
          }`}
        >
          Paste data
        </button>
      </div>

      {mode === "file" ? (
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="mt-2 block w-full text-sm text-ink-faint file:mr-3 file:rounded file:border-0 file:bg-rink-blue file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-rink-blue-dark"
        />
      ) : (
        <div className="mt-2 space-y-2">
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={pastePlaceholder}
            rows={5}
            className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-rink-blue focus:outline-none"
          />
          <button
            type="button"
            onClick={handleParsePaste}
            disabled={!pastedText.trim()}
            className="rounded bg-rink-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-rink-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Parse pasted data
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rink-red">{error}</p>}
    </div>
  );
}
