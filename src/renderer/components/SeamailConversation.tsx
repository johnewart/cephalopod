import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input, Button, List, Spin, Alert, Avatar } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { trpc } from '../lib/trpc';
import { swiftarrImageThumbUrl, swiftarrUserIdenticonUrl } from '../lib/swiftarrImage';
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

/** Resolve avatar URL from Swiftarr fez post `author` (UserHeader-like). */
function postAuthorAvatarSrc(baseUrl: string, post: unknown): string | undefined {
  if (!baseUrl || !isRecord(post)) return undefined;
  const author = post.author;
  if (!isRecord(author)) return undefined;
  const img = pickStringField(author, ['userImage', 'user_image', 'image', 'avatarURL', 'avatarUrl', 'avatar']);
  if (img) return swiftarrImageThumbUrl(baseUrl, img);
  const uid = pickStringField(author, ['userID', 'userId', 'user_id', 'id']);
  if (uid) return swiftarrUserIdenticonUrl(baseUrl, uid);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 16 }}>
        <Spin tip="Loading…" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error.message} showIcon style={{ margin: 16 }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: '#1B1D23' }}>
      <div style={{ padding: '20px 24px', flexShrink: 0, background: '#1B1D23', borderBottom: '1px solid #3d4149' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#EFECE2' }}>{fez?.title ?? 'Conversation'}</h2>
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
        <List
          dataSource={posts}
          split={false}
          renderItem={(post, i) => {
            const username = post.author?.username ?? '';
            const initial = username ? username.charAt(0).toUpperCase() : '?';
            const avatarSrc = postAuthorAvatarSrc(baseUrl, post);
            return (
              <List.Item
                key={post.postID ?? `post-${i}`}
                style={{
                  marginBottom: 12,
                  padding: 0,
                  border: 'none',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%' }}>
                  <Avatar
                    size={36}
                    src={avatarSrc}
                    style={{ background: '#365563', color: '#EFECE2', borderRadius: 8, flexShrink: 0 }}
                  >
                    {initial}
                  </Avatar>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '12px 16px',
                      borderRadius: 8,
                      background: '#292B32',
                      border: '1px solid #3d4149',
                      maxWidth: '85%',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        color: '#EFECE2',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {post.text ?? ''}
                    </span>
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      </div>
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 12, padding: '20px 24px', borderTop: '1px solid #3d4149', flexShrink: 0, background: '#16171C' }}>
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message…"
          disabled={postMutation.isPending}
          style={{ flex: 1 }}
          size="large"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          htmlType="submit"
          loading={postMutation.isPending}
          disabled={!newMessage.trim()}
          size="large"
        >
          Send
        </Button>
      </form>
    </div>
  );
}
