import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layout, List, Spin, Alert, Input, Button, Avatar, Collapse, Select } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import {
  IconCoffee,
  IconDeviceGamepad2,
  IconDice5,
  IconMap2,
  IconMovie,
  IconMusic,
  IconRun,
  IconToolsKitchen2,
  IconUsersGroup,
} from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { swiftarrImageThumbUrl, swiftarrUserIdenticonUrl } from '../lib/swiftarrImage';
import { useStore } from '../hooks/useStore';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function pickStringField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

type UserHeaderLike = {
  username?: string;
  displayName?: string | null;
};

/** Row from `GET /fez/open` or `GET /fez/joined` (FezData-like). */
type FezRow = {
  fezID?: string;
  id?: string;
  title?: string;
  fezType?: string;
  startTime?: string;
  scheduledTime?: string;
  members?: {
    participants?: UserHeaderLike[];
    postCount?: number;
    posts?: unknown[];
  };
};

const LFG_ICON_COMMON = { size: 20 as const, stroke: 1.5 as const };

/** Pick icon from Swiftarr `fezType` label (heuristic keywords). */
function LfgTypeIcon({ fezType, color }: { fezType?: string; color: string }) {
  const style: CSSProperties = { color, flexShrink: 0, marginTop: 2 };
  const t = (fezType ?? '').toLowerCase();
  if (/game|gaming|dnd|d&d|rpg|board|tabletop|ttrpg|cards|deck|magic/.test(t)) {
    return <IconDice5 {...LFG_ICON_COMMON} style={style} />;
  }
  if (/video|console|xbox|playstation|switch|steam|esports/.test(t)) {
    return <IconDeviceGamepad2 {...LFG_ICON_COMMON} style={style} />;
  }
  if (/food|meal|dining|lunch|dinner|brunch|restaurant|eat|buffet/.test(t)) {
    return <IconToolsKitchen2 {...LFG_ICON_COMMON} style={style} />;
  }
  if (/sport|run|walk|fitness|gym|yoga|bike|swim|hike|pickup/.test(t)) {
    return <IconRun {...LFG_ICON_COMMON} style={style} />;
  }
  if (/music|karaoke|concert|band|dj|sing/.test(t)) {
    return <IconMusic {...LFG_ICON_COMMON} style={style} />;
  }
  if (/movie|film|cinema|tv|watch|show/.test(t)) {
    return <IconMovie {...LFG_ICON_COMMON} style={style} />;
  }
  if (/coffee|tea|drinks|bar|pub|social|meet|hangout|chat/.test(t)) {
    return <IconCoffee {...LFG_ICON_COMMON} style={style} />;
  }
  if (/tour|shore|excursion|port|map|dock/.test(t)) {
    return <IconMap2 {...LFG_ICON_COMMON} style={style} />;
  }
  return <IconUsersGroup {...LFG_ICON_COMMON} style={style} />;
}

