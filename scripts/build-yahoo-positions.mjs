// Converts a CSV of Yahoo player data (however you obtained it - exported,
// copy-pasted into a spreadsheet, etc.) into src/data/yahoo-positions.json,
// which the app bundles and applies automatically on every CSV import.
//
// Usage: npm run build:yahoo-positions -- path/to/file.csv
//
// Works with or without a header row. If there's no header, it assumes
// Name,Position for 2 columns or Name,Team,Position for 3 columns.

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const NAME_ALIASES = ["name", "player", "playername"];
const TEAM_ALIASES = ["team", "tm", "nhlteam"];
const POS_ALIASES = ["pos", "position", "positions"];
const VALID_POSITIONS = new Set(["C", "LW", "RW", "D", "G"]);

function normalize(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers, aliases) {
  return headers.find((h) => aliases.includes(normalize(h))) ?? null;
}

function looksLikeHeaderRow(row) {
  return row.some((cell) => {
    const norm = normalize(cell ?? "");
    return NAME_ALIASES.includes(norm) || TEAM_ALIASES.includes(norm) || POS_ALIASES.includes(norm);
  });
}

function parsePositions(raw) {
  return raw
    .toUpperCase()
    .split(/[,/;\s]+/)
    .map((p) => p.trim())
    .filter((p) => VALID_POSITIONS.has(p));
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npm run build:yahoo-positions -- path/to/file.csv");
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`File not found: ${resolvedInput}`);
    process.exit(1);
  }

  const outputPath = path.join(process.cwd(), "src", "data", "yahoo-positions.json");
  const csvText = fs.readFileSync(resolvedInput, "utf8");
  const rawRows = Papa.parse(csvText.trim(), { header: false, skipEmptyLines: true }).data;

  if (rawRows.length === 0) {
    console.error("No rows found in that file.");
    process.exit(1);
  }

  const hasHeader = looksLikeHeaderRow(rawRows[0]);
  let nameCol, teamCol, posCol, rows;

  if (hasHeader) {
    const headers = rawRows[0];
    nameCol = findColumn(headers, NAME_ALIASES);
    teamCol = findColumn(headers, TEAM_ALIASES);
    posCol = findColumn(headers, POS_ALIASES);
    if (!nameCol || !posCol) {
      console.error(`Couldn't find both a Name and a Position column.`);
      console.error(`Headers found: ${headers.join(", ")}`);
      console.error(
        `Expected a column matching one of: ${NAME_ALIASES.join("/")} for name, ${POS_ALIASES.join("/")} for position.`
      );
      process.exit(1);
    }
    rows = rawRows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  } else {
    const columnCount = Math.max(...rawRows.map((r) => r.length));
    if (columnCount === 2) {
      [nameCol, posCol] = ["0", "1"];
      teamCol = null;
    } else if (columnCount === 3) {
      [nameCol, teamCol, posCol] = ["0", "1", "2"];
    } else {
      console.error(
        `No header row detected (first row: "${rawRows[0].join(", ")}") and ${columnCount} columns found - ` +
          `can't guess which are Name/Position. Add a header row (e.g. "Name,Position") to your file.`
      );
      process.exit(1);
    }
    rows = rawRows.map((r) => Object.fromEntries(r.map((v, i) => [String(i), v ?? ""])));
    console.log(`No header row detected - assuming column order: ${[nameCol, teamCol, posCol].filter(Boolean).join(", ")} (Name${teamCol ? ", Team" : ""}, Position).`);
  }

  const results = {};
  let matched = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row[nameCol]?.trim();
    const posRaw = row[posCol]?.trim();
    if (!name || !posRaw) {
      skipped++;
      continue;
    }
    const positions = parsePositions(posRaw);
    if (positions.length === 0) {
      skipped++;
      continue;
    }
    results[name] = {
      team: teamCol ? (row[teamCol]?.trim().toUpperCase() ?? "") : "",
      positions,
    };
    matched++;
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Matched columns: Name="${nameCol}", Position="${posCol}"${teamCol ? `, Team="${teamCol}"` : ""}`);
  console.log(`Wrote ${matched} players to ${path.relative(process.cwd(), outputPath)} (${skipped} rows skipped - no name/position).`);
}

main();
