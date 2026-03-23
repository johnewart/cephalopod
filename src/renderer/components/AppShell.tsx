import { ReactNode, useMemo, useState } from 'react';
import { Layout, Menu, Avatar, Button } from 'antd';
import { SettingOutlined, LogoutOutlined } from '@ant-design/icons';
import { IconCalendar, IconLayoutList, IconMessages, IconPhoto, IconUsersGroup } from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';
import { twitarrImageThumbUrl, twitarrUserIdenticonUrl } from '../lib/twitarrImage';
import { profileResponseToFormDefaults } from '../lib/twitarrProfile';
import { APP_SIDER_WIDTH } from './WindowChrome';

interface AppShellProps {
  messagesPanel: ReactNode;
  photostreamPanel: ReactNode;
  calendarPanel: ReactNode;
  forumsPanel: ReactNode;
  lfgPanel: ReactNode;
  settingsPanel: ReactNode;
}

type NavItem = 'messages' | 'photostream' | 'calendar' | 'forums' | 'lfg' | 'settings';

export function AppShell({
  messagesPanel,
  photostreamPanel,
  calendarPanel,
  forumsPanel,
  lfgPanel,
  settingsPanel,
}: AppShellProps) {
  const [activeNav, setActiveNav] = useState<NavItem>('messages');
  const username = useStore((s) => s.auth.username);
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const logoutMutation = trpc.logout.useMutation();
  const profileQuery = trpc.userProfileGet.useQuery();

  const initial = username ? username.charAt(0).toUpperCase() : '?';

  const userAvatarSrc = useMemo(() => {
    const d = profileResponseToFormDefaults(profileQuery.data);
    if (!baseUrl) return undefined;
    if (d.userImage) return twitarrImageThumbUrl(baseUrl, d.userImage);
    if (d.userId) return twitarrUserIdenticonUrl(baseUrl, d.userId);
    return undefined;
  }, [baseUrl, profileQuery.data]);

  const menuItems = [
    { key: 'messages', icon: <IconMessages size={16} stroke={1.5} />, label: 'Messages' },
    { key: 'photostream', icon: <IconPhoto size={16} stroke={1.5} />, label: 'Photostream' },
    { key: 'calendar', icon: <IconCalendar size={16} stroke={1.5} />, label: 'Events' },
    { key: 'forums', icon: <IconLayoutList size={16} stroke={1.5} />, label: 'Forums' },
    { key: 'lfg', icon: <IconUsersGroup size={16} stroke={1.5} />, label: 'LFG' },
    { key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
  ];

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
