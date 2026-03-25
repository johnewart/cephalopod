import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { UploadOutlined } from '@ant-design/icons';
import { Alert, Avatar, Badge, Breadcrumb, Button, Empty, Image, Input, List, Spin, Typography, message } from 'antd';
import { IconLayoutList } from '@tabler/icons-react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { trpc } from '../lib/trpc';
import {
  resolveMarkdownImageSrc,
  twitarrImageThumbUrl,
  twitarrImageUrl,
  swapTwitarrThumbToFull,
} from '../lib/twitarrImage';
import { useStore } from '../hooks/useStore';
import { validateForumImageAttachmentCount, validateForumPostDraft } from '../lib/forumPostDraft';
import {
  arrayBufferToBase64,
  FORUM_POST_IMAGE_ACCEPT,
  FORUM_POST_IMAGE_MAX_BYTES,
  FORUM_POST_MAX_IMAGES,
} from '../lib/imageBase64';
import { forumListRowUnreadCount, normalizeForumEntityId } from '../../shared/forumUnread';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function newLocalId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type PendingForumImage = { id: string; file: File; objectUrl: string };

const FORUM_IMAGE_ACCEPT_TYPES = new Set(FORUM_POST_IMAGE_ACCEPT.split(',').map((s) => s.trim()));

/** Pull the first array of objects found on the root or under preferred keys. */
function extractObjectList(data: unknown, preferredKeys: string[]): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const k of preferredKeys) {
    const v = data[k];
    if (Array.isArray(v)) return v.filter(isRecord);
  }
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && v.length > 0 && isRecord(v[0])) {
      return v.filter(isRecord);
    }
  }
  return [];
}

