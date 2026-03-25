function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function pickStringField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickFiniteNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim().length > 0) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** Align with `normalizeTwitarrUuid` for matching category/forum ids from JSON. */
export function normalizeForumEntityId(id: string): string {
  const t = id.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)
  ) {
    return t.toLowerCase();
  }
  return t;
}

/**
 * Unread posts in a forum list row (Swiftarr `ForumListData`): postCount − readCount.
 * Block/mute semantics follow the server; counts can be 0 even when the thread moved.
 */
export function forumListRowUnreadCount(row: Record<string, unknown>): number {
  const postCount = pickFiniteNumber(row, ['postCount', 'post_count']);
  const readCount = pickFiniteNumber(row, ['readCount', 'read_count']);
  if (postCount === undefined || readCount === undefined) return 0;
  return Math.max(0, postCount - readCount);
}

export function forumListRowCategoryId(row: Record<string, unknown>): string | undefined {
  const raw = pickStringField(row, ['categoryID', 'categoryId', 'category_id']);
  return raw ? normalizeForumEntityId(raw) : undefined;
}

/** Sum unread post counts per category from forum list rows (e.g. `/forum/unread`). */
export function sumUnreadPostsByCategoryId(rows: Iterable<Record<string, unknown>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const cat = forumListRowCategoryId(row);
    if (!cat) continue;
    const u = forumListRowUnreadCount(row);
    if (u <= 0) continue;
    out[cat] = (out[cat] ?? 0) + u;
  }
  return out;
}

export function extractForumSearchThreadRows(raw: unknown): Record<string, unknown>[] {
  if (!isRecord(raw)) return [];
  const t = raw.forumThreads;
  if (!Array.isArray(t)) return [];
  return t.filter(isRecord);
}
