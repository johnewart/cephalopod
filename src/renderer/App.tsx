import { useLayoutEffect } from 'react';
import { Avatar, Typography } from 'antd';
import { WindowDragStrip } from './components/WindowChrome';
import { useStore } from './hooks/useStore';
import { LoginForm } from './components/LoginForm';
import { AppShell } from './components/AppShell';
import { SeamailView } from './components/SeamailView';
import { PhotostreamView } from './components/PhotostreamView';
import { EventsCalendarView } from './components/EventsCalendarView';
import { ForumsView } from './components/ForumsView';
import { LfgView } from './components/LfgView';
import { SettingsView } from './components/SettingsView';

const { Title } = Typography;

export default function App() {
  const isAuthenticated = useStore((s) => s.auth.isAuthenticated);

  useLayoutEffect(() => {
    const p = window.cephalopod?.platform;
    if (p) document.documentElement.dataset.platform = p;
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#16171C', color: '#EFECE2' }}>
      <WindowDragStrip />
      {!isAuthenticated ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: 40 }}>
          <Avatar
            size={200}
            src="/images/cephy.png"
            style={{ flexShrink: 0, border: '4px solid #fff', boxSizing: 'content-box' }}
          />
          <Title level={2} style={{ margin: 0, color: '#EFECE2', fontWeight: 600 }}>
            Cephalopod
          </Title>
          <div
            style={{
              padding: 32,
              background: '#2A2D34',
              borderRadius: 12,
              border: '1px solid #3d4149',
              boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
              maxWidth: 400,
              width: '100%',
            }}
          >
            <LoginForm />
          </div>
        </div>
      ) : (
        <AppShell
          messagesPanel={<SeamailView />}
          photostreamPanel={<PhotostreamView />}
          calendarPanel={<EventsCalendarView />}
          forumsPanel={<ForumsView />}
          lfgPanel={<LfgView />}
          settingsPanel={<SettingsView />}
        />
      )}
    </div>
  );
}
