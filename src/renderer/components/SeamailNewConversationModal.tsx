import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Input, Button, List, Spin, Tag, message, Avatar } from 'antd';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';
import { twitarrImageThumbUrl, twitarrUserIdenticonUrl } from '../lib/twitarrImage';

export type SeamailNewConversationModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (fezId: string) => void;
};

type ProfileHit = {
  userID: string;
  username: string;
  displayName: string | null;
  /** Twitarr avatar filename when present */
  userImage: string | null;
};

function dedupeProfiles(rows: ProfileHit[]): ProfileHit[] {
  const seen = new Set<string>();
  const next: ProfileHit[] = [];
  for (const r of rows) {
    const key = r.userID.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(r);
  }
  return next;
}

function profilesFromMatchPayload(data: unknown): ProfileHit[] {
  const out: ProfileHit[] = [];
  const push = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    const userID =
      typeof o.userID === 'string'
        ? o.userID
        : typeof o.userId === 'string'
          ? o.userId
          : typeof o.id === 'string'
            ? o.id
            : '';
    const username = typeof o.username === 'string' ? o.username : '';
    const uid = (userID || username).trim();
    const uname = (username || userID).trim();
    if (!uid) return;
    const displayName = typeof o.displayName === 'string' ? o.displayName : null;
    const userImageRaw =
      typeof o.userImage === 'string'
        ? o.userImage
        : typeof o.user_image === 'string'
          ? o.user_image
          : typeof o.image === 'string'
            ? o.image
            : typeof o.avatarURL === 'string'
              ? o.avatarURL
              : typeof o.avatarUrl === 'string'
                ? o.avatarUrl
                : typeof o.avatar === 'string'
                  ? o.avatar
                  : null;
    const userImage = userImageRaw?.trim() ? userImageRaw.trim() : null;
    out.push({ userID: uid, username: uname, displayName, userImage });
  };
  if (Array.isArray(data)) {
    data.forEach(push);
    return dedupeProfiles(out);
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['users', 'matches', 'nameMatches', 'results', 'userHeaders']) {
      const a = o[k];
      if (Array.isArray(a)) {
        a.forEach(push);
        return dedupeProfiles(out);
      }
    }
  }
  return dedupeProfiles(out);
}

function usernamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function profileAvatarSrc(baseUrl: string, p: ProfileHit): string | undefined {
  if (p.userImage) {
    const img = p.userImage.trim();
    if (/^https?:\/\//i.test(img)) return img;
    if (img.startsWith('/') && baseUrl) return `${baseUrl.replace(/\/$/, '')}${img}`;
    if (baseUrl) return twitarrImageThumbUrl(baseUrl, img);
  }
  if (baseUrl && p.userID) return twitarrUserIdenticonUrl(baseUrl, p.userID);
  return undefined;
}

function profileInitial(p: ProfileHit): string {
  const label = (p.displayName && p.displayName.trim()) || p.username || '?';
  return label.charAt(0).toUpperCase();
}

export function SeamailNewConversationModal({ open, onClose, onCreated }: SeamailNewConversationModalProps) {
  const currentUsername = useStore((s) => s.auth.username);
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const [title, setTitle] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<ProfileHit[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setSearchInput('');
      setDebouncedSearch('');
      setSelected([]);
    }
  }, [open]);

  const { data: rawMatches, isFetching } = trpc.usersMatchAllNames.useQuery(
    { search: debouncedSearch },
    { enabled: open && debouncedSearch.length >= 2 },
  );

  const matches = useMemo(() => {
    const rows = profilesFromMatchPayload(rawMatches);
    if (!currentUsername) return rows;
    return rows.filter((r) => !usernamesMatch(r.username, currentUsername));
  }, [rawMatches, currentUsername]);

  const utils = trpc.useUtils();
  const createMutation = trpc.fezCreateSeamail.useMutation({
    onSuccess: (res) => {
      message.success('Conversation created');
      void utils.fezJoined.invalidate();
      onCreated(res.fezId);
      onClose();
    },
    onError: (err) => {
      message.error(err.message || 'Could not create conversation');
    },
  });

  const toggleSelect = useCallback((p: ProfileHit) => {
    setSelected((prev) => {
      const key = p.userID.toLowerCase();
      if (prev.some((x) => x.userID.toLowerCase() === key)) {
        return prev.filter((x) => x.userID.toLowerCase() !== key);
      }
      return [...prev, p];
    });
  }, []);

  const removeSelected = useCallback((userID: string) => {
    const key = userID.toLowerCase();
    setSelected((prev) => prev.filter((x) => x.userID.toLowerCase() !== key));
  }, []);

  const handleSubmit = () => {
    const t = title.trim();
    if (t.length < 2) {
      message.warning('Title must be at least 2 characters');
      return;
    }
    if (selected.length === 0) {
      message.warning('Add at least one participant');
      return;
    }
    createMutation.mutate({
      title: t,
      userIds: selected.map((s) => s.userID),
    });
  };

  const selectedKeys = useMemo(() => new Set(selected.map((s) => s.userID.toLowerCase())), [selected]);

  return (
    <Modal
      open={open}
      title="New conversation"
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="ok" type="primary" loading={createMutation.isPending} onClick={handleSubmit}>
          Start conversation
        </Button>,
      ]}
      width={440}
      destroyOnClose
      styles={{ body: { paddingTop: 12 } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: '#7A7490', marginBottom: 6 }}>Title</div>
          <Input
            placeholder="e.g. Dinner plans"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            showCount
            disabled={createMutation.isPending}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#7A7490', marginBottom: 6 }}>Add people</div>
          <Input.Search
            placeholder="Search by name or username (min 2 characters)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            allowClear
            disabled={createMutation.isPending}
          />
          {selected.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {selected.map((p) => {
                const label = (p.displayName && p.displayName.trim()) || p.username;
                const src = profileAvatarSrc(baseUrl, p);
                return (
                  <Tag
                    key={p.userID}
                    closable
                    onClose={() => removeSelected(p.userID)}
                    style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 4px' }}
                  >
                    <Avatar
                      size={22}
                      src={src}
                      style={{ flexShrink: 0, background: '#365563', color: '#EFECE2', fontSize: 11 }}
                    >
                      {profileInitial(p)}
                    </Avatar>
                    <span>{label}</span>
                  </Tag>
                );
              })}
            </div>
          ) : null}
        </div>
        <div
          style={{
            border: '1px solid #3d4149',
            borderRadius: 8,
            minHeight: 160,
            maxHeight: 220,
            overflow: 'auto',
            background: '#292B32',
          }}
        >
          {debouncedSearch.length < 2 ? (
            <div style={{ padding: 16, color: '#7A7490', fontSize: 13 }}>Type at least 2 characters to search.</div>
          ) : isFetching ? (
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
              <Spin />
            </div>
          ) : matches.length === 0 ? (
            <div style={{ padding: 16, color: '#7A7490', fontSize: 13 }}>No matching profiles.</div>
          ) : (
            <List
              size="small"
              dataSource={matches}
              split={false}
              renderItem={(p) => {
                const label = (p.displayName && p.displayName.trim()) || p.username;
                const sub = p.displayName && p.displayName.trim() ? p.username : '';
                const isOn = selectedKeys.has(p.userID.toLowerCase());
                const avatarSrc = profileAvatarSrc(baseUrl, p);
                return (
                  <List.Item
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      background: isOn ? 'rgba(111, 69, 143, 0.12)' : undefined,
                    }}
                    onClick={() => toggleSelect(p)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <Avatar
                        size={36}
                        src={avatarSrc}
                        style={{ flexShrink: 0, background: '#365563', color: '#EFECE2' }}
                      >
                        {profileInitial(p)}
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#EFECE2', fontWeight: 500 }}>{label}</div>
                        {sub ? <div style={{ fontSize: 11, color: '#7A7490' }}>@{sub}</div> : null}
                      </div>
                      {isOn ? <span style={{ fontSize: 11, color: '#6F458F', fontWeight: 600 }}>Added</span> : null}
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
