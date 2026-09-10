/**
 * Case- and whitespace-insensitive, accent-insensitive name normalization
 * used to match player names across independently-sourced datasets (e.g.
 * "Tim Stützle" vs "Tim Stutzle", or differing capitalization).
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
