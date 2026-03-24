import { List, Spin, Alert } from 'antd';
import { IconMessageCircle, IconMessages } from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';
import type { FezJoinedRow, UserHeaderLike } from '../lib/seamailUnread';
import { isFezJoinedDirectMessage, seamailUnreadCount } from '../lib/seamailUnread';

interface SeamailListProps {
  selectedFezId: string | null;
  onSelectFez: (fezId: string) => void;
}

function usernamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function directMessagePeer(
  fez: FezJoinedRow,
  currentUsername: string | null,
): UserHeaderLike | null {
  if (!isFezJoinedDirectMessage(fez, currentUsername)) return null;
  const parts = fez.members!.participants!;
  return parts.find((p) => !usernamesMatch(p.username, currentUsername)) ?? null;
}

/** Primary line for the list row: other user for DMs, fez title for groups. */
function seamailRowTitle(fez: FezJoinedRow, currentUsername: string | null): string {
  const peer = directMessagePeer(fez, currentUsername);
  if (peer) {
    const name = (peer.displayName && peer.displayName.trim()) || peer.username;
    if (name) return name;
  }
  return fez.title ?? fez.fezID ?? fez.id ?? 'Conversation';
}

export function SeamailList({ selectedFezId, onSelectFez }: SeamailListProps) {
  const currentUsername = useStore((s) => s.auth.username);
  const { data, isLoading, error } = trpc.fezJoined.useQuery();

  if (isLoading) {
    return (
      <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
        <Spin tip="Loading conversations…" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error.message} showIcon style={{ margin: 16 }} />;
  }

  const fezzes = Array.isArray(data) ? data : (data as { fezzes?: unknown[] })?.fezzes ?? [];

  if (!Array.isArray(fezzes) || fezzes.length === 0) {
    return (
      <div style={{ padding: 16, color: '#7A7490', fontSize: 13 }}>No seamail conversations</div>
    );
  }

  return (
    <List
      style={{ flex: 1, overflow: 'auto', padding: '6px 6px 10px' }}
      dataSource={fezzes as FezJoinedRow[]}
      split={false}
      renderItem={(fez, i) => {
        const fezId = fez.fezID ?? fez.id ?? String(i);
        const isSelected = selectedFezId === fezId;
        const unread = seamailUnreadCount(fez);
        const titleColor = isSelected ? '#6F458F' : '#EFECE2';
        const iconColor = isSelected ? '#6F458F' : '#7A7490';
        const isDm = isFezJoinedDirectMessage(fez, currentUsername);
        const rowTitle = seamailRowTitle(fez, currentUsername);
        const MessageIcon = isDm ? IconMessageCircle : IconMessages;

        return (
          <List.Item
            key={fezId}
            style={{
              cursor: 'pointer',
              padding: '6px 10px',
              margin: '0 2px 2px',
              borderRadius: 6,
              background: isSelected ? 'rgba(111, 69, 143, 0.14)' : 'transparent',
              border: isSelected ? '1px solid rgba(111, 69, 143, 0.35)' : '1px solid transparent',
              color: titleColor,
            }}
            onClick={() => onSelectFez(fezId)}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                minWidth: 0,
              }}
            >
              <MessageIcon size={17} stroke={1.5} style={{ color: iconColor, flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                  color: titleColor,
                }}
              >
                {rowTitle}
              </span>
              {unread > 0 ? (
                <span
                  aria-label={`${unread} unread`}
                  style={{
                    flexShrink: 0,
                    minWidth: 18,
                    height: 18,
                    padding: unread > 9 ? '0 5px' : '0 4px',
                    borderRadius: 9,
                    background: '#6F458F',
                    color: '#EFECE2',
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: '18px',
                    textAlign: 'center',
                  }}
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : (
                <span style={{ flexShrink: 0, width: 18 }} aria-hidden />
              )}
            </div>
          </List.Item>
        );
      }}
    />
  );
}
