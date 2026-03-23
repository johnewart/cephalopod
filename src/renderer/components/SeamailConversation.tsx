import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input, Button, List, Spin, Alert, Avatar } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { trpc } from '../lib/trpc';
import { twitarrImageThumbUrl, twitarrUserIdenticonUrl } from '../lib/twitarrImage';
import { useStore } from '../hooks/useStore';

interface SeamailConversationProps {
  fezId: string;
}

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

/** Twitarr fez post time fields (align with `ForumsView` `pickCreatedAt`). */
function pickPostCreatedAtIso(post: unknown): string | undefined {
  if (!isRecord(post)) return undefined;
  const s = pickStringField(post, ['createdAt', 'created_at', 'timestamp', 'postedAt', 'date', 'time']);
  if (s) return s;
  for (const key of ['created', 'posted']) {
    const v = post[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const ms = v < 1e12 ? v * 1000 : v;
      return new Date(ms).toISOString();
    }
  }
  return undefined;
}

function formatChatTimestamp(iso?: string): string | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  const date = new Date(ms);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Resolve avatar URL from Twitarr fez post `author` (UserHeader-like). */
function postAuthorAvatarSrc(baseUrl: string, post: unknown): string | undefined {
  if (!baseUrl || !isRecord(post)) return undefined;
  const author = post.author;
  if (!isRecord(author)) return undefined;
  const img = pickStringField(author, ['userImage', 'user_image', 'image', 'avatarURL', 'avatarUrl', 'avatar']);
  if (img) return twitarrImageThumbUrl(baseUrl, img);
  const uid = pickStringField(author, ['userID', 'userId', 'user_id', 'id']);
  if (uid) return twitarrUserIdenticonUrl(baseUrl, uid);
  return undefined;
}

export function SeamailConversation({ fezId }: SeamailConversationProps) {
  const [newMessage, setNewMessage] = useState('');
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const { data, isLoading, error, dataUpdatedAt } = trpc.fezGet.useQuery({ fezId });
  const postMutation = trpc.fezPostAdd.useMutation({
    onSuccess: () => {
      setNewMessage('');
      utils.fezGet.invalidate({ fezId });
    },
  });

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, []);

  const fez = data as {
    title?: string;
    members?: {
      posts?: Array<{ postID?: number; text?: string; author?: { username?: string } }>;
    };
  } | undefined;
  const posts = fez?.members?.posts ?? [];

  useLayoutEffect(() => {
    if (isLoading || error) return;
    scrollToBottom();
  }, [isLoading, error, fezId, dataUpdatedAt, posts.length, scrollToBottom]);

  useEffect(() => {
    if (isLoading || error) return;
    scrollToBottom();
  }, [newMessage, isLoading, error, scrollToBottom]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    postMutation.mutate({ fezId, text: newMessage.trim() });
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0, padding: 16, background: '#24272e' }}>
        <Spin tip="Loading…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, minHeight: 0, padding: 16, overflow: 'auto', background: '#24272e' }}>
        <Alert type="error" message={error.message} showIcon />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: '#24272e' }}>
      <div style={{ padding: '8px 12px', flexShrink: 0, background: '#24272e', borderBottom: '1px solid #3d4149' }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#EFECE2', lineHeight: 1.25 }}>{fez?.title ?? 'Conversation'}</h2>
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '10px 12px', background: '#24272e' }}>
        <List
          dataSource={posts}
          split={false}
          renderItem={(post, i) => {
            const username = post.author?.username ?? '';
            const initial = username ? username.charAt(0).toUpperCase() : '?';
            const avatarSrc = postAuthorAvatarSrc(baseUrl, post);
            const when = formatChatTimestamp(pickPostCreatedAtIso(post));
            return (
              <List.Item
                key={post.postID ?? `post-${i}`}
                style={{
                  marginBottom: 6,
                  padding: 0,
                  border: 'none',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%' }}>
                  <Avatar
                    size={28}
                    src={avatarSrc}
                    style={{ background: '#365563', color: '#EFECE2', borderRadius: 6, flexShrink: 0 }}
                  >
                    {initial}
                  </Avatar>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '7px 11px',
                      borderRadius: 6,
                      background: '#292B32',
                      border: '1px solid #3d4149',
                      maxWidth: '85%',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        lineHeight: 1.35,
                        color: '#EFECE2',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {post.text ?? ''}
                    </span>
                    {when ? (
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 10,
                          lineHeight: 1.2,
                          color: '#7A7490',
                          textAlign: 'right',
                        }}
                      >
                        {when}
                      </div>
                    ) : null}
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      </div>
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid #3d4149', flexShrink: 0, background: '#2a2d34' }}>
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message…"
          disabled={postMutation.isPending}
          style={{ flex: 1, fontSize: 13 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          htmlType="submit"
          loading={postMutation.isPending}
          disabled={!newMessage.trim()}
        >
          Send
        </Button>
      </form>
    </div>
  );
}
