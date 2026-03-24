import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { List, Spin, Alert, Input, Button, Avatar, Select, Drawer, Masonry, Typography } from 'antd';
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
import { twitarrImageThumbUrl, twitarrUserIdenticonUrl } from '../lib/twitarrImage';
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
  userID?: string;
  userId?: string;
  user_id?: string;
  userImage?: string;
  user_image?: string;
};

/** Row from `GET /fez/open` or `GET /fez/joined` (FezData-like). */
type FezRow = {
  fezID?: string;
  id?: string;
  title?: string;
  fezType?: string;
  startTime?: string;
  scheduledTime?: string;
  /** Twitarr `FezData.owner` (`UserHeader`). */
  owner?: UserHeaderLike;
  members?: {
    participants?: UserHeaderLike[];
    postCount?: number;
    posts?: unknown[];
  };
};

const LFG_ICON_COMMON = { size: 20 as const, stroke: 1.5 as const };

/** Pick icon from Twitarr `fezType` label (heuristic keywords). */
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

/**
 * Future-only for open listings: must not have started yet (local clock).
 * Rows with no parseable start are kept (Twitarr often omits time for flexible LFGs).
 */
function isFezFuture(fez: FezRow, nowMs = Date.now()): boolean {
  const t = fezStartMs(fez);
  if (t == null) return true;
  return t >= nowMs - 60_000;
}

/** Local calendar day for a scheduled fez, or null when no start time is known. */
function fezLocalDayKey(fez: FezRow): string | null {
  const ms = fezStartMs(fez);
  if (ms == null) return null;
  return dayjs(ms).format('YYYY-MM-DD');
}

/** Text used for quick search (title, type, info fields, first post). */
/** `FezData.owner` or common fallbacks on the root object. */
function fezOwnerRecord(fez: FezRow): Record<string, unknown> | null {
  const r = fez as Record<string, unknown>;
  const direct = r.owner;
  if (isRecord(direct)) return direct;
  for (const k of ['organizer', 'host', 'creator', 'fezOwner', 'createdBy']) {
    const v = r[k];
    if (isRecord(v) && (typeof v.username === 'string' || pickStringField(v, ['userID', 'userId', 'user_id', 'id']))) {
      return v;
    }
  }
  return null;
}

function userHeaderDisplayLabel(user: Record<string, unknown>): string {
  const dn = pickStringField(user, ['displayName', 'display_name'])?.trim();
  if (dn) return dn;
  return pickStringField(user, ['username', 'user_name']) || 'Someone';
}

/** Avatar URL for a `UserHeader`-shaped object (same fields as seamail post `author`). */
function twitarrAvatarForUserHeader(baseUrl: string, user: unknown): string | undefined {
  if (!baseUrl || !isRecord(user)) return undefined;
  const img = pickStringField(user, ['userImage', 'user_image', 'image', 'avatarURL', 'avatarUrl', 'avatar']);
  if (img) return twitarrImageThumbUrl(baseUrl, img);
  const uid = pickStringField(user, ['userID', 'userId', 'user_id', 'id']);
  if (uid) return twitarrUserIdenticonUrl(baseUrl, uid);
  return undefined;
}

function fezSearchBlob(fez: FezRow): string {
  const r = fez as Record<string, unknown>;
  const parts: string[] = [];
  if (fez.title) parts.push(fez.title);
  if (fez.fezType) parts.push(fez.fezType);
  const ownerRec = fezOwnerRecord(fez);
  if (ownerRec) {
    parts.push(userHeaderDisplayLabel(ownerRec));
    const u = pickStringField(ownerRec, ['username', 'user_name']);
    if (u) parts.push(u);
  }
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

function coerceNonNegativeInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === 'string' && v.trim()) {
    const p = parseInt(v.replace(/[^\d-]/g, ''), 10);
    if (!Number.isNaN(p) && p >= 0) return p;
  }
  return null;
}

