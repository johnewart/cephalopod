import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Menu, Avatar, Button, Badge } from 'antd';
import { SettingOutlined, LogoutOutlined } from '@ant-design/icons';
import {
  IconCalendar,
  IconChess,
  IconLayoutList,
  IconMessages,
  IconPhoto,
  IconPuzzle,
  IconUsersGroup,
} from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';
import { twitarrImageThumbUrl, twitarrUserIdenticonUrl } from '../lib/twitarrImage';
import { profileResponseToFormDefaults } from '../lib/twitarrProfile';
import { APP_SIDER_WIDTH } from './WindowChrome';
import { seamailDirectMessageChatsUnreadTotal, seamailTotalUnread } from '../lib/seamailUnread';

interface AppShellProps {
  messagesPanel: ReactNode;
  photostreamPanel: ReactNode;
  calendarPanel: ReactNode;
  forumsPanel: ReactNode;
  boardgamesPanel: ReactNode;
  huntsPanel: ReactNode;
  lfgPanel: ReactNode;
  settingsPanel: ReactNode;
}

type NavItem =
  | 'messages'
  | 'photostream'
  | 'calendar'
  | 'forums'
  | 'boardgames'
  | 'hunts'
  | 'lfg'
  | 'settings';

export function AppShell({
  messagesPanel,
  photostreamPanel,
  calendarPanel,
  forumsPanel,
  boardgamesPanel,
  huntsPanel,
  lfgPanel,
  settingsPanel,
}: AppShellProps) {
  const [activeNav, setActiveNav] = useState<NavItem>('messages');
  const username = useStore((s) => s.auth.username);
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const logoutMutation = trpc.logout.useMutation();
  const profileQuery = trpc.userProfileGet.useQuery(undefined, {
    staleTime: 15 * 60 * 1000,
  });
  const fezJoinedQuery = trpc.fezJoined.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });

  const unreadTotal = useMemo(
    () => (fezJoinedQuery.data !== undefined ? seamailTotalUnread(fezJoinedQuery.data) : 0),
    [fezJoinedQuery.data],
  );

  const dockChatUnread = useMemo(
    () =>
      fezJoinedQuery.data !== undefined ? seamailDirectMessageChatsUnreadTotal(fezJoinedQuery.data, username) : 0,
    [fezJoinedQuery.data, username],
  );

  const prevUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (fezJoinedQuery.data === undefined) return;

    const total = seamailTotalUnread(fezJoinedQuery.data);
    const prev = prevUnreadRef.current;

    if (prev === null) {
      prevUnreadRef.current = total;
      return;
    }

    if (total > prev) {
      const delta = total - prev;
      const inBackground = typeof document !== 'undefined' && document.hidden;
      const notOnMessages = activeNav !== 'messages';
      if (inBackground || notOnMessages) {
        const title = delta === 1 ? 'New message' : 'New messages';
        const body =
          delta === 1
            ? 'You have a new unread seamail message.'
            : `${delta} new unread seamail messages.`;
        const show = () => {
          try {
            new Notification(title, { body, tag: 'cephalopod-seamail-unread' });
          } catch {
            /* ignore */
          }
        };
        if (Notification.permission === 'granted') {
          show();
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission().then((p) => {
            if (p === 'granted') show();
          });
        }
      }
    }

    prevUnreadRef.current = total;
  }, [fezJoinedQuery.data, activeNav]);

  useEffect(() => {
    window.cephalopod?.setDockUnreadCount?.(dockChatUnread);
  }, [dockChatUnread]);

  const initial = username ? username.charAt(0).toUpperCase() : '?';

  const userAvatarSrc = useMemo(() => {
    const d = profileResponseToFormDefaults(profileQuery.data);
    if (!baseUrl) return undefined;
    if (d.userImage) return twitarrImageThumbUrl(baseUrl, d.userImage);
    if (d.userId) return twitarrUserIdenticonUrl(baseUrl, d.userId);
    return undefined;
  }, [baseUrl, profileQuery.data]);

  const menuItems = useMemo(
    () => [
      {
        key: 'messages',
        icon: <IconMessages size={16} stroke={1.5} />,
        label: (
          <Badge count={unreadTotal} size="small" overflowCount={99} color="#6F458F">
            <span>Messages</span>
          </Badge>
        ),
      },
      { key: 'photostream', icon: <IconPhoto size={16} stroke={1.5} />, label: 'Photostream' },
      { key: 'calendar', icon: <IconCalendar size={16} stroke={1.5} />, label: 'Events' },
      { key: 'forums', icon: <IconLayoutList size={16} stroke={1.5} />, label: 'Forums' },
      { key: 'boardgames', icon: <IconChess size={16} stroke={1.5} />, label: 'Board games' },
      { key: 'hunts', icon: <IconPuzzle size={16} stroke={1.5} />, label: 'Hunts' },
      { key: 'lfg', icon: <IconUsersGroup size={16} stroke={1.5} />, label: 'LFG' },
      { key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
    ],
    [unreadTotal],
  );

  return (
    <Layout style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', background: '#16171C' }}>
      <Layout.Sider width={APP_SIDER_WIDTH} style={{ background: '#2C3031', borderRight: '1px solid #3d4149' }}>
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid #3d4149',
            width: '100%',
          }}
        >
          <Avatar
            size={112}
            src="/images/cephy.png"
            style={{ flexShrink: 0, border: '3px solid #fff', boxSizing: 'content-box' }}
          />
          <span
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: '#EFECE2',
              lineHeight: 1.2,
              textAlign: 'center',
              width: '100%',
            }}
          >
            Cephalopod
          </span>
        </div>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #3d4149', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            size={36}
            src={userAvatarSrc}
            style={{ background: '#365563', color: '#EFECE2', borderRadius: 8, flexShrink: 0 }}
          >
            {initial}
          </Avatar>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#EFECE2',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {username ? `@${username}` : ''}
          </span>
        </div>
        <Menu
          className="app-sider-menu"
          selectedKeys={[activeNav]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => setActiveNav(key as NavItem)}
          style={{ flex: 1, borderRight: 'none', marginTop: 8, fontSize: 13 }}
        />
        <div style={{ padding: 12, borderTop: '1px solid #3d4149' }}>
          <Button
            icon={<LogoutOutlined />}
            type="text"
            block
            style={{ color: '#9A9D9A', textAlign: 'left', fontSize: 13 }}
            onClick={() => logoutMutation.mutate()}
          >
            Log out
          </Button>
        </div>
      </Layout.Sider>
      <Layout.Content style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1B1D23', overflow: 'hidden' }}>
        {activeNav === 'messages' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {messagesPanel}
          </div>
        ) : activeNav === 'photostream' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {photostreamPanel}
          </div>
        ) : activeNav === 'calendar' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {calendarPanel}
          </div>
        ) : activeNav === 'forums' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {forumsPanel}
          </div>
        ) : activeNav === 'boardgames' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {boardgamesPanel}
          </div>
        ) : activeNav === 'hunts' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {huntsPanel}
          </div>
        ) : activeNav === 'lfg' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {lfgPanel}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {settingsPanel}
          </div>
        )}
      </Layout.Content>
    </Layout>
  );
}
