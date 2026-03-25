import { describe, expect, it } from 'vitest';
import {
  extractForumPosts,
  nextForumThreadStart,
  parseForumPaginator,
} from './forumThreadPagination';

describe('parseForumPaginator', () => {
  it('reads Swiftarr ForumData.paginator', () => {
    expect(
      parseForumPaginator({
        title: 't',
        paginator: { total: 120, start: 0, limit: 50 },
        posts: [],
      }),
    ).toEqual({ total: 120, start: 0, limit: 50 });
  });

  it('returns null when missing or invalid', () => {
    expect(parseForumPaginator(null)).toBeNull();
    expect(parseForumPaginator({ posts: [] })).toBeNull();
    expect(parseForumPaginator({ paginator: { total: 'x', start: 0, limit: 10 } })).toBeNull();
  });
});

describe('extractForumPosts', () => {
  it('returns posts array or empty', () => {
    expect(extractForumPosts({ posts: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(extractForumPosts({})).toEqual([]);
    expect(extractForumPosts(null)).toEqual([]);
  });
});

describe('nextForumThreadStart', () => {
  it('advances by start+limit, not by returned row count', () => {
    expect(nextForumThreadStart({ total: 500, start: 0, limit: 50 })).toBe(50);
    expect(nextForumThreadStart({ total: 500, start: 50, limit: 50 })).toBe(100);
  });

  it('returns null when no more pages', () => {
    expect(nextForumThreadStart({ total: 40, start: 0, limit: 50 })).toBeNull();
    expect(nextForumThreadStart({ total: 100, start: 50, limit: 50 })).toBeNull();
  });
});