/**
 * Participant count when the API includes it. Returns null if `members.participants` is absent
 * and no known count field exists — avoids showing 0 for "unknown" on `/fez/open` summaries.
 */
function joinedParticipantCount(fez: FezRow | undefined): number | null {
  if (!fez) return null;
  const parts = fez.members?.participants;
  if (Array.isArray(parts)) return parts.length;

  const r = fez as Record<string, unknown>;
  const rootKeys = [
    'participantCount',
    'participant_count',
    'memberCount',
    'member_count',
    'currentParticipantCount',
    'current_participant_count',
    'joinedCount',
    'joined_count',
    'attendeeCount',
    'attendee_count',
    'numberOfParticipants',
    'numParticipants',
  ];
  for (const k of rootKeys) {
    const n = coerceNonNegativeInt(r[k]);
    if (n != null) return n;
  }
  const mem = r.members;
  if (isRecord(mem)) {
    for (const k of ['participantCount', 'count', 'memberCount', 'member_count', 'size']) {
      const n = coerceNonNegativeInt(mem[k]);
      if (n != null) return n;
    }
  }
  return null;
}

/** For views that always need a number (e.g. thread header after fezGet). */
function joinedParticipantCountOrZero(fez: FezRow | undefined): number {
  return joinedParticipantCount(fez) ?? 0;
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

/** Resolve avatar URL from Twitarr fez post `author` (UserHeader-like). */
function postAuthorAvatarSrc(baseUrl: string, post: unknown): string | undefined {
  if (!baseUrl || !isRecord(post)) return undefined;
  const author = post.author;
  return twitarrAvatarForUserHeader(baseUrl, author);
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

/** Fixed label column so Kind / When / Where / Size values line up across cards. */
const LFG_META_LABEL_COL: CSSProperties = {
  width: 58,
  flexShrink: 0,
  textAlign: 'right',
  color: '#7A7490',
  fontSize: 12,
  fontWeight: 500,
};

function LfgMetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
      <span style={LFG_META_LABEL_COL}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, color: '#9A9D9A', fontSize: 13, lineHeight: 1.4 }}>{children}</span>
    </div>
  );
}

