import { useState } from 'react';
import { Layout } from 'antd';
import { IconMessages } from '@tabler/icons-react';
import { SeamailList } from './SeamailList';
import { SeamailConversation } from './SeamailConversation';

export function SeamailView() {
  const [selectedFezId, setSelectedFezId] = useState<string | null>(null);

  return (
    <Layout style={{ flex: 1, minHeight: 0, background: '#1B1D23' }}>
      <Layout.Sider width={360} style={{ background: '#2A2D34', borderRight: '1px solid #3d4149' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #3d4149', fontWeight: 600, fontSize: 14, color: '#EFECE2', display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconMessages size={18} stroke={1.5} style={{ color: '#6F458F' }} />
          Messages
        </div>
        <SeamailList selectedFezId={selectedFezId} onSelectFez={setSelectedFezId} />
      </Layout.Sider>
      <Layout.Content style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#1B1D23' }}>
        {selectedFezId ? (
          <SeamailConversation fezId={selectedFezId} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A7490', fontSize: 14 }}>
            Select a conversation
          </div>
        )}
      </Layout.Content>
    </Layout>
  );
}