function pickStringField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/** Twitarr often returns numeric ids (e.g. postID: 113) while OpenAPI paths use string. */
function pickScalarId(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** Category rows: prefer category-specific ids before generic `id`. */
function pickCategoryRowId(obj: Record<string, unknown>): string | undefined {
  return pickStringField(obj, ['categoryID', 'categoryId', 'category_id', 'id']);
}

/** Forum rows: Twitarr may use a misleading generic `id`; prefer forum* keys first. */
function pickForumRowId(obj: Record<string, unknown>): string | undefined {
  return pickStringField(obj, ['forumID', 'forumId', 'forum_id', 'id']);
}

function pickTitle(obj: Record<string, unknown>): string {
  return (
    pickStringField(obj, ['title', 'name', 'subject', 'heading', 'forumTitle', 'categoryTitle']) ?? 'Untitled'
  );
}

/** Plain text from forum post / thread bodies (Twitarr shapes vary). */
function pickTextBody(obj: Record<string, unknown>): string | undefined {
  const direct = pickStringField(obj, ['text', 'markdown', 'html', 'body', 'content', 'message']);
  if (direct) return direct;
  const nested = obj.text;
  if (isRecord(nested)) {
    const t = pickStringField(nested, ['text', 'markdown', 'html']);
    if (t) return t;
  }
  return undefined;
}

/**
 * Twitarr (or clients) sometimes wrap markdown in literal `<Markdown>...</Markdown>` tags
 * (any element name casing). Strip leading opens and trailing closes until stable so partial
 * or nested wrappers still unwrap.
 */
function stripMarkdownWrapper(s: string): string {
  const openRe = /^<markdown\b[^>]*>\s*/i;
  const closeRe = /\s*<\/markdown\s*>$/i;
  let t = s.trim();
  let prev: string;
  do {
    prev = t;
    t = t.replace(openRe, '').replace(closeRe, '').trim();
  } while (t !== prev);
  return t;
}

function pickAuthor(obj: Record<string, unknown>): string | undefined {
  const author = obj.author ?? obj.user ?? obj.poster;
  if (typeof author === 'string' && author.length > 0) return author;
  if (isRecord(author)) {
    return pickStringField(author, ['username', 'name', 'preferredName', 'displayName', 'handle']);
  }
  return pickStringField(obj, ['authorName', 'username', 'userName']);
}

function pickAuthorUserImage(obj: Record<string, unknown>): string | undefined {
  const author = obj.author ?? obj.user ?? obj.poster;
  if (isRecord(author)) {
    return pickStringField(author, ['userImage', 'user_image', 'image', 'avatarURL', 'avatarUrl', 'avatar']);
  }
  return undefined;
}

function pickCreatedAt(obj: Record<string, unknown>): string | undefined {
  return pickStringField(obj, ['createdAt', 'created_at', 'timestamp', 'postedAt', 'date']);
}

/** Forum post attachment filenames (Twitarr `images` array). */
function pickPostImages(obj: Record<string, unknown>): string[] {
  const raw = obj.images ?? obj.imageList ?? obj.image_list;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function formatThreadTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return undefined;
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function createForumPostMarkdownComponents(baseUrl: string): Components {
  return {
    p: ({ children }) => <p style={{ margin: '0 0 0.65em', color: 'inherit' }}>{children}</p>,
    ul: ({ children }) => <ul style={{ margin: '0.35em 0', paddingLeft: '1.25em' }}>{children}</ul>,
    ol: ({ children }) => <ol style={{ margin: '0.35em 0', paddingLeft: '1.25em' }}>{children}</ol>,
    li: ({ children }) => <li style={{ margin: '0.15em 0' }}>{children}</li>,
    a: ({ children, href }) => (
      <a href={href} style={{ color: '#6F458F' }} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
    em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: '3px solid #353942',
          margin: '0.5em 0',
          paddingLeft: 10,
          color: '#9A9D9A',
        }}
      >
        {children}
      </blockquote>
    ),
    h1: ({ children }) => (
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0.5em 0 0.35em', color: '#EFECE2' }}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0.5em 0 0.35em', color: '#EFECE2' }}>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0.5em 0 0.35em', color: '#EFECE2' }}>{children}</h3>
    ),
    hr: () => <hr style={{ border: 'none', borderTop: '1px solid #353942', margin: '0.75em 0' }} />,
    pre: ({ children }) => (
      <pre
        style={{
          background: '#121418',
          padding: 12,
          borderRadius: 8,
          overflow: 'auto',
          margin: '0.5em 0',
          fontSize: 12,
          border: '1px solid #353942',
        }}
      >
        {children}
      </pre>
    ),
    code: ({ children, className }) => {
      const text = String(children);
      const multiline = text.includes('\n') && text.trim().length > 0;
      const fenced =
        (typeof className === 'string' && /^language-/.test(className)) ||
        (typeof className === 'string' && className.length > 0) ||
        multiline;
      if (fenced) {
        return (
          <code
            className={className}
            style={{
              display: 'block',
              background: 'transparent',
              whiteSpace: 'pre',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 12,
            }}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          style={{
            background: '#2a2d33',
            padding: '2px 5px',
            borderRadius: 4,
            fontSize: '0.92em',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {children}
        </code>
      );
    },
    img: ({ src, alt }) => {
      if (typeof src !== 'string' || !src.trim()) return null;
      const resolved = resolveMarkdownImageSrc(baseUrl, src);
      const previewSrc = swapTwitarrThumbToFull(resolved);
      const preview = previewSrc !== resolved ? { src: previewSrc } : true;
      return (
        <span style={{ display: 'block', margin: '0.5em 0', maxWidth: '100%' }}>
          <Image
            src={resolved}
            alt={typeof alt === 'string' ? alt : ''}
            loading="lazy"
            style={{
              maxWidth: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: 8,
              border: '1px solid #353942',
              verticalAlign: 'top',
            }}
            preview={preview}
          />
        </span>
      );
    },
  };
}

function ForumPostMarkdown({ source, baseUrl }: { source: string; baseUrl: string }) {
  if (source === '(No text)') {
    return (
      <Typography.Paragraph
        style={{
          color: '#7A7490',
          fontStyle: 'italic',
          marginBottom: 0,
          fontSize: 14,
        }}
      >
        {source}
      </Typography.Paragraph>
    );
  }
  if (!source.trim()) return null;
  const components = useMemo(() => createForumPostMarkdownComponents(baseUrl), [baseUrl]);
  return (
    <div style={{ color: '#C8C9CC', fontSize: 14, lineHeight: 1.45 }}>
      <Markdown components={components}>{source}</Markdown>
    </div>
  );
}

function ForumPostAttachedImages({ baseUrl, filenames }: { baseUrl: string; filenames: string[] }) {
  if (!baseUrl.trim() || filenames.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
      }}
    >
      {filenames.map((name) => {
        const thumb = twitarrImageUrl(baseUrl, name, 'thumb');
        const full = twitarrImageUrl(baseUrl, name, 'full');
        return (
          <Image
            key={name}
            src={thumb}
            alt=""
            loading="lazy"
            style={{
              maxWidth: 200,
              maxHeight: 200,
              width: 'auto',
              height: 'auto',
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid #353942',
              display: 'block',
            }}
            preview={{ src: full }}
          />
        );
      })}
    </div>
  );
}

type ThreadTimelineItem = {
  key: string;
  author?: string;
  text: string;
  createdAt?: string;
  isOriginalPost: boolean;
  userImage?: string;
  /** Attachment filenames from API `images` */
  images: string[];
  /** Local read state merged in by tRPC from viewed-post store */
  cephalopodRead: boolean;
};

function timelineSortMs(iso?: string): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/** One row in the thread timeline (OP or reply). */
function rowToThreadItem(
  row: Record<string, unknown>,
  isOriginalPost: boolean,
  fallbackKey: string
): ThreadTimelineItem | null {
  const raw = pickTextBody(row);
  const text = raw != null ? stripMarkdownWrapper(raw) : undefined;
  const key = pickScalarId(row, ['postID', 'postId', 'post_id', 'id']) ?? fallbackKey;
  const body = text?.trim() ? text : '';
  const images = pickPostImages(row);
  if (!isOriginalPost && !body && images.length === 0) return null;
  const textField = body || (images.length ? '' : '(No text)');
  const cephalopodRead = row.cephalopodRead === true;
  return {
    key,
    author: pickAuthor(row),
    text: textField,
    createdAt: pickCreatedAt(row),
    isOriginalPost,
    userImage: pickAuthorUserImage(row),
    images,
    cephalopodRead,
  };
}

function isLikelyServerPostId(id: string): boolean {
  if (!id.trim()) return false;
  if (/^post-\d+$/i.test(id)) return false;
  return true;
}

/** When a post scrolls into view, queue it as viewed (debounced mutation to main store). */
function ForumPostViewTracker({
  postId,
  read,
  scrollRootRef,
  onVisible,
  children,
}: {
  postId: string;
  read: boolean;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onVisible: (id: string) => void;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (read || !isLikelyServerPostId(postId)) return;
    const el = wrapRef.current;
    const root = scrollRootRef.current;
    if (!el || !root) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.2) onVisible(postId);
        }
      },
      { root, threshold: [0, 0.2, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [read, postId, onVisible, scrollRootRef]);

  return <div ref={wrapRef}>{children}</div>;
}

