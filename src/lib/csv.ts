import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";
import type { Player, Position } from "./types";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
  detectedHeaderRow: boolean;
}

// field key -> candidate header names (lowercased, punctuation-stripped)
const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "player", "playername"],
  team: ["team", "tm", "nhlteam"],
  positions: ["pos", "position", "positions"],
  rank: ["rank", "ranking", "rk", "overallrank", "ovr", "myrank"],
  adp: ["adp", "avgdraftposition"],
  goals: ["g", "goals"],
  assists: ["a", "assists"],
  points: ["pts", "points"],
  ppp: ["ppp", "powerplaypoints"],
  shp: ["shp", "shorthandedpoints"],
  sog: ["sog", "shots", "shotsongoal"],
  hits: ["hit", "hits"],
  blocks: ["blk", "blocks", "blockedshots"],
  pim: ["pim", "penaltyminutes"],
  plusMinus: ["plusminus", "+/-"],
  wins: ["w", "wins"],
  losses: ["l", "losses"],
  saves: ["sv", "saves"],
  goalsAgainst: ["ga", "goalsagainst"],
  gaa: ["gaa", "goalsagainstaverage"],
  svPct: ["svpct", "sv%", "savepercentage"],
  shutouts: ["so", "shutouts"],
  otLosses: ["otl", "otlosses"],
};

const HEADER_ALIAS_WORDS = new Set(Object.values(FIELD_ALIASES).flat());

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9%+/]/g, "");
}

function isNumericCell(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return Number.isFinite(Number(trimmed.replace(/[%,]/g, "")));
}

/**
 * Header rows are almost always short recognizable text labels, never
 * numbers. We only call a row a header when we have real evidence:
 *  - any numeric-looking cell => definitely data (a rank, a stat, ...)
 *  - otherwise, only call it a header if at least two cells match a known
 *    column label (Name, Team, Pos, Rank, ...). A plain "Nathan MacKinnon,
 *    COL, C" data row won't match any of these, so it's correctly kept as
 *    data instead of being silently swallowed as a fake header.
 * When neither signal is conclusive we default to "no header" - worst case
 * that adds one obviously-fake row at the top of the list (easy to spot and
 * fix with the checkbox), which is far better than silently dropping a real
 * player buried in a long list.
 */
function looksLikeHeaderRow(row: string[]): boolean {
  const cells = row.map((c) => c.trim()).filter((c) => c !== "");
  if (cells.length === 0) return false;
  if (cells.some(isNumericCell)) return false;

  const aliasMatches = cells.filter((c) => HEADER_ALIAS_WORDS.has(normalize(c))).length;
  return aliasMatches >= 2 || (aliasMatches >= 1 && cells.length <= 2);
}

export function buildParsedCsv(rawRows: string[][], hasHeaderRow: boolean): ParsedCsv {
  if (rawRows.length === 0) {
    return { headers: [], rows: [], rawRows, detectedHeaderRow: hasHeaderRow };
  }

  const columnCount = Math.max(...rawRows.map((r) => r.length));
  const headers = hasHeaderRow
    ? Array.from({ length: columnCount }, (_, i) => rawRows[0][i]?.trim() || `Column ${i + 1}`)
    : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
  const dataRows = hasHeaderRow ? rawRows.slice(1) : rawRows;

  const rows = dataRows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? "";
    });
    return obj;
  });

  return { headers, rows, rawRows, detectedHeaderRow: hasHeaderRow };
}

function finalizeRawRows(rawRows: string[][]): ParsedCsv {
  const detected = rawRows.length > 0 ? looksLikeHeaderRow(rawRows[0]) : true;
  return buildParsedCsv(rawRows, detected);
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => resolve(finalizeRawRows(results.data)),
      error: (err: Error) => reject(err),
    });
  });
}

/** Parses pasted table data (e.g. copied straight out of a browser table -
 *  Papa auto-detects tab vs comma delimiting) using the same logic as file
 *  upload, including header-row detection. */
export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text.trim(), { header: false, skipEmptyLines: true });
  return finalizeRawRows(result.data);
}

export function guessColumnMapping(
  headers: string[]
): Record<string, string | null> {
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalize(h) }));
  const mapping: Record<string, string | null> = {};

  for (const field of Object.keys(FIELD_ALIASES)) {
    const aliases = FIELD_ALIASES[field];
    const match = normalizedHeaders.find((h) => aliases.includes(h.norm));
    mapping[field] = match ? match.raw : null;
  }

  return mapping;
}

const POSITION_TOKEN_MAP: Record<string, Position> = {
  C: "C",
  LW: "LW",
  L: "LW",
  RW: "RW",
  R: "RW",
  W: "LW",
  D: "D",
  DEF: "D",
  G: "G",
};

export function parsePositions(raw: string): Position[] {
  if (!raw) return [];
  const tokens = raw
    .toUpperCase()
    .split(/[,/;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const positions = new Set<Position>();
  for (const token of tokens) {
    const mapped = POSITION_TOKEN_MAP[token];
    if (mapped) positions.add(mapped);
  }
  return Array.from(positions);
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === null || value.trim() === "") return undefined;
  const cleaned = value.replace(/[%,]/g, "");
  const num = Number(cleaned);
  return Number.isNaN(num) ? undefined : num;
}

const NON_STAT_FIELDS = ["name", "team", "positions", "rank", "adp"];

export function buildPlayersFromRows(
  rows: Record<string, string>[],
  mapping: Record<string, string | null>
): Player[] {
  const statFields = Object.keys(mapping).filter((f) => !NON_STAT_FIELDS.includes(f));

  let nextFallbackRank = 1;

  return rows
    .map((row): Player | null => {
      const nameCol = mapping.name;
      const name = nameCol ? row[nameCol]?.trim() : "";
      if (!name) return null;

      const teamCol = mapping.team;
      const posCol = mapping.positions;
      const rankCol = mapping.rank;
      const adpCol = mapping.adp;

      const stats: Record<string, number> = {};
      for (const field of statFields) {
        const col = mapping[field];
        if (!col) continue;
        const num = toNumber(row[col]);
        if (num !== undefined) stats[field] = num;
      }

      // No explicit Rank column? Fall back to the row's position in the
      // file - most exported cheat sheets are already in ranked order.
      const rank = (rankCol ? toNumber(row[rankCol]) : undefined) ?? nextFallbackRank;
      nextFallbackRank += 1;

      return {
        id: uuidv4(),
        name,
        team: teamCol ? (row[teamCol]?.trim().toUpperCase() ?? "") : "",
        positions: posCol ? parsePositions(row[posCol]) : [],
        stats,
        rank,
        adp: adpCol ? toNumber(row[adpCol]) : undefined,
      };
    })
    .filter((p): p is Player => p !== null);
}
