import { yahooPositionsAvailable } from "@/lib/yahoo-positions-data";
import { adpAvailable } from "@/lib/adp-data";

function StatusLine({
  label,
  count,
  buildCommand,
}: {
  label: string;
  count: number;
  buildCommand: string;
}) {
  return (
    <p className="text-xs text-ink-faint">
      {label}:{" "}
      {count > 0 ? (
        <span className="text-ink-dim">{count} players</span>
      ) : (
        <span className="text-rink-gold">not generated yet</span>
      )}{" "}
      &mdash; run <code className="text-ink-dim">{buildCommand}</code> locally to{" "}
      {count > 0 ? "refresh it" : "create it"} (see README).
    </p>
  );
}

export function YahooCoverageStatus() {
  return (
    <div className="space-y-1">
      <StatusLine
        label="Yahoo positions dataset"
        count={yahooPositionsAvailable()}
        buildCommand="npm run build:yahoo-positions"
      />
      <StatusLine label="ADP dataset" count={adpAvailable()} buildCommand="npm run build:adp" />
    </div>
  );
}