function fezStartMs(fez: FezRow): number | null {
  const s = pickStringField(fez as Record<string, unknown>, ['startTime', 'scheduledTime', 'eventTime', 'start']);
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** Client-side guard: only rows with no start time or start in the future (server also sends hidePast). */
function isFezUpcoming(fez: FezRow, nowMs = Date.now()): boolean {
  const t = fezStartMs(fez);
  if (t == null) return true;
  return t >= nowMs - 60_000;
}

function maxSpotsForFez(fez: FezRow): number | undefined {
  const r = fez as Record<string, unknown>;
  const n = r.maxParticipants;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return Math.floor(n);
  const s = pickStringField(r, ['maxParticipants', 'maxSize', 'capacity', 'memberLimit', 'maxMembers']);
  if (s) {
    const p = parseInt(s.replace(/\D/g, ''), 10);
    if (!Number.isNaN(p) && p > 0) return p;
  }
  return undefined;
}

/** Text used for quick search (title, type, info fields, first post). */
function fezSearchBlob(fez: FezRow): string {
  const r = fez as Record<string, unknown>;
  const parts: string[] = [];
  if (fez.title) parts.push(fez.title);
  if (fez.fezType) parts.push(fez.fezType);
  const info =
    pickStringField(r, ['info', 'details', 'detail', 'description', 'body']) ??
    pickStringField(r, ['activity', 'activityDescription', 'activity_description']);
  if (info) parts.push(info);
  const posts = fez.members?.posts;
  if (Array.isArray(posts) && posts[0] && isRecord(posts[0])) {
    const t = pickStringField(posts[0] as Record<string, unknown>, ['text', 'markdown', 'message']);
    if (t) parts.push(t);
  }
  return parts.join('\n').toLowerCase();
}

function usernamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Same idea as SeamailList: 1:1 threads are DMs, not LFG. */
function isDirectMessageRow(fez: FezRow, currentUsername: string | null): boolean {
  const parts = fez.members?.participants;
  if (!parts || parts.length !== 2 || !currentUsername) return false;
  return parts.some((p) => usernamesMatch(p.username, currentUsername));
}

function userIsParticipant(
  fez: { members?: { participants?: UserHeaderLike[] } } | undefined,
  currentUsername: string | null,
): boolean {
  if (!fez?.members?.participants || !currentUsername) return false;
  return fez.members.participants.some((p) => usernamesMatch(p.username, currentUsername));
}

function participantCount(fez: FezRow | undefined): number {
  const n = fez?.members?.participants?.length;
  return typeof n === 'number' ? n : 0;
}

function spotsSubtitle(fez: FezRow): string {
  const n = participantCount(fez);
  const max = maxSpotsForFez(fez);
  if (max != null) return `${n} / ${max} spots`;
  if (n > 0) return `${n} ${n === 1 ? 'person' : 'people'}`;
  return 'Be the first to join';
}

/** Real fez UUID from API — use for membership and fezGet, not list index. */
function canonicalFezId(fez: FezRow): string | undefined {
  const a = typeof fez.fezID === 'string' ? fez.fezID.trim() : '';
  if (a) return a;
  const b = typeof fez.id === 'string' ? fez.id.trim() : '';
  if (b) return b;
  return undefined;
}

function fezzesFromRoot(data: unknown): FezRow[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data.filter(isRecord) as FezRow[];
  if (!isRecord(data)) return [];
  const fezzes = data.fezzes;
  if (Array.isArray(fezzes)) return fezzes.filter(isRecord) as FezRow[];
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && v.length > 0 && isRecord(v[0])) {
      return v.filter(isRecord) as FezRow[];
    }
  }
  return [];
}

/** Resolve avatar URL from Swiftarr fez post `author` (UserHeader-like). */
function postAuthorAvatarSrc(baseUrl: string, post: unknown): string | undefined {
  if (!baseUrl || !isRecord(post)) return undefined;
  const author = post.author;
  if (!isRecord(author)) return undefined;
  const img = pickStringField(author, ['userImage', 'user_image', 'image', 'avatarURL', 'avatarUrl', 'avatar']);
  if (img) return swiftarrImageThumbUrl(baseUrl, img);
  const uid = pickStringField(author, ['userID', 'userId', 'user_id', 'id']);
  if (uid) return swiftarrUserIdenticonUrl(baseUrl, uid);
  return undefined;
}

function formatMetaWhen(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  return new Date(d).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function LfgBrowseList({
  rows,
  selectedFezId,
  onSelectFez,
  emptyLabel,
}: {
  rows: FezRow[];
  selectedFezId: string | null;
  onSelectFez: (fezId: string) => void;
  /** Shown when `rows` is empty (e.g. different copy when filters are active). */
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, color: '#7A7490', fontSize: 13 }}>
        {emptyLabel ?? 'No open LFG listings right now'}
      </div>
    );
  }

  return (
    <List
      style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 8px 16px' }}
      dataSource={rows}
      split={false}
      renderItem={(fez, i) => {
        const fezId = canonicalFezId(fez);
        const rowKey = fezId ?? `open-${i}`;
        const isSelected = fezId != null && selectedFezId === fezId;
        const titleColor = isSelected ? '#6F458F' : '#EFECE2';
        const iconColor = isSelected ? '#6F458F' : '#7A7490';
        const whenRaw =
          pickStringField(fez as Record<string, unknown>, ['startTime', 'scheduledTime', 'eventTime']) ?? '';
        const whenPretty = whenRaw ? formatMetaWhen(whenRaw) ?? whenRaw : '';
        const typeLabel = fez.fezType?.trim() || '';
        const metaLine = [typeLabel, whenPretty].filter(Boolean).join(' · ');

        return (
          <List.Item
            key={rowKey}
            style={{
              cursor: fezId ? 'pointer' : 'default',
              opacity: fezId ? 1 : 0.6,
              padding: '10px 12px',
              margin: '0 4px 4px',
              borderRadius: 8,
              background: isSelected ? 'rgba(111, 69, 143, 0.14)' : 'transparent',
              border: isSelected ? '1px solid rgba(111, 69, 143, 0.35)' : '1px solid transparent',
              color: titleColor,
            }}
            onClick={() => {
              if (fezId) onSelectFez(fezId);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', minWidth: 0 }}>
              <LfgTypeIcon fezType={fez.fezType} color={iconColor} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: titleColor,
                  }}
                >
                  {fez.title ?? fezId ?? 'LFG'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: isSelected ? '#B89BC9' : '#9A9D9A',
                    marginTop: 4,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {spotsSubtitle(fez)}
                </div>
                {metaLine ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#7A7490',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {metaLine}
                  </div>
                ) : null}
              </div>
            </div>
          </List.Item>
        );
      }}
    />
  );
}

