/** Twitarr `UserHeader` as returned on fez member lists. */
export type UserHeaderLike = {
  userID?: string;
  username?: string;
  displayName?: string | null;
};

/** Row shape from Twitarr `GET /fez/joined` (FezData list). */
export type FezJoinedRow = {
  fezID?: string;
  id?: string;
  title?: string;
  members?: {
    postCount?: number;
    readCount?: number;
    isMuted?: boolean;
    participants?: UserHeaderLike[];
  };
};

/** Unread posts in a seamail thread: postCount − readCount (Twitarr FezData.members). */
export function seamailUnreadCount(fez: FezJoinedRow): number {
  const m = fez.members;
  if (!m || m.isMuted) return 0;
  const postCount = m.postCount ?? 0;
  const readCount = m.readCount ?? 0;
  return Math.max(0, postCount - readCount);
}

export function fezJoinedDataToList(data: unknown): FezJoinedRow[] {
  const fezzes = Array.isArray(data) ? data : (data as { fezzes?: unknown[] })?.fezzes ?? [];
  return Array.isArray(fezzes) ? (fezzes as FezJoinedRow[]) : [];
}

export function seamailTotalUnread(data: unknown): number {
  return fezJoinedDataToList(data).reduce((sum, fez) => sum + seamailUnreadCount(fez), 0);
}

function usernamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 1:1 thread: exactly two participants including the current user (Seamail DM, not LFG / group chat). */
export function isFezJoinedDirectMessage(fez: FezJoinedRow, currentUsername: string | null | undefined): boolean {
  const parts = fez.members?.participants;
  if (!parts || parts.length !== 2 || !currentUsername) return false;
  return parts.some((p) => usernamesMatch(p.username, currentUsername));
}

/** Unread count for direct-message seamail only — excludes LFG and other multi-party joined fezzes. */
export function seamailDirectMessageChatsUnreadTotal(
  data: unknown,
  currentUsername: string | null | undefined,
): number {
  if (!currentUsername) return 0;
  return fezJoinedDataToList(data)
    .filter((fez) => isFezJoinedDirectMessage(fez, currentUsername))
    .reduce((sum, fez) => sum + seamailUnreadCount(fez), 0);
}
