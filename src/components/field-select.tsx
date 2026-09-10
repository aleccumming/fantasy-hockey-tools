"use client";

export function FieldSelect({
  field,
  value,
  headers,
  sample,
  onChange,
}: {
  field: { key: string; label: string; required?: boolean };
  value: string;
  headers: string[];
  sample?: Record<string, string>;
  onChange: (col: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-dim">
      <span>
        {field.label}
        {field.required && <span className="text-rink-red"> *</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded border border-line bg-surface px-2 py-1 text-ink focus:border-rink-blue focus:outline-none"
      >
        <option value="">None</option>
        {headers.map((h) => {
          const example = sample?.[h]?.trim();
          return (
            <option key={h} value={h}>
              {h}
              {example ? ` (e.g. "${example}")` : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}
