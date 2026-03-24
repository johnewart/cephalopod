import { describe, expect, it } from 'vitest';
import {
  boardgameBoolField,
  boardgameIdFromRow,
  boardgameTitleFromRow,
  parseBoardgameListPayload,
} from './boardgameResponse';

describe('parseBoardgameListPayload', () => {
  it('returns empty defaults for null', () => {
    expect(parseBoardgameListPayload(null)).toEqual({
      games: [],
      total: 0,
      start: 0,
      limit: 50,
    });
  });

  it('reads gameArray and paginator', () => {
    const data = {
      gameArray: [{ gameID: 'abc', gameName: 'Catan' }],
      paginator: { total: 42, start: 0, limit: 50 },
    };
    const r = parseBoardgameListPayload(data);
    expect(r.games).toHaveLength(1);
    expect(r.games[0]?.gameName).toBe('Catan');
    expect(r.total).toBe(42);
    expect(r.start).toBe(0);
    expect(r.limit).toBe(50);
  });

  it('filters non-objects from gameArray', () => {
    const data = {
      gameArray: [{ gameID: 'x' }, null, 'bad'],
      paginator: { total: 1, start: 0, limit: 10 },
    };
    expect(parseBoardgameListPayload(data).games).toHaveLength(1);
  });
});

describe('boardgameIdFromRow', () => {
  it('prefers gameID', () => {
    expect(boardgameIdFromRow({ gameID: '  u1 ', gameId: 'u2' })).toBe('u1');
  });

  it('falls back to gameId and id', () => {
    expect(boardgameIdFromRow({ gameId: 'g2' })).toBe('g2');
    expect(boardgameIdFromRow({ id: 'g3' })).toBe('g3');
  });
});

describe('boardgameTitleFromRow', () => {
  it('uses gameName', () => {
    expect(boardgameTitleFromRow({ gameName: ' Wingspan ' })).toBe('Wingspan');
  });

  it('falls back to id label', () => {
    expect(boardgameTitleFromRow({ gameID: 'abc' })).toBe('Game abc');
  });
});

describe('boardgameBoolField', () => {
  it('reads first matching boolean key', () => {
    expect(boardgameBoolField({ isFavorite: true, a: false }, ['isFavorite', 'a'])).toBe(true);
    expect(boardgameBoolField({ isFavorite: false }, ['isFavorite'])).toBe(false);
  });

  it('returns false when absent', () => {
    expect(boardgameBoolField({}, ['isFavorite'])).toBe(false);
  });
});
