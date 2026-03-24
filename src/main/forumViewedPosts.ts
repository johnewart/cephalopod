import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { app } from 'electron';
import { normalizeTwitarrUuid } from './normalizeTwitarrUuid';

const FILENAME = 'forum-viewed-posts-v1.json';
const MAX_IDS_PER_SCOPE = 25_000;

type PersistedFile = { v: 1; scopes: Record<string, string[]> };

let memory: PersistedFile | null = null;
let memoryPath: string | null = null;

function storagePath(): string {
  return join(app.getPath('userData'), FILENAME);
}

function load(): PersistedFile {
  const p = storagePath();
  if (memory && memoryPath === p) return memory;
  memoryPath = p;
  try {
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as unknown;
      if (
        raw &&
        typeof raw === 'object' &&
        (raw as PersistedFile).v === 1 &&
        typeof (raw as PersistedFile).scopes === 'object' &&
        (raw as PersistedFile).scopes !== null
      ) {
        memory = raw as PersistedFile;
        return memory;
      }
    }
  } catch {
    /* ignore corrupt */
  }
  memory = { v: 1, scopes: {} };
  return memory;
}

function persist(data: PersistedFile): void {
  const p = storagePath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data), 'utf8');
}

function scopeKey(baseUrl: string, username: string): string {
  return `${baseUrl.trim().replace(/\/$/, '').toLowerCase()}|${username.trim().toLowerCase()}`;
}

export function getForumViewedIdSet(baseUrl: string, username: string | null | undefined): Set<string> {
  if (!username) return new Set();
  const data = load();
  const ids = data.scopes[scopeKey(baseUrl, username)] ?? [];
  return new Set(ids);
}

export function markForumPostsViewed(
  baseUrl: string,
  username: string | null | undefined,
  postIds: string[],
): void {
  if (!username || postIds.length === 0) return;
  const data = load();
  const key = scopeKey(baseUrl, username);
  const set = new Set(data.scopes[key] ?? []);
  for (const raw of postIds) {
    const n = normalizeTwitarrUuid(String(raw));
    if (n.length > 0) set.add(n);
  }
  let list = [...set];
  if (list.length > MAX_IDS_PER_SCOPE) {
    list = list.slice(list.length - MAX_IDS_PER_SCOPE);
  }
  data.scopes[key] = list;
  persist(data);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function pickScalarId(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** Resolve a stable id for JSON objects that represent forum posts (including replies). */
function forumPostRowId(o: Record<string, unknown>): string | undefined {
  const explicit = pickScalarId(o, ['postID', 'postId', 'post_id']);
  if (explicit) return normalizeTwitarrUuid(explicit);
  const id = pickScalarId(o, ['id']);
  if (!id) return undefined;
  const author = o.author ?? o.user ?? o.poster;
  const text = o.text;
  const hasAuthor =
    typeof author === 'string' ||
    (isRecord(author) &&
      pickScalarId(author, ['username', 'name', 'displayName', 'preferredName']) !== undefined);
  const hasText =
    typeof text === 'string' ||
    (isRecord(text) && typeof text.text === 'string') ||
    typeof pickScalarId(o, ['markdown', 'html', 'body']) === 'string';
  const hasImages = Array.isArray(o.images);
  if (hasAuthor || hasText || hasImages) return normalizeTwitarrUuid(id);
  return undefined;
}

/**
 * Deep-clones JSON and sets `cephalopodRead` on forum post objects (true if id is in `viewed`).
 */
export function mergeForumPayloadReadState(raw: unknown, viewed: Set<string>): unknown {
  if (raw === undefined) return raw;
  let clone: unknown;
  try {
    clone = JSON.parse(JSON.stringify(raw)) as unknown;
  } catch {
    return raw;
  }

  function walk(node: unknown): void {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (!isRecord(node)) return;
    const id = forumPostRowId(node);
    if (id != null) {
      node.cephalopodRead = viewed.has(id);
    }
    for (const v of Object.values(node)) walk(v);
  }

  walk(clone);
  return clone;
}
