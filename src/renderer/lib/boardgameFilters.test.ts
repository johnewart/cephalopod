import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOARDGAME_FILTERS,
  boardgameFiltersActive,
  collectBoardgameFilterOptions,
  filterBoardgames,
  isComplexityFilterActive,
} from './boardgameFilters';

const baseRow: Record<string, unknown> = {
  gameName: 'Test',
  minPlayers: 2,
  maxPlayers: 4,
  minPlayingTime: 30,
  maxPlayingTime: 60,
  avgPlayingTime: 45,
  minAge: 10,
  complexity: 2.5,
  gameTypes: ['Strategy'],
  categories: ['Economic'],
  mechanics: ['Auction'],
  numCopies: 2,
};

describe('filterBoardgames', () => {
  it('returns all when using defaults', () => {
    expect(filterBoardgames([baseRow], DEFAULT_BOARDGAME_FILTERS)).toHaveLength(1);
  });

  it('filters by player overlap', () => {
    const f = { ...DEFAULT_BOARDGAME_FILTERS, playersMin: 5, playersMax: 6 };
    expect(filterBoardgames([baseRow], f)).toHaveLength(0);
    expect(filterBoardgames([{ ...baseRow, maxPlayers: 6 }], f)).toHaveLength(1);
  });

  it('filters by play time overlap', () => {
    const f = { ...DEFAULT_BOARDGAME_FILTERS, playTimeMin: 5, playTimeMax: 15 };
    expect(filterBoardgames([baseRow], f)).toHaveLength(0);
    expect(filterBoardgames([{ ...baseRow, minPlayingTime: 10, maxPlayingTime: 20 }], f)).toHaveLength(1);
  });

  it('filters by max min age', () => {
    const f = { ...DEFAULT_BOARDGAME_FILTERS, minAgeMax: 8 };
    expect(filterBoardgames([baseRow], f)).toHaveLength(0);
    expect(filterBoardgames([{ ...baseRow, minAge: 8 }], f)).toHaveLength(1);
  });

  it('filters by complexity when active', () => {
    const f = { ...DEFAULT_BOARDGAME_FILTERS, complexityMin: 1, complexityMax: 2 };
    expect(filterBoardgames([baseRow], f)).toHaveLength(0);
    expect(filterBoardgames([{ ...baseRow, complexity: 1.8 }], f)).toHaveLength(1);
  });

  it('drops missing complexity when complexity filter is active', () => {
    const f = { ...DEFAULT_BOARDGAME_FILTERS, complexityMin: 1, complexityMax: 2 };
    expect(filterBoardgames([{ ...baseRow, complexity: undefined }], f)).toHaveLength(0);
  });

  it('filters types/categories/mechanics with OR within facet', () => {
    const f = { ...DEFAULT_BOARDGAME_FILTERS, categories: ['Economic', 'Fantasy'] };
    expect(filterBoardgames([baseRow], f)).toHaveLength(1);
    expect(filterBoardgames([{ ...baseRow, categories: ['Fantasy'] }], f)).toHaveLength(1);
    expect(filterBoardgames([{ ...baseRow, categories: ['Party'] }], f)).toHaveLength(0);
  });

  it('excludes rows that match any excluded type or mechanic', () => {
    expect(
      filterBoardgames([baseRow], { ...DEFAULT_BOARDGAME_FILTERS, typesExclude: ['Strategy'] }),
    ).toHaveLength(0);
    expect(
      filterBoardgames([baseRow], { ...DEFAULT_BOARDGAME_FILTERS, typesExclude: ['Party'] }),
    ).toHaveLength(1);
    expect(
      filterBoardgames([baseRow], { ...DEFAULT_BOARDGAME_FILTERS, mechanicsExclude: ['Auction'] }),
    ).toHaveLength(0);
    expect(
      filterBoardgames([baseRow], { ...DEFAULT_BOARDGAME_FILTERS, mechanicsExclude: ['Dice'] }),
    ).toHaveLength(1);
  });

  it('applies include and exclude for types together', () => {
    const f = {
      ...DEFAULT_BOARDGAME_FILTERS,
      types: ['Strategy'],
      typesExclude: ['Wargame'],
    };
    expect(filterBoardgames([baseRow], f)).toHaveLength(1);
    expect(filterBoardgames([{ ...baseRow, gameTypes: ['Strategy', 'Wargame'] }], f)).toHaveLength(0);
  });

  it('filters availability', () => {
    expect(
      filterBoardgames([{ ...baseRow, numCopies: 0 }], { ...DEFAULT_BOARDGAME_FILTERS, availability: 'available' }),
    ).toHaveLength(0);
    expect(
      filterBoardgames([{ ...baseRow, numCopies: 0 }], { ...DEFAULT_BOARDGAME_FILTERS, availability: 'unavailable' }),
    ).toHaveLength(1);
  });
});

describe('collectBoardgameFilterOptions', () => {
  it('collects sorted unique tags', () => {
    const o = collectBoardgameFilterOptions([
      { gameTypes: ['B'], categories: ['Y'], mechanics: ['M1'] },
      { gameTypes: ['A'], categories: ['X'], mechanics: ['M1', 'M2'] },
    ]);
    expect(o.typeOptions).toEqual(['A', 'B']);
    expect(o.categoryOptions).toEqual(['X', 'Y']);
    expect(o.mechanicOptions).toEqual(['M1', 'M2']);
  });
});

describe('isComplexityFilterActive / boardgameFiltersActive', () => {
  it('detects narrowed complexity', () => {
    expect(isComplexityFilterActive(DEFAULT_BOARDGAME_FILTERS)).toBe(false);
    expect(isComplexityFilterActive({ ...DEFAULT_BOARDGAME_FILTERS, complexityMax: 3 })).toBe(true);
  });

  it('detects any non-default axis', () => {
    expect(boardgameFiltersActive(DEFAULT_BOARDGAME_FILTERS)).toBe(false);
    expect(boardgameFiltersActive({ ...DEFAULT_BOARDGAME_FILTERS, playersMin: 2 })).toBe(true);
    expect(boardgameFiltersActive({ ...DEFAULT_BOARDGAME_FILTERS, typesExclude: ['X'] })).toBe(true);
    expect(boardgameFiltersActive({ ...DEFAULT_BOARDGAME_FILTERS, mechanicsExclude: ['Y'] })).toBe(true);
  });
});