export function ForumsView() {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [forumId, setForumId] = useState<string | null>(null);
  const [threadReplyDraft, setThreadReplyDraft] = useState('');
  const [threadReplyError, setThreadReplyError] = useState<string | null>(null);
  const [pendingForumImages, setPendingForumImages] = useState<PendingForumImage[]>([]);
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const forumAttachmentInputRef = useRef<HTMLInputElement>(null);
  const pendingForumImagesRef = useRef(pendingForumImages);
  pendingForumImagesRef.current = pendingForumImages;
  const markPendingRef = useRef<Set<string>>(new Set());
  const markFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();
  const markViewedMutation = trpc.forumPostsMarkViewed.useMutation({
    onSuccess: () => {
      if (forumId) void utils.forumGet.invalidate({ forumId });
      void utils.forumUnreadByCategory.invalidate();
      if (categoryId) void utils.forumCategoryForums.invalidate({ categoryId });
    },
  });

  const forumPostCreateMutation = trpc.forumPostCreate.useMutation({
    onSuccess: () => {
      if (forumId) void utils.forumGet.invalidate({ forumId });
      void utils.forumUnreadByCategory.invalidate();
      if (categoryId) void utils.forumCategoryForums.invalidate({ categoryId });
      setThreadReplyDraft('');
      setThreadReplyError(null);
      setPendingForumImages((prev) => {
        for (const p of prev) URL.revokeObjectURL(p.objectUrl);
        return [];
      });
    },
    onError: (e) => setThreadReplyError(e.message),
  });

  const flushMarkViewed = useCallback(() => {
    markFlushTimerRef.current = null;
    const ids = [...markPendingRef.current];
    markPendingRef.current.clear();
    if (ids.length > 0) markViewedMutation.mutate({ postIds: ids });
  }, [markViewedMutation]);

  const onForumPostVisible = useCallback(
    (postId: string) => {
      if (!forumId || !isLikelyServerPostId(postId)) return;
      markPendingRef.current.add(postId);
      if (markFlushTimerRef.current) clearTimeout(markFlushTimerRef.current);
      markFlushTimerRef.current = setTimeout(flushMarkViewed, 450);
    },
    [forumId, flushMarkViewed],
  );

  useEffect(() => {
    markPendingRef.current.clear();
    if (markFlushTimerRef.current) {
      clearTimeout(markFlushTimerRef.current);
      markFlushTimerRef.current = null;
    }
  }, [forumId]);

  useEffect(() => {
    setThreadReplyDraft('');
    setThreadReplyError(null);
    setPendingForumImages((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.objectUrl);
      return [];
    });
  }, [forumId]);

  useEffect(
    () => () => {
      for (const p of pendingForumImagesRef.current) URL.revokeObjectURL(p.objectUrl);
    },
    [],
  );

  const categoriesQuery = trpc.forumCategories.useQuery();

  const forumsInCategoryQuery = trpc.forumCategoryForums.useQuery(
    { categoryId: categoryId ?? '' },
    { enabled: !!categoryId }
  );

  const forumDetailQuery = trpc.forumGet.useQuery(
    { forumId: forumId ?? '' },
    { enabled: !!forumId, retry: false }
  );

  const forumUnreadByCategoryQuery = trpc.forumUnreadByCategory.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const categories = useMemo(() => {
    const raw = categoriesQuery.data as unknown;
    const list = extractObjectList(raw, ['categories', 'categoryList', 'items']);
    return list
      .map((row) => {
        const id = pickCategoryRowId(row);
        if (!id) return null;
        return { id, title: pickTitle(row), raw: row };
      })
      .filter((x): x is { id: string; title: string; raw: Record<string, unknown> } => x != null);
  }, [categoriesQuery.data]);

  const forums = useMemo(() => {
    const raw = forumsInCategoryQuery.data as unknown;
    const list = extractObjectList(raw, ['forums', 'forumList', 'categoryForums', 'items']);
    return list
      .map((row) => {
        const id = pickForumRowId(row);
        if (!id) return null;
        return { id, title: pickTitle(row), raw: row };
      })
      .filter((x): x is { id: string; title: string; raw: Record<string, unknown> } => x != null);
  }, [forumsInCategoryQuery.data]);

  const forumTitle = useMemo(() => {
    const raw = forumDetailQuery.data as unknown;
    if (!isRecord(raw)) return null;
    const forum = raw.forum;
    if (isRecord(forum)) return pickTitle(forum);
    return pickStringField(raw, ['title', 'forumTitle', 'name']);
  }, [forumDetailQuery.data]);

  const categoryTitle = useMemo(() => {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId)?.title ?? null;
  }, [categories, categoryId]);

  /** forumGet `posts` are messages in one forum thread / conversation. */
  const forumConversation = useMemo(() => {
    const raw = forumDetailQuery.data as unknown;
    if (!isRecord(raw)) return null;
    const list = extractObjectList(raw, ['forumThreads', 'threads', 'posts', 'postList', 'items']);
    const items = list
      .map((row, i) => rowToThreadItem(row, true, `post-${i}`))
      .filter((x): x is ThreadTimelineItem => x != null);
    const sorted = [...items].sort((a, b) => timelineSortMs(a.createdAt) - timelineSortMs(b.createdAt));
    const withStarter = sorted.map((item, i) => ({ ...item, isOriginalPost: i === 0 }));
    const title =
      forumTitle ??
      pickStringField(raw, ['title', 'forumTitle', 'name']) ??
      'Forum';
    return { threadTitle: title, items: withStarter, raw };
  }, [forumDetailQuery.data, forumTitle]);

  useEffect(() => {
    if (!forumDetailQuery.isSuccess || !forumId || !categoryId) return;
    void utils.forumCategoryForums.invalidate({ categoryId });
    void utils.forumUnreadByCategory.invalidate();
  }, [forumDetailQuery.isSuccess, forumDetailQuery.dataUpdatedAt, forumId, categoryId, utils]);

  const listErr = categoriesQuery.error?.message ?? forumsInCategoryQuery.error?.message;

  const forumLoadErr = forumDetailQuery.error?.message;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1B1D23' }}>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #3d4149',
          fontWeight: 600,
          fontSize: 14,
          color: '#EFECE2',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <IconLayoutList size={18} stroke={1.5} style={{ color: '#6F458F' }} />
        Forums
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Breadcrumb
          style={{ color: '#9A9D9A', fontSize: 13 }}
          items={[
            {
              title: (
                <span
                  style={{ cursor: 'pointer', color: categoryId ? '#6F458F' : '#9A9D9A' }}
                  onClick={() => {
                    setCategoryId(null);
                    setForumId(null);
                  }}
                >
                  Categories
                </span>
              ),
            },
            ...(categoryId
              ? [
                  {
                    title: (
                      <span
                        style={{ cursor: 'pointer', color: forumId ? '#6F458F' : '#EFECE2' }}
                        onClick={() => {
                          setForumId(null);
                        }}
                      >
                        {categoryTitle ?? categoryId}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(forumId ? [{ title: <span style={{ color: '#EFECE2' }}>{forumTitle ?? 'Forum'}</span> }] : []),
          ]}
        />

        {listErr ? (
          <Alert type="error" message="Could not load forums" description={listErr} showIcon />
        ) : null}
        {forumLoadErr && forumId ? (
          <Alert
            type="warning"
            showIcon
            message="Could not load this forum"
            description={
              forumLoadErr.includes('Not Found') || forumLoadErr.includes('404')
                ? 'The server returned not found — the forum may have been removed.'
                : forumLoadErr
            }
            action={
              <Button size="small" type="link" onClick={() => setForumId(null)}>
                Back to forums
              </Button>
            }
          />
        ) : null}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, overflow: 'hidden' }}>
          <div
            style={{
              width: 300,
              flexShrink: 0,
              border: '1px solid #3d4149',
              borderRadius: 10,
              background: '#24272e',
              overflow: 'auto',
              minHeight: 0,
            }}
          >
            {categoriesQuery.isLoading ? (
              <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
                <Spin />
              </div>
            ) : !categoryId ? (
              <List
                size="small"
                dataSource={categories}
                locale={{ emptyText: <Empty description="No categories" style={{ margin: 16 }} /> }}
                renderItem={(c) => {
                  const catUnread =
                    forumUnreadByCategoryQuery.data?.unreadByCategoryId[normalizeForumEntityId(c.id)] ?? 0;
                  return (
                    <List.Item
                      style={{
                        cursor: 'pointer',
                        padding: '10px 14px',
                        borderColor: '#353942',
                        color: '#EFECE2',
                      }}
                      onClick={() => {
                        setCategoryId(c.id);
                        setForumId(null);
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          width: '100%',
                          minWidth: 0,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.title}
                        </span>
                        {catUnread > 0 ? (
                          <Badge
                            count={catUnread}
                            showZero={false}
                            size="small"
                            color="#6F458F"
                            overflowCount={99}
                          />
                        ) : null}
                      </span>
                    </List.Item>
                  );
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {forumsInCategoryQuery.isLoading ? (
                  <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
                    <Spin />
                  </div>
                ) : forumsInCategoryQuery.isError ? (
                  <div style={{ padding: 12 }}>
                    <Alert
                      type="warning"
                      showIcon
                      message="Could not load forums"
                      description={
                        forumsInCategoryQuery.error?.message ??
                        'Unable to load forums for this category.'
                      }
                      action={
                        <Button size="small" type="link" onClick={() => setCategoryId(null)}>
                          Back to categories
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <List
                    size="small"
                    dataSource={forums}
                    locale={{ emptyText: <Empty description="No forums in category" style={{ margin: 16 }} /> }}
                    renderItem={(f) => {
                      const selected = f.id === forumId;
                      const threadUnread = forumListRowUnreadCount(f.raw);
                      return (
                        <List.Item
                          style={{
                            cursor: 'pointer',
                            padding: '10px 14px',
                            borderColor: '#353942',
                            color: '#EFECE2',
                            background: selected ? 'rgba(111, 69, 143, 0.08)' : undefined,
                            borderLeft: selected ? '3px solid #6F458F' : undefined,
                          }}
                          onClick={() => setForumId(f.id)}
                        >
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              width: '100%',
                              minWidth: 0,
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.title}
                            </span>
                            {threadUnread > 0 ? (
                              <Badge
                                count={threadUnread}
                                showZero={false}
                                size="small"
                                color="#6F458F"
                                overflowCount={99}
                              />
                            ) : null}
                          </span>
                        </List.Item>
                      );
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              border: '1px solid #3d4149',
              borderRadius: 10,
              background: '#24272e',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 16,
              minHeight: 0,
            }}
          >
            {forumId ? (
              forumDetailQuery.isLoading ? (
                <Spin style={{ display: 'block', margin: '40px auto' }} />
              ) : forumConversation ? (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div
                    style={{
                      flexShrink: 0,
                      marginBottom: 12,
                      paddingBottom: 12,
                      borderBottom: '1px solid #353942',
                    }}
                  >
                    <Typography.Title level={4} style={{ color: '#EFECE2', marginTop: 0, marginBottom: 4 }}>
                      {forumConversation.threadTitle}
                    </Typography.Title>
                    <Typography.Text style={{ color: '#7A7490', fontSize: 12 }}>
                      {forumConversation.items.length} message{forumConversation.items.length === 1 ? '' : 's'} · oldest
                      first
                    </Typography.Text>
                  </div>
                  <div
                    ref={threadScrollRef}
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      paddingRight: 4,
                    }}
                  >
                    {forumConversation.items.map((m, idx) => {
                      const when = formatThreadTime(m.createdAt);
                      const avatarSrc =
                        baseUrl && m.userImage
                          ? twitarrImageThumbUrl(baseUrl, m.userImage)
                          : undefined;
                      const leftBorder = m.isOriginalPost
                        ? '3px solid #6F458F'
                        : !m.cephalopodRead
                          ? '3px solid rgba(196, 132, 60, 0.8)'
                          : undefined;
                      return (
                        <ForumPostViewTracker
                          key={`${m.key}-${idx}`}
                          postId={m.key}
                          read={m.cephalopodRead}
                          scrollRootRef={threadScrollRef}
                          onVisible={onForumPostVisible}
                        >
                          <div
                            style={{
                              alignSelf: 'stretch',
                              maxWidth: '100%',
                              display: 'flex',
                              gap: 12,
                              alignItems: 'flex-start',
                            }}
                          >
                          {avatarSrc ? (
                            <Avatar src={avatarSrc} size={40} style={{ flexShrink: 0 }} />
                          ) : (
                            <Avatar
                              size={40}
                              style={{ flexShrink: 0, background: '#3d4149', color: '#6F458F' }}
                            >
                              {(m.author ?? '?').slice(0, 1).toUpperCase()}
                            </Avatar>
                          )}
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              borderRadius: 12,
                              border: '1px solid #353942',
                              borderLeft: leftBorder,
                              background: m.isOriginalPost ? 'rgba(111, 69, 143, 0.07)' : '#1b1e24',
                              padding: '10px 14px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'baseline',
                                gap: '6px 10px',
                                marginBottom: 8,
                              }}
                            >
                              <span style={{ fontWeight: 600, color: '#EFECE2', fontSize: 13 }}>
                                {m.author ?? 'Unknown'}
                              </span>
                              {m.isOriginalPost ? (
                                <span
                                  style={{
                                    fontSize: 10,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                    color: '#6F458F',
                                  }}
                                >
                                  OP
                                </span>
                              ) : null}
                              {when ? <span style={{ fontSize: 11, color: '#7A7490' }}>{when}</span> : null}
                              {!m.cephalopodRead ? (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.4,
                                    color: 'rgba(196, 132, 60, 0.95)',
                                  }}
                                >
                                  Unread
                                </span>
                              ) : null}
                            </div>
                            <Image.PreviewGroup>
                              <ForumPostMarkdown source={m.text} baseUrl={baseUrl} />
                              <ForumPostAttachedImages baseUrl={baseUrl} filenames={m.images} />
                            </Image.PreviewGroup>
                          </div>
                        </div>
                        </ForumPostViewTracker>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      flexShrink: 0,
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid #353942',
                    }}
                  >
                    <Typography.Text
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#6d7178',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Reply to thread
                    </Typography.Text>
                    <Input.TextArea
                      value={threadReplyDraft}
                      onChange={(e) => {
                        setThreadReplyDraft(e.target.value);
                        if (threadReplyError) setThreadReplyError(null);
                      }}
                      placeholder="Write a message (markdown supported when rendered)…"
                      autoSize={{ minRows: 3, maxRows: 12 }}
                      disabled={forumPostCreateMutation.isPending}
                      style={{
                        background: '#1b1e24',
                        borderColor: '#3d4149',
                        color: '#EFECE2',
                      }}
                    />
                    <input
                      ref={forumAttachmentInputRef}
                      type="file"
                      accept={FORUM_POST_IMAGE_ACCEPT}
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const picked = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        if (picked.length === 0) return;
                        setPendingForumImages((prev) => {
                          const next = [...prev];
                          for (const file of picked) {
                            if (!FORUM_IMAGE_ACCEPT_TYPES.has(file.type)) {
                              message.error('Only JPEG, PNG, WebP, or GIF images can be attached.');
                              continue;
                            }
                            if (file.size > FORUM_POST_IMAGE_MAX_BYTES) {
                              message.error(
                                `Each image must be at most ${FORUM_POST_IMAGE_MAX_BYTES / (1024 * 1024)} MB.`,
                              );
                              continue;
                            }
                            if (next.length >= FORUM_POST_MAX_IMAGES) {
                              message.warning(`You can attach at most ${FORUM_POST_MAX_IMAGES} images per post.`);
                              break;
                            }
                            next.push({
                              id: newLocalId(),
                              file,
                              objectUrl: URL.createObjectURL(file),
                            });
                          }
                          return next;
                        });
                      }}
                    />
                    {pendingForumImages.length > 0 ? (
                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {pendingForumImages.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              position: 'relative',
                              width: 72,
                              height: 72,
                              flexShrink: 0,
                            }}
                          >
                            <img
                              src={p.objectUrl}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: 8,
                                border: '1px solid #3d4149',
                              }}
                            />
                            <Button
                              size="small"
                              type="text"
                              danger
                              style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                minWidth: 26,
                                height: 26,
                                padding: 0,
                                lineHeight: 1,
                                color: '#fff',
                                textShadow: '0 0 4px #000',
                              }}
                              disabled={forumPostCreateMutation.isPending}
                              onClick={() => {
                                URL.revokeObjectURL(p.objectUrl);
                                setPendingForumImages((prev) => prev.filter((x) => x.id !== p.id));
                              }}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                      <Button
                        type="primary"
                        loading={forumPostCreateMutation.isPending}
                        disabled={!forumId || !threadReplyDraft.trim()}
                        onClick={async () => {
                          if (!forumId) return;
                          const trimmed = threadReplyDraft.trim();
                          const v = validateForumPostDraft(trimmed);
                          if (v) {
                            setThreadReplyError(v);
                            return;
                          }
                          const imgErr = validateForumImageAttachmentCount(pendingForumImages.length);
                          if (imgErr) {
                            setThreadReplyError(imgErr);
                            return;
                          }
                          setThreadReplyError(null);
                          let images: { imageBase64: string }[] | undefined;
                          try {
                            images =
                              pendingForumImages.length > 0
                                ? await Promise.all(
                                    pendingForumImages.map(async (p) => ({
                                      imageBase64: arrayBufferToBase64(await p.file.arrayBuffer()),
                                    })),
                                  )
                                : undefined;
                          } catch {
                            setThreadReplyError(
                              'Could not read an image file. Try removing attachments and adding them again.',
                            );
                            return;
                          }
                          forumPostCreateMutation.mutate({
                            forumId,
                            text: trimmed,
                            ...(images && images.length > 0 ? { images } : {}),
                          });
                        }}
                      >
                        Post reply
                      </Button>
                      <Button
                        type="default"
                        icon={<UploadOutlined />}
                        disabled={
                          forumPostCreateMutation.isPending || pendingForumImages.length >= FORUM_POST_MAX_IMAGES
                        }
                        onClick={() => forumAttachmentInputRef.current?.click()}
                      >
                        Add images
                      </Button>
                      <Typography.Text type="secondary" style={{ fontSize: 12, color: '#7A7490' }}>
                        Max 2048 characters, 25 lines. Up to {FORUM_POST_MAX_IMAGES} images (
                        {FORUM_POST_IMAGE_MAX_BYTES / (1024 * 1024)} MB each). Fewer may be allowed for your account on
                        the server.
                      </Typography.Text>
                    </div>
                    {threadReplyError ? (
                      <Alert
                        style={{ marginTop: 10 }}
                        type="error"
                        showIcon
                        message={threadReplyError}
                      />
                    ) : null}
                  </div>
                  <details style={{ marginTop: 12, flexShrink: 0 }}>
                    <summary style={{ color: '#7A7490', cursor: 'pointer', fontSize: 12 }}>Raw API response</summary>
                    <pre
                      style={{
                        marginTop: 8,
                        padding: 12,
                        background: '#1b1d23',
                        borderRadius: 8,
                        overflow: 'auto',
                        fontSize: 11,
                        color: '#9A9D9A',
                        maxHeight: 200,
                      }}
                    >
                      {JSON.stringify(forumDetailQuery.data, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <Empty description="Could not parse forum messages" />
              )
            ) : categoryId && !forumId ? (
              <div style={{ color: '#7A7490', fontSize: 14 }}>
                {forumsInCategoryQuery.isLoading ? (
                  <Spin />
                ) : (
                  <>
                    <Typography.Paragraph style={{ color: '#9A9D9A', marginBottom: 12 }}>
                      Select a forum on the left — its posts load as one conversation. Category:{' '}
                      <strong style={{ color: '#EFECE2' }}>{categoryTitle ?? categoryId}</strong>
                    </Typography.Paragraph>
                    <details>
                      <summary style={{ color: '#7A7490', cursor: 'pointer', fontSize: 12 }}>
                        Raw forums list
                      </summary>
                      <pre
                        style={{
                          marginTop: 8,
                          padding: 12,
                          background: '#1b1d23',
                          borderRadius: 8,
                          overflow: 'auto',
                          fontSize: 11,
                          color: '#9A9D9A',
                          maxHeight: 240,
                        }}
                      >
                        {JSON.stringify(forumsInCategoryQuery.data, null, 2)}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            ) : (
              <Typography.Paragraph style={{ color: '#7A7490', margin: 0 }}>
                Select a category to browse forums on your server.
              </Typography.Paragraph>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
