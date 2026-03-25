import { describe, expect, it } from 'vitest';
import {
  extractForumSearchThreadRows,
  forumListRowUnreadCount,
  normalizeForumEntityId,
  sumUnreadPostsByCategoryId,
} from './forumUnread';

describe('normalizeForumEntityId', () => {
  it('lowercases UUIDs', () => {
    expect(normalizeForumEntityId('550E8400-E29B-41D4-A716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });
});

describe('forumListRowUnreadCount', () => {
  it('returns postCount minus readCount', () => {
    expect(
      forumListRowUnreadCount({
        postCount: 10,
        readCount: 3,
      }),
    ).toBe(7);
  });

  it('returns 0 when counts missing', () => {
    expect(forumListRowUnreadCount({})).toBe(0);
  });
});

describe('sumUnreadPostsByCategoryId', () => {
  it('aggregates by category id', () => {
    const rows = [
      { categoryID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', postCount: 5, readCount: 2 },
      { categoryID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', postCount: 3, readCount: 3 },
      { categoryID: 'ffffffff-ffff-ffff-ffff-ffffffffffff', postCount: 4, readCount: 1 },
    ] as Record<string, unknown>[];
    expect(sumUnreadPostsByCategoryId(rows)).toEqual({
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': 3,
      'ffffffff-ffff-ffff-ffff-ffffffffffff': 3,
    });
  });
});

describe('extractForumSearchThreadRows', () => {
  it('reads forumThreads', () => {
    const rows = extractForumSearchThreadRows({
      forumThreads: [{ postCount: 1, readCount: 0 }],
      paginator: { total: 1, start: 0, limit: 50 },
    });
    expect(rows).toHaveLength(1);
  });
});
