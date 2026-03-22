import { useState } from 'react';
import { Input, Button, List, Spin, Alert, Avatar } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { trpc } from '../lib/trpc';

interface SeamailConversationProps {
  fezId: string;
}

export function SeamailConversation({ fezId }: SeamailConversationProps) {
  const [newMessage, setNewMessage] = useState('');
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.fezGet.useQuery({ fezId });
  const postMutation = trpc.fezPostAdd.useMutation({
    onSuccess: () => {
      setNewMessage('');
      utils.fezGet.invalidate({ fezId });
    },
  });

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

  const fez = data as {
    title?: string;
    members?: {
      posts?: Array<{ postID?: number; text?: string; author?: { username?: string } }>;
    };
  } | undefined;
  const posts = fez?.members?.posts ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: '#1B1D23' }}>
      <div style={{ padding: '20px 24px', flexShrink: 0, background: '#1B1D23', borderBottom: '1px solid #3d4149' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#EFECE2' }}>{fez?.title ?? 'Conversation'}</h2>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
        <List
          dataSource={posts}
          split={false}
          renderItem={(post, i) => {
            const username = post.author?.username ?? '';
            const initial = username ? username.charAt(0).toUpperCase() : '?';
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
                    <span style={{ fontSize: 14, color: '#EFECE2' }}>{post.text ?? ''}</span>
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
