import { useState } from 'react';
import { IconMessages } from '@tabler/icons-react';
import { SeamailList } from './SeamailList';
import { SeamailConversation } from './SeamailConversation';

/** Match `ForumsView` categories column width and chrome. */
const LIST_CARD_WIDTH = 300;

export function SeamailView() {
  const [selectedFezId, setSelectedFezId] = useState<string | null>(null);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 16,
        padding: 16,
        background: '#1B1D23',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: LIST_CARD_WIDTH,
          flexShrink: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#24272e',
          border: '1px solid #3d4149',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            padding: '10px 14px',
            borderBottom: '1px solid #3d4149',
            fontWeight: 600,
            fontSize: 13,
            color: '#EFECE2',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#24272e',
          }}
        >
          <IconMessages size={16} stroke={1.5} style={{ color: '#6F458F' }} />
          Messages
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <SeamailList selectedFezId={selectedFezId} onSelectFez={setSelectedFezId} />
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #3d4149',
          borderRadius: 10,
          background: '#24272e',
          overflow: 'hidden',
        }}
      >
        {selectedFezId ? (
          <SeamailConversation fezId={selectedFezId} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A7490', fontSize: 13 }}>
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
