import { ReactNode, useState } from 'react';
import { Layout, Menu, Avatar, Button } from 'antd';
import { SettingOutlined, LogoutOutlined } from '@ant-design/icons';
import { IconCalendar, IconLayoutList, IconMessages, IconPhoto } from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';

interface AppShellProps {
  messagesPanel: ReactNode;
  photostreamPanel: ReactNode;
  calendarPanel: ReactNode;
  forumsPanel: ReactNode;
}

type NavItem = 'messages' | 'photostream' | 'calendar' | 'forums' | 'settings';

export function AppShell({ messagesPanel, photostreamPanel, calendarPanel, forumsPanel }: AppShellProps) {
  const [activeNav, setActiveNav] = useState<NavItem>('messages');
  const username = useStore((s) => s.auth.username);
  const logoutMutation = trpc.logout.useMutation();

  const initial = username ? username.charAt(0).toUpperCase() : '?';

  const menuItems = [
    { key: 'messages', icon: <IconMessages size={18} />, label: 'Messages' },
    { key: 'photostream', icon: <IconPhoto size={18} />, label: 'Photostream' },
    { key: 'calendar', icon: <IconCalendar size={18} />, label: 'Calendar' },
    { key: 'forums', icon: <IconLayoutList size={18} />, label: 'Forums' },
    { key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
  ];

  return (
    <Layout style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', background: '#16171C' }}>
      <Layout.Sider width={240} style={{ background: '#2C3031', borderRight: '1px solid #3d4149' }}>
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
          <Avatar size={36} style={{ background: '#365563', color: '#EFECE2', borderRadius: 8 }}>{initial}</Avatar>
          <span style={{ fontSize: 14, color: '#9A9D9A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {username ?? ''}
          </span>
        </div>
        <Menu
          selectedKeys={[activeNav]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => setActiveNav(key as NavItem)}
          style={{ flex: 1, borderRight: 'none', marginTop: 8 }}
        />
        <div style={{ padding: 12, borderTop: '1px solid #3d4149' }}>
          <Button
            icon={<LogoutOutlined />}
            type="text"
            block
            style={{ color: '#9A9D9A', textAlign: 'left' }}
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
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A7490', fontSize: 14 }}>
            Settings coming soon
          </div>
        )}
      </Layout.Content>
    </Layout>
  );
}
