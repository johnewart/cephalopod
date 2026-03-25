function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Swiftarr `ForumData.paginator` (GET /api/v3/forum/:id). */
export type ForumThreadPaginator = { total: number; start: number; limit: number };

export function parseForumPaginator(raw: unknown): ForumThreadPaginator | null {
  if (!isRecord(raw)) return null;
  const p = raw.paginator;
  if (!isRecord(p)) return null;
  const total = Number(p.total);
  const start = Number(p.start);
  const limit = Number(p.limit);
  if (!Number.isFinite(total) || !Number.isFinite(start) || !Number.isFinite(limit)) return null;
  return { total, start, limit };
}

export function extractForumPosts(raw: unknown): unknown[] {
  if (!isRecord(raw)) return [];
  const posts = raw.posts;
  return Array.isArray(posts) ? posts : [];
}

/**
 * Next `start` for Swiftarr forum thread requests: advance by `paginator.start + paginator.limit`,
 * not by how many posts were returned (muteword filtering can return fewer than `limit`).
 */
export function nextForumThreadStart(pg: ForumThreadPaginator): number | null {
  const next = pg.start + pg.limit;
  return next < pg.total ? next : null;
}
