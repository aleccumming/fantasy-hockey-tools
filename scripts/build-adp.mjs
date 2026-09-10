// Converts a CSV of ADP (Average Draft Position) data into src/data/adp.json,
// which the app bundles and applies automatically on every CSV import (only
// filling in players that don't already have their own ADP).
//
// Usage: npm run build:adp -- path/to/file.csv
//
// Works with or without a header row. If there's no header, it assumes
// Name,ADP for 2 columns.

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const NAME_ALIASES = ["name", "player", "playername"];
const ADP_ALIASES = ["adp", "avgdraftposition"];

function normalize(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers, aliases) {
  return headers.find((h) => aliases.includes(normalize(h))) ?? null;
}

function looksLikeHeaderRow(row) {
  return row.some((cell) => {
    const norm = normalize(cell ?? "");
    return NAME_ALIASES.includes(norm) || ADP_ALIASES.includes(norm);
  });
}

function parseAdp(raw) {
  const cleaned = raw.trim().replace(/[,%]/g, "");
  if (!cleaned || cleaned.toUpperCase() === "N/A") return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npm run build:adp -- path/to/file.csv");
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`File not found: ${resolvedInput}`);
    process.exit(1);
  }

  const outputPath = path.join(process.cwd(), "src", "data", "adp.json");
  const csvText = fs.readFileSync(resolvedInput, "utf8");
  const rawRows = Papa.parse(csvText.trim(), { header: false, skipEmptyLines: true }).data;

  if (rawRows.length === 0) {
    console.error("No rows found in that file.");
    process.exit(1);
  }

  const hasHeader = looksLikeHeaderRow(rawRows[0]);
  let nameCol, adpCol, rows;

  if (hasHeader) {
    const headers = rawRows[0];
    nameCol = findColumn(headers, NAME_ALIASES);
    adpCol = findColumn(headers, ADP_ALIASES);
    if (!nameCol || !adpCol) {
      console.error(`Couldn't find both a Name and an ADP column.`);
      console.error(`Headers found: ${headers.join(", ")}`);
      console.error(
        `Expected a column matching one of: ${NAME_ALIASES.join("/")} for name, ${ADP_ALIASES.join("/")} for ADP.`
      );
      process.exit(1);
    }
    rows = rawRows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  } else {
    const columnCount = Math.max(...rawRows.map((r) => r.length));
    if (columnCount !== 2) {
      console.error(
        `No header row detected (first row: "${rawRows[0].join(", ")}") and ${columnCount} columns found - ` +
          `expected exactly 2 (Name,ADP). Add a header row (e.g. "Name,ADP") to your file.`
      );
      process.exit(1);
    }
    [nameCol, adpCol] = ["0", "1"];
    rows = rawRows.map((r) => Object.fromEntries(r.map((v, i) => [String(i), v ?? ""])));
    console.log("No header row detected - assuming column order: Name, ADP.");
  }

  const results = {};
  let matched = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row[nameCol]?.trim();
    const adpRaw = row[adpCol];
    if (!name) {
      skipped++;
      continue;
    }
    const adp = parseAdp(adpRaw ?? "");
    if (adp === undefined) {
      skipped++;
      continue;
    }
    results[name] = adp;
    matched++;
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Matched columns: Name="${nameCol}", ADP="${adpCol}"`);
  console.log(
    `Wrote ${matched} players to ${path.relative(process.cwd(), outputPath)} (${skipped} rows skipped - no name/ADP, e.g. "N/A").`
  );
}

main();
