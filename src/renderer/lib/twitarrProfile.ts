/** Normalize `GET /api/v3/user/profile` JSON into form fields (handles wrappers + key variants). */

export type ProfileFormDefaults = {
  displayName: string;
  preferredPronoun: string;
  realName: string;
  homeLocation: string;
  roomNumber: string;
  email: string;
  message: string;
  about: string;
  discordUsername: string;
  dinnerTeam: 'red' | 'gold' | 'sro' | null;
  headerUsername: string;
  userImage: string | undefined;
  userId: string | undefined;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** First non-empty string (or numeric coerced) among keys on `obj`. */
function pickMulti(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

/**
 * Some proxies / older responses wrap the payload; Twitarr normally returns `ProfilePublicData` at the root.
 */
function unwrapProfileRoot(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;

  const tryInner = (v: unknown): Record<string, unknown> | null => {
    if (!isRecord(v)) return null;
    if (v.header !== undefined) return v;
    if (pickMulti(v, ['username', 'user_name'])) return v;
    if (pickMulti(v, ['realName', 'real_name'])) return v;
    if (pickMulti(v, ['email'])) return v;
    return null;
  };

  for (const k of ['profile', 'userProfile', 'user_profile', 'data', 'result', 'body', 'user'] as const) {
    const inner = tryInner(raw[k]);
    if (inner) return inner;
  }

  if (raw.header !== undefined) return raw;
  return raw;
}

function normalizeUserId(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function getHeaderObject(data: Record<string, unknown>): Record<string, unknown> {
  const direct = data.header ?? data.Header ?? data.userHeader;
  if (isRecord(direct)) return direct;

  return {
    userID: data.userID ?? data.userId ?? data.user_id ?? data.id,
    username: pickMulti(data, ['username', 'user_name']),
    displayName: pickMulti(data, ['displayName', 'display_name']),
    userImage: pickMulti(data, ['userImage', 'user_image', 'avatar', 'avatarURL', 'avatarUrl']),
    preferredPronoun: pickMulti(data, ['preferredPronoun', 'preferred_pronoun', 'pronouns']),
  };
}

function parseDinnerTeam(v: unknown): 'red' | 'gold' | 'sro' | null {
  if (v === 'red' || v === 'gold' || v === 'sro') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'red' || s === 'gold' || s === 'sro') return s;
  }
  return null;
}

export function profileResponseToFormDefaults(raw: unknown): ProfileFormDefaults {
  const data = unwrapProfileRoot(raw);
  if (!data) {
    return {
      displayName: '',
      preferredPronoun: '',
      realName: '',
      homeLocation: '',
      roomNumber: '',
      email: '',
      message: '',
      about: '',
      discordUsername: '',
      dinnerTeam: null,
      headerUsername: '',
      userImage: undefined,
      userId: undefined,
    };
  }

  const header = getHeaderObject(data);

  const displayName =
    pickMulti(header, ['displayName', 'display_name']) || pickMulti(data, ['displayName', 'display_name']);
  const preferredPronoun =
    pickMulti(header, ['preferredPronoun', 'preferred_pronoun', 'pronouns']) ||
    pickMulti(data, ['preferredPronoun', 'preferred_pronoun', 'pronouns']);

  const userImageRaw = pickMulti(header, ['userImage', 'user_image', 'avatar', 'avatarURL', 'avatarUrl']);
  const userId =
    normalizeUserId(header.userID) ??
    normalizeUserId(header.userId) ??
    normalizeUserId(header.user_id) ??
    normalizeUserId(data.userID) ??
    normalizeUserId(data.userId) ??
    normalizeUserId(data.user_id);

  return {
    displayName,
    preferredPronoun,
    realName: pickMulti(data, ['realName', 'real_name']),
    homeLocation: pickMulti(data, ['homeLocation', 'home_location']),
    roomNumber: pickMulti(data, ['roomNumber', 'room_number', 'cabin']),
    email: pickMulti(data, ['email']),
    message: pickMulti(data, ['message', 'greeting', 'profileMessage']),
    about: pickMulti(data, ['about', 'bio', 'description']),
    discordUsername: pickMulti(data, ['discordUsername', 'discord_username']),
    dinnerTeam: parseDinnerTeam(data.dinnerTeam ?? data.dinner_team),
    headerUsername: pickMulti(header, ['username', 'user_name']) || pickMulti(data, ['username', 'user_name']),
    userImage: userImageRaw || undefined,
    userId,
  };
}