/** Compact list for joined LFGs — low visual weight. */
function LfgJoinedList({
  rows,
  selectedFezId,
  onSelectFez,
}: {
  rows: FezRow[];
  selectedFezId: string | null;
  onSelectFez: (fezId: string) => void;
}) {
  if (rows.length === 0) {
    return <div style={{ padding: '0 12px 12px', color: '#5c5f66', fontSize: 12 }}>None yet</div>;
  }

  return (
    <List
      style={{ padding: '0 8px 12px', maxHeight: 220, overflow: 'auto' }}
      dataSource={rows}
      split={false}
      size="small"
      renderItem={(fez, i) => {
        const fezId = canonicalFezId(fez);
        const rowKey = fezId ?? `joined-${i}`;
        const isSelected = fezId != null && selectedFezId === fezId;
        return (
          <List.Item
            key={rowKey}
            style={{
              cursor: fezId ? 'pointer' : 'default',
              opacity: fezId ? 1 : 0.6,
              padding: '6px 8px',
              margin: '0 4px 2px',
              borderRadius: 6,
              background: isSelected ? 'rgba(111, 69, 143, 0.08)' : 'transparent',
              border: isSelected ? '1px solid rgba(111, 69, 143, 0.2)' : '1px solid transparent',
              fontSize: 12,
              color: isSelected ? '#C9A8D9' : '#7A7490',
            }}
            onClick={() => {
              if (fezId) onSelectFez(fezId);
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fez.title ?? fezId ?? 'LFG'}
            </span>
          </List.Item>
        );
      }}
    />
  );
}

/** Details for an LFG you have not joined — no chat UI. */
function LfgInfoPanel({ fezId }: { fezId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.fezGet.useQuery({ fezId });
  const joinMutation = trpc.fezJoin.useMutation({
    onSuccess: () => {
      utils.fezGet.invalidate({ fezId });
      utils.fezOpen.invalidate();
      utils.fezJoined.invalidate();
    },
  });

  const fez = data as FezRow | undefined;
  const root = (fez ?? {}) as Record<string, unknown>;
  const title = fez?.title ?? 'LFG';
  const typeLabel = fez?.fezType?.trim();
  const whenRaw =
    pickStringField(root, ['startTime', 'scheduledTime', 'eventTime', 'start', 'time']) ?? '';
  const when = formatMetaWhen(whenRaw) ?? whenRaw;
  const location = pickStringField(root, ['location', 'locationName', 'venue', 'meetingLocation']);
  const maxStr =
    pickStringField(root, ['maxParticipants', 'maxSize', 'capacity']) ??
    (typeof root.maxParticipants === 'number' ? String(root.maxParticipants) : undefined);
  const blurb =
    pickStringField(root, ['info', 'details', 'detail', 'description', 'body']) ??
    (() => {
      const posts = fez?.members?.posts;
      if (!Array.isArray(posts) || posts.length === 0) return undefined;
      const first = posts[0];
      if (!isRecord(first)) return undefined;
      const t = pickStringField(first, ['text', 'markdown', 'message']);
      return t;
    })();

  const participants = fez?.members?.participants ?? [];
  const displayNames = participants.map((p) => {
    const dn = p.displayName?.trim();
    if (dn) return dn;
    return p.username ?? 'Someone';
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 16 }}>
        <Spin tip="Loading LFG…" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error.message} showIcon style={{ margin: 16 }} />;
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: '28px 32px',
        background: '#1B1D23',
        color: '#EFECE2',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#EFECE2', lineHeight: 1.25 }}>{title}</h2>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: '#9A9D9A' }}>
        {typeLabel ? <div>Kind: {typeLabel}</div> : null}
        {when ? <div>When: {when}</div> : null}
        {location ? <div>Where: {location}</div> : null}
        {maxStr ? <div>Size: {maxStr}</div> : null}
        <div>
          {participantCount(fez)} {participantCount(fez) === 1 ? 'person has' : 'people have'} joined so far
        </div>
      </div>
      {blurb ? (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#7A7490', marginBottom: 8 }}>About</div>
          <div
            style={{
              fontSize: 15,
              color: '#EFECE2',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {blurb}
          </div>
        </div>
      ) : null}
      {displayNames.length > 0 ? (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#7A7490', marginBottom: 8 }}>Who&apos;s going</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#c9c5bc', fontSize: 14 }}>
            {displayNames.slice(0, 24).map((name, idx) => (
              <li key={`${name}-${idx}`} style={{ marginBottom: 4 }}>
                {name}
              </li>
            ))}
            {displayNames.length > 24 ? <li style={{ color: '#7A7490' }}>…and more</li> : null}
          </ul>
        </div>
      ) : null}
      <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Button type="primary" size="large" loading={joinMutation.isPending} onClick={() => joinMutation.mutate({ fezId })}>
          Join this LFG
        </Button>
        <span style={{ fontSize: 12, color: '#5c5f66', maxWidth: 320 }}>
          After you join, open it from &quot;Your LFGs&quot; below to chat.
        </span>
      </div>
    </div>
  );
}

function LfgThreadPanel({ fezId }: { fezId: string }) {
  const [newMessage, setNewMessage] = useState('');
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const currentUsername = useStore((s) => s.auth.username);
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const { data, isLoading, error, dataUpdatedAt } = trpc.fezGet.useQuery({ fezId });
  const postMutation = trpc.fezPostAdd.useMutation({
    onSuccess: () => {
      setNewMessage('');
      utils.fezGet.invalidate({ fezId });
      utils.fezOpen.invalidate();
    },
  });
  const unjoinMutation = trpc.fezUnjoin.useMutation({
    onSuccess: () => {
      utils.fezGet.invalidate({ fezId });
      utils.fezOpen.invalidate();
      utils.fezJoined.invalidate();
    },
  });

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, []);

  const fez = data as {
    title?: string;
    members?: {
      posts?: Array<{ postID?: number; text?: string; author?: { username?: string } }>;
      participants?: UserHeaderLike[];
    };
  } | undefined;
  const posts = fez?.members?.posts ?? [];
  const isMember = userIsParticipant(fez, currentUsername);
  const count = participantCount(fez as FezRow);

  useLayoutEffect(() => {
    if (isLoading || error) return;
    scrollToBottom();
  }, [isLoading, error, fezId, dataUpdatedAt, posts.length, scrollToBottom]);

  useEffect(() => {
    if (isLoading || error) return;
    scrollToBottom();
  }, [newMessage, isLoading, error, scrollToBottom]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !isMember) return;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', background: '#1B1D23' }}>
      <div
        style={{
          padding: '16px 24px',
          flexShrink: 0,
          background: '#1B1D23',
          borderBottom: '1px solid #3d4149',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#EFECE2' }}>{fez?.title ?? 'LFG'}</h2>
          <div style={{ marginTop: 6, fontSize: 12, color: '#7A7490' }}>
            {count} participant{count === 1 ? '' : 's'}
            {isMember ? ' · You are in this group' : ''}
          </div>
        </div>
        {isMember ? (
          <Button danger loading={unjoinMutation.isPending} onClick={() => unjoinMutation.mutate({ fezId })}>
            Leave
          </Button>
        ) : null}
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
        <List
          dataSource={posts}
          split={false}
          renderItem={(post, i) => {
            const username = post.author?.username ?? '';
            const initial = username ? username.charAt(0).toUpperCase() : '?';
            const avatarSrc = postAuthorAvatarSrc(baseUrl, post);
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
                    src={avatarSrc}
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
                    <div style={{ fontSize: 12, color: '#7A7490', marginBottom: 6 }}>{username || 'Unknown'}</div>
                    <span
                      style={{
                        fontSize: 14,
                        color: '#EFECE2',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {post.text ?? ''}
                    </span>
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      </div>
      {isMember ? (
        <form
          onSubmit={handleSend}
          style={{
            display: 'flex',
            gap: 12,
            padding: '20px 24px',
            borderTop: '1px solid #3d4149',
            flexShrink: 0,
            background: '#16171C',
          }}
        >
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
      ) : (
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #3d4149',
            flexShrink: 0,
            background: '#16171C',
            color: '#7A7490',
            fontSize: 13,
          }}
        >
          You’re not a member of this chat.
        </div>
      )}
    </div>
  );
}

export function LfgView() {
  const currentUsername = useStore((s) => s.auth.username);
  const [selectedFezId, setSelectedFezId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const openQuery = trpc.fezOpen.useQuery({
    hidePast: true,
    limit: 100,
    start: 0,
  });
  const joinedQuery = trpc.fezJoined.useQuery();

  const joinedLfgRows: FezRow[] = (() => {
    const all = fezzesFromRoot(joinedQuery.data);
    return all.filter((f) => !isDirectMessageRow(f, currentUsername));
  })();

  const joinedIds = useMemo(
    () => new Set(joinedLfgRows.map(canonicalFezId).filter((id): id is string => Boolean(id))),
    [joinedLfgRows],
  );

  const openRows = fezzesFromRoot(openQuery.data);

  const baseBrowseRows = useMemo(
    () =>
      openRows.filter((f) => {
        const id = canonicalFezId(f);
        if (!id) return true;
        return !joinedIds.has(id);
      }),
    [openRows, joinedIds],
  );

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const f of baseBrowseRows) {
      const t = f.fezType?.trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseBrowseRows]);

  const filteredBrowseRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return baseBrowseRows
      .filter((f) => isFezUpcoming(f))
      .filter((f) => !typeFilter || f.fezType?.trim() === typeFilter)
      .filter((f) => !q || fezSearchBlob(f).includes(q));
  }, [baseBrowseRows, searchText, typeFilter]);

  const filtersActive = Boolean(searchText.trim() || typeFilter);
  const listEmptyLabel = filtersActive
    ? 'No listings match your filters (future LFGs only)'
    : 'No open LFG listings right now';

  const isLoadingSidebar = openQuery.isLoading || joinedQuery.isLoading;
  const sidebarError = openQuery.error ?? joinedQuery.error;

  const selectedIsJoined = selectedFezId != null && joinedIds.has(selectedFezId);

  return (
    <Layout style={{ flex: 1, minHeight: 0, background: '#1B1D23' }}>
      <Layout.Sider
        width={360}
        style={{
          background: '#2A2D34',
          borderRight: '1px solid #3d4149',
        }}
      >
        <div
          style={{
            height: '100%',
            minHeight: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #3d4149',
            fontWeight: 600,
            fontSize: 14,
            color: '#EFECE2',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <IconUsersGroup size={18} stroke={1.5} style={{ color: '#6F458F' }} />
          Open LFG
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div
            style={{
              flexShrink: 0,
              padding: '10px 12px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderBottom: '1px solid #353942',
            }}
          >
            <Input
              allowClear
              placeholder="Search title or description"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ background: '#1B1D23', borderColor: '#3d4149', color: '#EFECE2' }}
            />
            <Select
              allowClear
              placeholder="All types"
              value={typeFilter ?? undefined}
              onChange={(v) => setTypeFilter(typeof v === 'string' && v.length > 0 ? v : null)}
              options={typeOptions.map((t) => ({ label: t, value: t }))}
              style={{ width: '100%' }}
              styles={{
                popup: { root: { zIndex: 1100 } },
              }}
            />
          </div>
          {isLoadingSidebar ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: 16,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Spin tip="Loading…" />
            </div>
          ) : sidebarError ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Alert type="error" message={sidebarError.message} showIcon style={{ margin: 16 }} />
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <LfgBrowseList
                rows={filteredBrowseRows}
                selectedFezId={selectedFezId}
                onSelectFez={setSelectedFezId}
                emptyLabel={listEmptyLabel}
              />
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, borderTop: '1px solid #3d4149', background: '#23262c' }}>
          <Collapse
            bordered={false}
            defaultActiveKey={[]}
            style={{ background: 'transparent' }}
            items={[
              {
                key: 'joined',
                label: (
                  <span style={{ fontSize: 12, color: '#6d7178', fontWeight: 500 }}>
                    Your LFGs{joinedLfgRows.length ? ` (${joinedLfgRows.length})` : ''}
                  </span>
                ),
                children: (
                  <LfgJoinedList rows={joinedLfgRows} selectedFezId={selectedFezId} onSelectFez={setSelectedFezId} />
                ),
              },
            ]}
          />
        </div>
        </div>
      </Layout.Sider>
      <Layout.Content
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#1B1D23',
        }}
      >
        {!selectedFezId ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7A7490',
              fontSize: 14,
            }}
          >
            Select an open LFG to see details, or expand Your LFGs to open a chat
          </div>
        ) : selectedIsJoined ? (
          <LfgThreadPanel fezId={selectedFezId} />
        ) : (
          <LfgInfoPanel fezId={selectedFezId} />
        )}
      </Layout.Content>
    </Layout>
  );
}
