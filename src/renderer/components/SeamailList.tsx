import { List, Spin, Alert } from 'antd';
import { trpc } from '../lib/trpc';

interface SeamailListProps {
  selectedFezId: string | null;
  onSelectFez: (fezId: string) => void;
}

export function SeamailList({ selectedFezId, onSelectFez }: SeamailListProps) {
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
      style={{ flex: 1, overflow: 'auto', padding: '8px 8px 16px' }}
      dataSource={fezzes}
      split={false}
      renderItem={(fez: { fezID?: string; id?: string; title?: string }, i: number) => {
        const fezId = fez.fezID ?? fez.id ?? String(i);
        const isSelected = selectedFezId === fezId;
        return (
          <List.Item
            key={fezId}
            style={{
              cursor: 'pointer',
              padding: '10px 12px',
              margin: '0 4px 4px',
              borderRadius: 8,
              background: isSelected ? 'rgba(173, 253, 67, 0.14)' : 'transparent',
              border: isSelected ? '1px solid rgba(173, 253, 67, 0.35)' : '1px solid transparent',
              color: isSelected ? '#ADFD43' : '#EFECE2',
            }}
            onClick={() => onSelectFez(fezId)}
          >
            <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
              {fez.title ?? fez.fezID ?? fez.id ?? 'Conversation'}
            </span>
          </List.Item>
        );
      }}
    />
  );
}