/** Shared detail body (same fields as the former right-hand info panel). */
function LfgFezDetailBody({ fez, fezId }: { fez: FezRow; fezId: string }) {
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const utils = trpc.useUtils();
  const joinMutation = trpc.fezJoin.useMutation({
    onSuccess: () => {
      utils.fezGet.invalidate({ fezId });
      utils.fezOpen.invalidate();
      utils.fezJoined.invalidate();
    },
  });

  const root = fez as Record<string, unknown>;
  const title = fez.title ?? 'LFG';
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
      const posts = fez.members?.posts;
      if (!Array.isArray(posts) || posts.length === 0) return undefined;
      const first = posts[0];
      if (!isRecord(first)) return undefined;
      const t = pickStringField(first, ['text', 'markdown', 'message']);
      return t;
    })();

  const joinedCount = joinedParticipantCount(fez);
  const joinedLine =
    joinedCount === null
      ? '—'
      : joinedCount === 0
        ? 'No one has joined yet'
        : joinedCount === 1
          ? '1 person has joined so far'
          : `${joinedCount} people have joined so far`;

  const participants = fez.members?.participants ?? [];
  const displayNames = participants.map((p) => {
    const dn = p.displayName?.trim();
    if (dn) return dn;
    return p.username ?? 'Someone';
  });

  const ownerRec = fezOwnerRecord(fez);
  const organizerName = ownerRec ? userHeaderDisplayLabel(ownerRec) : null;
  const organizerUsername = ownerRec ? pickStringField(ownerRec, ['username', 'user_name']) : '';
  const organizerAvatar = ownerRec && baseUrl ? twitarrAvatarForUserHeader(baseUrl, ownerRec) : undefined;
  const organizerInitial = (organizerUsername || organizerName || '?').charAt(0).toUpperCase();

  return (
    <div style={{ color: '#EFECE2' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <LfgTypeIcon fezType={fez.fezType} color="#6F458F" />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#EFECE2', lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          {title}
        </h2>
      </div>
      {ownerRec ? (
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#1f2228',
            border: '1px solid #353942',
            minWidth: 0,
          }}
        >
          <Avatar
            size={40}
            src={organizerAvatar}
            style={{ background: '#365563', color: '#EFECE2', borderRadius: 8, flexShrink: 0 }}
          >
            {organizerInitial}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#7A7490', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Organizer
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#EFECE2', lineHeight: 1.35 }}>
              {organizerName}
              {organizerUsername ? (
                <span style={{ fontWeight: 500, color: '#9A9D9A' }}> @{organizerUsername}</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <LfgMetaRow label="When">{when || '—'}</LfgMetaRow>
        <LfgMetaRow label="Where">{location ?? '—'}</LfgMetaRow>
        <LfgMetaRow label="Size">{maxStr ?? '—'}</LfgMetaRow>
        <LfgMetaRow label="Joined">{joinedLine}</LfgMetaRow>
      </div>
      {blurb ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7A7490', marginBottom: 6 }}>About</div>
          <div
            style={{
              fontSize: 14,
              color: '#EFECE2',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {blurb}
          </div>
        </div>
      ) : null}
      {displayNames.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7A7490', marginBottom: 6 }}>Who&apos;s going</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#c9c5bc', fontSize: 13 }}>
            {displayNames.slice(0, 24).map((name, idx) => (
              <li key={`${name}-${idx}`} style={{ marginBottom: 3 }}>
                {name}
              </li>
            ))}
            {displayNames.length > 24 ? <li style={{ color: '#7A7490' }}>…and more</li> : null}
          </ul>
        </div>
      ) : null}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button type="primary" size="middle" loading={joinMutation.isPending} onClick={() => joinMutation.mutate({ fezId })}>
          Join this LFG
        </Button>
        <span style={{ fontSize: 11, color: '#5c5f66', lineHeight: 1.4 }}>
          After you join, use &quot;Your LFGs&quot; above to open the chat.
        </span>
      </div>
    </div>
  );
}

function LfgOpenFezCard({ fez }: { fez: FezRow }) {
  const fezId = canonicalFezId(fez);
  if (!fezId) {
    return (
      <div
        style={{
          border: '1px solid #3d4149',
          borderRadius: 12,
          background: '#24272e',
          padding: 20,
          opacity: 0.65,
        }}
      >
        <div style={{ color: '#7A7490', fontSize: 13 }}>This listing has no id and can&apos;t be joined.</div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #3d4149',
        borderRadius: 12,
        background: '#24272e',
        padding: 20,
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <LfgFezDetailBody fez={fez} fezId={fezId} />
    </div>
  );
}

function LfgThreadPanel({ fezId }: { fezId: string }) {
  const [newMessage, setNewMessage] = useState('');
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const currentUsername = useStore((s) => s.auth.username);
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.fezGet.useQuery(
    { fezId },
    { refetchInterval: 12_000, refetchOnWindowFocus: true },
  );
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
  const count = joinedParticipantCountOrZero(fez as FezRow);

  useLayoutEffect(() => {
    if (isLoading || error) return;
    scrollToBottom();
  }, [isLoading, error, fezId, posts.length, scrollToBottom]);

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
  const [chatDrawerFezId, setChatDrawerFezId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedDay, setSelectedDay] = useState<Dayjs>(() => dayjs());

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

  const upcomingBrowseRows = useMemo(() => baseBrowseRows.filter((f) => isFezFuture(f)), [baseBrowseRows]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const f of upcomingBrowseRows) {
      const t = f.fezType?.trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [upcomingBrowseRows]);

  const preDayFiltered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return upcomingBrowseRows
      .filter((f) => !typeFilter || f.fezType?.trim() === typeFilter)
      .filter((f) => !q || fezSearchBlob(f).includes(q));
  }, [upcomingBrowseRows, searchText, typeFilter]);

  const { weekStart, weekEnd, weekDays } = useMemo(() => {
    const ws = selectedDay.startOf('week');
    return {
      weekStart: ws,
      weekEnd: ws.endOf('week'),
      weekDays: Array.from({ length: 7 }, (_, i) => ws.add(i, 'day')),
    };
  }, [selectedDay]);

  const lfgByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of preDayFiltered) {
      const k = fezLocalDayKey(f);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [preDayFiltered]);

  const datedForSelectedDay = useMemo(
    () => preDayFiltered.filter((f) => fezLocalDayKey(f) === selectedDay.format('YYYY-MM-DD')),
    [preDayFiltered, selectedDay],
  );

  const undatedListings = useMemo(
    () => preDayFiltered.filter((f) => fezLocalDayKey(f) == null),
    [preDayFiltered],
  );

  const filtersActive = Boolean(searchText.trim() || typeFilter);
  const listEmptyLabel = filtersActive
    ? 'No future listings match your filters for this view'
    : 'No future open LFG listings right now';

  const isLoading = openQuery.isLoading || joinedQuery.isLoading;
  const loadError = openQuery.error ?? joinedQuery.error;

  const datedMasonryItems = useMemo(
    () =>
      datedForSelectedDay.map((fez, i) => ({
        key: canonicalFezId(fez) ?? `lfg-dated-${i}`,
        data: fez,
      })),
    [datedForSelectedDay],
  );

  const undatedMasonryItems = useMemo(
    () =>
      undatedListings.map((fez, i) => ({
        key: canonicalFezId(fez) ?? `lfg-undated-${i}`,
        data: fez,
      })),
    [undatedListings],
  );

  const nothingToShow =
    !isLoading && !loadError && datedForSelectedDay.length === 0 && undatedListings.length === 0;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1B1D23', overflow: 'hidden' }}>
      <div
        style={{
          flexShrink: 0,
          padding: '16px 20px',
          borderBottom: '1px solid #3d4149',
          background: '#1B1D23',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: '#EFECE2',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <IconUsersGroup size={18} stroke={1.5} style={{ color: '#6F458F' }} />
          Looking for Group
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 12px',
            alignItems: 'center',
          }}
        >
          <Input
            allowClear
            placeholder="Search title or description"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              flex: '1 1 220px',
              maxWidth: 420,
              minWidth: 180,
              background: '#1B1D23',
              borderColor: '#3d4149',
              color: '#EFECE2',
            }}
          />
          <Select
            allowClear
            placeholder="All types"
            value={typeFilter ?? undefined}
            onChange={(v) => setTypeFilter(typeof v === 'string' && v.length > 0 ? v : null)}
            options={typeOptions.map((t) => ({ label: t, value: t }))}
            style={{ flex: '0 1 200px', minWidth: 160 }}
            styles={{
              popup: { root: { zIndex: 1100 } },
            }}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Your LFGs{joinedLfgRows.length ? ` (${joinedLfgRows.length})` : ''}
          </div>
          {joinedLfgRows.length === 0 ? (
            <div style={{ marginTop: 6, fontSize: 12, color: '#5c5f66' }}>None yet — join a card below to chat here.</div>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {joinedLfgRows.map((fez, i) => {
                const id = canonicalFezId(fez);
                const key = id ?? `joined-chip-${i}`;
                return (
                  <Button
                    key={key}
                    type={chatDrawerFezId === id ? 'primary' : 'default'}
                    size="small"
                    disabled={!id}
                    onClick={() => id && setChatDrawerFezId(id)}
                    style={
                      chatDrawerFezId === id
                        ? undefined
                        : {
                            background: '#2a2d34',
                            borderColor: '#3d4149',
                            color: '#B89BC9',
                          }
                    }
                  >
                    {fez.title ?? id ?? 'LFG'}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: '12px 20px 16px',
          borderBottom: '1px solid #3d4149',
          background: '#1B1D23',
        }}
      >
        <div className="events-week-toolbar">
          <Button type="text" onClick={() => setSelectedDay((d) => d.subtract(1, 'week'))} style={{ color: '#6F458F' }}>
            ← Previous week
          </Button>
          <Typography.Text strong style={{ color: '#EFECE2', fontSize: 14, flex: 1, textAlign: 'center' }}>
            {weekStart.format('MMM D')} – {weekEnd.format('MMM D, YYYY')}
          </Typography.Text>
          <Button type="text" onClick={() => setSelectedDay((d) => d.add(1, 'week'))} style={{ color: '#6F458F' }}>
            Next week →
          </Button>
          <Button size="small" onClick={() => setSelectedDay(dayjs())} style={{ marginLeft: 8 }}>
            Today
          </Button>
        </div>
        <div className="events-week-strip" role="row" aria-label="LFG listings by day" style={{ marginTop: 12 }}>
          {weekDays.map((day) => {
            const key = day.format('YYYY-MM-DD');
            const n = lfgByDay.get(key) ?? 0;
            const isSelected = selectedDay.isSame(day, 'day');
            const isToday = day.isSame(dayjs(), 'day');
            return (
              <button
                key={key}
                type="button"
                className={`events-week-day${isSelected ? ' events-week-day-selected' : ''}${
                  isToday ? ' events-week-day-today' : ''
                }`}
                onClick={() => setSelectedDay(day)}
              >
                <span className="events-week-day-dow">{day.format('ddd')}</span>
                <span className="events-week-day-num">{day.date()}</span>
                {n > 0 ? (
                  <span className="events-week-day-count" title={`${n} LFG listing(s)`}>
                    {n} LFG{n === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="events-week-day-count events-week-day-count-empty"> </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin tip="Loading…" />
          </div>
        ) : loadError ? (
          <Alert type="error" message={loadError.message} showIcon />
        ) : nothingToShow ? (
          <div style={{ color: '#7A7490', fontSize: 14, padding: 24, textAlign: 'center' }}>{listEmptyLabel}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {undatedListings.length > 0 ? (
              <div>
                <Typography.Text strong style={{ color: '#EFECE2', fontSize: 14, display: 'block', marginBottom: 12 }}>
                  No set start time
                </Typography.Text>
                <Typography.Text type="secondary" style={{ color: '#7A7490', fontSize: 12, display: 'block', marginBottom: 12 }}>
                  These listings don&apos;t include a scheduled start — they&apos;re shown for every day you select.
                </Typography.Text>
                <Masonry
                  gutter={[16, 16]}
                  columns={{ xs: 1, sm: 2, md: 2, lg: 3, xl: 3 }}
                  items={undatedMasonryItems}
                  itemRender={({ data }) => <LfgOpenFezCard fez={data} />}
                />
              </div>
            ) : null}
            <div>
              <Typography.Text strong style={{ color: '#EFECE2', fontSize: 14, display: 'block', marginBottom: 12 }}>
                {selectedDay.format('dddd, MMMM D, YYYY')}
              </Typography.Text>
              {datedForSelectedDay.length === 0 ? (
                <div style={{ color: '#7A7490', fontSize: 13 }}>
                  No scheduled LFGs on this day
                  {undatedListings.length > 0 ? ' (see flexible listings above).' : '.'}
                </div>
              ) : (
                <Masonry
                  gutter={[16, 16]}
                  columns={{ xs: 1, sm: 2, md: 2, lg: 3, xl: 3 }}
                  items={datedMasonryItems}
                  itemRender={({ data }) => <LfgOpenFezCard fez={data} />}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <Drawer
        title={null}
        placement="right"
        width={440}
        open={chatDrawerFezId != null}
        onClose={() => setChatDrawerFezId(null)}
        destroyOnClose
        styles={{
          body: {
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
          },
        }}
      >
        {chatDrawerFezId ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <LfgThreadPanel fezId={chatDrawerFezId} />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
