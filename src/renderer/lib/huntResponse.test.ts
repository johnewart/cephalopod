import { describe, expect, it } from 'vitest';
import {
  huntCallInResultSummary,
  huntDescriptionFromRow,
  huntIdFromRow,
  huntTitleFromRow,
  parseHuntDetailPayload,
  parseHuntListItems,
  parseHuntPuzzleDetailPayload,
  puzzleIdFromRow,
  puzzleLooksSolved,
  puzzleTitleFromRow,
} from './huntResponse';

describe('parseHuntListItems', () => {
  it('returns empty for non-object', () => {
    expect(parseHuntListItems(null)).toEqual([]);
  });

  it('reads hunts array', () => {
    const data = {
      hunts: [
        { huntID: 'a', title: 'One', description: 'D1' },
        { huntID: 'b', title: 'Two', description: 'D2' },
      ],
    };
    expect(parseHuntListItems(data)).toHaveLength(2);
    expect(huntTitleFromRow(parseHuntListItems(data)[0]!)).toBe('One');
  });
});

describe('parseHuntDetailPayload', () => {
  it('parses puzzles and next unlock', () => {
    const data = {
      huntID: 'h1',
      title: 'Main',
      description: 'Desc',
      puzzles: [{ puzzleID: 'p1', title: 'P1', body: 'x' }],
      nextUnlockTime: '2026-01-01T00:00:00Z',
    };
    const r = parseHuntDetailPayload(data);
    expect(r.huntId).toBe('h1');
    expect(r.title).toBe('Main');
    expect(r.description).toBe('Desc');
    expect(r.puzzles).toHaveLength(1);
    expect(r.nextUnlockTime).toContain('2026');
  });
});

describe('huntIdFromRow', () => {
  it('prefers huntID', () => {
    expect(huntIdFromRow({ huntID: ' u1 ', huntId: 'u2' })).toBe('u1');
  });
});

describe('puzzleIdFromRow', () => {
  it('prefers puzzleID', () => {
    expect(puzzleIdFromRow({ puzzleID: 'p1' })).toBe('p1');
  });
});

describe('puzzleLooksSolved', () => {
  it('detects non-empty answer', () => {
    expect(puzzleLooksSolved({ answer: 'secret' })).toBe(true);
    expect(puzzleLooksSolved({ answer: '' })).toBe(false);
    expect(puzzleLooksSolved({})).toBe(false);
  });
});

describe('puzzleTitleFromRow', () => {
  it('falls back to id', () => {
    expect(puzzleTitleFromRow({ puzzleID: 'abc' })).toBe('Puzzle abc');
  });
});

describe('huntDescriptionFromRow', () => {
  it('trims description', () => {
    expect(huntDescriptionFromRow({ description: '  hi  ' })).toBe('hi');
  });
});

describe('huntCallInResultSummary', () => {
  it('prefers correct then hint', () => {
    expect(huntCallInResultSummary({ correct: 'ANSWER' })).toContain('ANSWER');
    expect(huntCallInResultSummary({ hint: 'Warmer' })).toBe('Warmer');
    expect(huntCallInResultSummary({})).toContain('Not quite');
  });
});

describe('parseHuntPuzzleDetailPayload', () => {
  it('reads callIns', () => {
    const r = parseHuntPuzzleDetailPayload({
      huntTitle: 'H',
      title: 'P',
      body: 'Clue',
      callIns: [{ rawSubmission: 'guess' }],
    });
    expect(r.huntTitle).toBe('H');
    expect(r.puzzleTitle).toBe('P');
    expect(r.body).toBe('Clue');
    expect(r.callIns).toHaveLength(1);
  });
});
