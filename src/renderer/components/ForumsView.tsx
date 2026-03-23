import { useMemo, useState } from 'react';
import { Alert, Avatar, Breadcrumb, Button, Empty, List, Spin, Typography } from 'antd';
import { IconLayoutList } from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { swiftarrImageThumbUrl } from '../lib/swiftarrImage';
import { useStore } from '../hooks/useStore';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

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

/** Swiftarr often returns numeric ids (e.g. postID: 113) while OpenAPI paths use string. */
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

/** Forum rows: Swiftarr may use a misleading generic `id`; prefer forum* keys first. */
function pickForumRowId(obj: Record<string, unknown>): string | undefined {
  return pickStringField(obj, ['forumID', 'forumId', 'forum_id', 'id']);
}

function pickTitle(obj: Record<string, unknown>): string {
  return (
    pickStringField(obj, ['title', 'name', 'subject', 'heading', 'forumTitle', 'categoryTitle']) ?? 'Untitled'
  );
}

/** Plain text from forum post / thread bodies (Swiftarr shapes vary). */
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

function formatThreadTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return undefined;
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type ThreadTimelineItem = {
  key: string;
  author?: string;
  text: string;
  createdAt?: string;
  isOriginalPost: boolean;
  userImage?: string;
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
  const text = pickTextBody(row);
  const key = pickScalarId(row, ['postID', 'postId', 'post_id', 'id']) ?? fallbackKey;
  const body = text?.trim() ? text : '';
  if (!isOriginalPost && !body) return null;
  return {
    key,
    author: pickAuthor(row),
    text: body || '(No text)',
    createdAt: pickCreatedAt(row),
    isOriginalPost,
    userImage: pickAuthorUserImage(row),
  };
}

export function ForumsView() {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [forumId, setForumId] = useState<string | null>(null);
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');

  const categoriesQuery = trpc.forumCategories.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const forumsInCategoryQuery = trpc.forumCategoryForums.useQuery(
    { categoryId: categoryId ?? '' },
    { enabled: !!categoryId }
  );

  const forumDetailQuery = trpc.forumGet.useQuery(
    { forumId: forumId ?? '' },
    { enabled: !!forumId, retry: false }
  );

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
        <IconLayoutList size={18} stroke={1.5} style={{ color: '#ADFD43' }} />
        Forums
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Breadcrumb
          style={{ color: '#9A9D9A', fontSize: 13 }}
          items={[
            {
              title: (
                <span
                  style={{ cursor: 'pointer', color: categoryId ? '#ADFD43' : '#9A9D9A' }}
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
                        style={{ cursor: 'pointer', color: forumId ? '#ADFD43' : '#EFECE2' }}
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
                renderItem={(c) => (
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
                    {c.title}
                  </List.Item>
                )}
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
                      return (
                        <List.Item
                          style={{
                            cursor: 'pointer',
                            padding: '10px 14px',
                            borderColor: '#353942',
                            color: '#EFECE2',
                            background: selected ? 'rgba(173, 253, 67, 0.08)' : undefined,
                            borderLeft: selected ? '3px solid #ADFD43' : undefined,
                          }}
                          onClick={() => setForumId(f.id)}
                        >
                          {f.title}
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
                          ? swiftarrImageThumbUrl(baseUrl, m.userImage)
                          : undefined;
                      return (
                        <div
                          key={`${m.key}-${idx}`}
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
                              style={{ flexShrink: 0, background: '#3d4149', color: '#ADFD43' }}
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
                              borderLeft: m.isOriginalPost ? '3px solid #ADFD43' : undefined,
                              background: m.isOriginalPost ? 'rgba(173, 253, 67, 0.07)' : '#1b1e24',
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
                                    color: '#ADFD43',
                                  }}
                                >
                                  OP
                                </span>
                              ) : null}
                              {when ? <span style={{ fontSize: 11, color: '#7A7490' }}>{when}</span> : null}
                            </div>
                            <Typography.Paragraph
                              style={{
                                color: '#C8C9CC',
                                whiteSpace: 'pre-wrap',
                                marginBottom: 0,
                                fontSize: 14,
                                lineHeight: 1.45,
                              }}
                            >
                              {m.text}
                            </Typography.Paragraph>
                          </div>
                        </div>
                      );
                    })}
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
