/** Client-side filters for board game library rows (`BoardgameData`-like objects). */

function optInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && v.trim()) {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function optFloat(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function stringArrayField(row: Record<string, unknown>, key: string): string[] {
  const v = row[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

export type BoardgameAvailabilityFilter = 'any' | 'available' | 'unavailable';

export type BoardgameClientFilterState = {
  playersMin: number | null;
  playersMax: number | null;
  playTimeMin: number | null;
  playTimeMax: number | null;
  minAgeMax: number | null;
  complexityMin: number;
  complexityMax: number;
  types: string[];
  typesExclude: string[];
  categories: string[];
  mechanics: string[];
  mechanicsExclude: string[];
  availability: BoardgameAvailabilityFilter;
};

export const DEFAULT_BOARDGAME_FILTERS: BoardgameClientFilterState = {
  playersMin: null,
  playersMax: null,
  playTimeMin: null,
  playTimeMax: null,
  minAgeMax: null,
  complexityMin: 1,
  complexityMax: 5,
  types: [],
  typesExclude: [],
  categories: [],
  mechanics: [],
  mechanicsExclude: [],
  availability: 'any',
};

const CMP_EPS = 1e-6;

function playerRangeOverlaps(
  row: Record<string, unknown>,
  fMin: number | null,
  fMax: number | null,
): boolean {
  if (fMin == null && fMax == null) return true;
  const gMin = optInt(row.minPlayers) ?? 1;
  const gMax = optInt(row.maxPlayers) ?? 99;
  if (gMin > gMax) return true;
  const uMin = fMin ?? 1;
  const uMax = fMax ?? 99;
  if (uMin > uMax) return true;
  return Math.max(gMin, uMin) <= Math.min(gMax, uMax);
}

function playTimeOverlaps(
  row: Record<string, unknown>,
  fMin: number | null,
  fMax: number | null,
): boolean {
  if (fMin == null && fMax == null) return true;
  const tMin = optInt(row.minPlayingTime);
  const tMax = optInt(row.maxPlayingTime);
  const avg = optInt(row.avgPlayingTime);
  let low = tMin ?? avg ?? tMax;
  let high = tMax ?? avg ?? tMin;
  if (low == null && high == null) return true;
  if (low == null) low = high!;
  if (high == null) high = low;
  if (low > high) [low, high] = [high, low];
  const uMin = fMin ?? 0;
  const uMax = fMax ?? 1_000_000;
  return Math.max(low, uMin) <= Math.min(high, uMax);
}

function minAgeMatches(row: Record<string, unknown>, maxMinAge: number | null): boolean {
  if (maxMinAge == null) return true;
  const age = optInt(row.minAge);
  if (age == null) return true;
  return age <= maxMinAge;
}

function complexityMatches(
  row: Record<string, unknown>,
  cMin: number,
  cMax: number,
  filterActive: boolean,
): boolean {
  if (!filterActive) return true;
  const c = optFloat(row.complexity);
  if (c == null) return false;
  return c + CMP_EPS >= cMin && c - CMP_EPS <= cMax;
}

function tagMatches(selected: string[], rowValues: string[]): boolean {
  if (selected.length === 0) return true;
  if (rowValues.length === 0) return false;
  const set = new Set(rowValues);
  return selected.some((s) => set.has(s));
}

/** True when the row lists at least one tag from `excluded` (those rows are filtered out). */
function rowHasAnyExcludedTag(excluded: string[], rowValues: string[]): boolean {
  if (excluded.length === 0) return false;
  const rowSet = new Set(rowValues);
  return excluded.some((s) => rowSet.has(s));
}

function availabilityMatches(row: Record<string, unknown>, mode: BoardgameAvailabilityFilter): boolean {
  if (mode === 'any') return true;
  const copies = optInt(row.numCopies);
  if (mode === 'available') return copies != null && copies >= 1;
  return copies === 0;
}

export function isComplexityFilterActive(f: BoardgameClientFilterState): boolean {
  return f.complexityMin > 1 + CMP_EPS || f.complexityMax < 5 - CMP_EPS;
}

export function filterBoardgames(
  games: Record<string, unknown>[],
  f: BoardgameClientFilterState,
): Record<string, unknown>[] {
  const complexityOn = isComplexityFilterActive(f);
  return games.filter((row) => {
    if (!playerRangeOverlaps(row, f.playersMin, f.playersMax)) return false;
    if (!playTimeOverlaps(row, f.playTimeMin, f.playTimeMax)) return false;
    if (!minAgeMatches(row, f.minAgeMax)) return false;
    if (!complexityMatches(row, f.complexityMin, f.complexityMax, complexityOn)) return false;
    if (!tagMatches(f.types, stringArrayField(row, 'gameTypes'))) return false;
    if (rowHasAnyExcludedTag(f.typesExclude, stringArrayField(row, 'gameTypes'))) return false;
    if (!tagMatches(f.categories, stringArrayField(row, 'categories'))) return false;
    if (!tagMatches(f.mechanics, stringArrayField(row, 'mechanics'))) return false;
    if (rowHasAnyExcludedTag(f.mechanicsExclude, stringArrayField(row, 'mechanics'))) return false;
    if (!availabilityMatches(row, f.availability)) return false;
    return true;
  });
}

export function collectBoardgameFilterOptions(games: Record<string, unknown>[]): {
  typeOptions: string[];
  categoryOptions: string[];
  mechanicOptions: string[];
} {
  const types = new Set<string>();
  const categories = new Set<string>();
  const mechanics = new Set<string>();
  for (const row of games) {
    stringArrayField(row, 'gameTypes').forEach((t) => types.add(t));
    stringArrayField(row, 'categories').forEach((t) => categories.add(t));
    stringArrayField(row, 'mechanics').forEach((t) => mechanics.add(t));
  }
  return {
    typeOptions: [...types].sort((a, b) => a.localeCompare(b)),
    categoryOptions: [...categories].sort((a, b) => a.localeCompare(b)),
    mechanicOptions: [...mechanics].sort((a, b) => a.localeCompare(b)),
  };
}

export function boardgameFiltersActive(f: BoardgameClientFilterState): boolean {
  if (f.playersMin != null || f.playersMax != null) return true;
  if (f.playTimeMin != null || f.playTimeMax != null) return true;
  if (f.minAgeMax != null) return true;
  if (isComplexityFilterActive(f)) return true;
  if (f.types.length > 0 || f.typesExclude.length > 0 || f.categories.length > 0) return true;
  if (f.mechanics.length > 0 || f.mechanicsExclude.length > 0) return true;
  if (f.availability !== 'any') return true;
  return false;
}
